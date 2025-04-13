import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { dbStorage } from "./db-storage";

// Используем хранилище БД для всех операций
const dataStorage = dbStorage;
import { User, UserRoleEnum } from "@shared/schema";

// Use type augmentation for Express session
declare module 'express-session' {
  interface SessionData {
    passport: {
      user: number; // User ID
    };
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  // Check if the stored password is already hashed (has a salt)
  if (stored.includes(".")) {
    const [hashed, salt] = stored.split(".");
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
    return timingSafeEqual(hashedBuf, suppliedBuf);
  } else {
    // For plaintext passwords (like initial admin user), do a direct comparison
    return supplied === stored;
  }
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "school-management-secret",
    resave: false,
    saveUninitialized: false,
    store: dataStorage.sessionStore,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      const user = await dataStorage.getUserByUsername(username);
      if (!user || !(await comparePasswords(password, user.password))) {
        return done(null, false);
      } else {
        return done(null, user);
      }
    }),
  );

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await dataStorage.getUser(id);
      if (!user) {
        // Если пользователь не найден, возвращаем ошибку
        return done(new Error(`User with id ${id} not found`), null);
      }

      // Получаем все роли пользователя
      const userRoles = await dataStorage.getUserRoles(id);
      
      // Если у пользователя есть активная роль, проверяем её наличие в списке доступных ролей
      if (user.activeRole) {
        const activeRoleExists = userRoles.some(role => role.role === user.activeRole);
        
        // Если активная роль не существует в списке доступных ролей, выбираем первую доступную
        if (!activeRoleExists && userRoles.length > 0) {
          const newActiveRole = userRoles[0].role;
          console.log(`Активная роль ${user.activeRole} не найдена для пользователя ${user.username}, переключаем на ${newActiveRole}`);
          
          // Обновляем активную роль в базе данных
          await dataStorage.updateUser(id, { activeRole: newActiveRole });
          
          // Обновляем объект пользователя
          user.activeRole = newActiveRole;
        }
      } else if (userRoles.length > 0) {
        // Если активная роль не установлена, устанавливаем первую доступную
        const newActiveRole = userRoles[0].role;
        console.log(`Активная роль не установлена для пользователя ${user.username}, устанавливаем ${newActiveRole}`);
        
        // Обновляем активную роль в базе данных
        await dataStorage.updateUser(id, { activeRole: newActiveRole });
        
        // Обновляем объект пользователя
        user.activeRole = newActiveRole;
      }
      
      return done(null, user);
    } catch (error) {
      console.error("Error during user deserialization:", error);
      return done(error, null);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      // Check if the user is authorized to create this type of user
      if (req.isAuthenticated()) {
        const currentUser = req.user as User;
        const newUserRole = req.body.role;
        
        // Validate permissions based on user roles
        if (currentUser.role !== UserRoleEnum.SUPER_ADMIN && 
            (newUserRole === UserRoleEnum.SUPER_ADMIN || 
             newUserRole === UserRoleEnum.SCHOOL_ADMIN && currentUser.role !== UserRoleEnum.SCHOOL_ADMIN)) {
          return res.status(403).send("У вас нет прав для создания пользователя с данной ролью");
        }
        
        // School admin can only create users for their school
        if (currentUser.role === UserRoleEnum.SCHOOL_ADMIN && 
            req.body.schoolId !== currentUser.schoolId) {
          return res.status(403).send("Вы можете создавать пользователей только для своей школы");
        }
      } else {
        // Check if there are any users in the system
        const usersCount = await dataStorage.getUsersCount();
        if (usersCount > 0 && req.body.role === UserRoleEnum.SUPER_ADMIN) {
          return res.status(403).send("Супер-администратор уже существует");
        }
        if (usersCount > 0 && req.body.role !== UserRoleEnum.SUPER_ADMIN) {
          return res.status(403).send("Необходима авторизация для регистрации");
        }
      }
      
      // Check if username already exists
      const existingUser = await dataStorage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).send("Пользователь с таким логином уже существует");
      }

      // Create the user
      const hashedPassword = await hashPassword(req.body.password);
      const user = await dataStorage.createUser({
        ...req.body,
        password: hashedPassword,
      });

      // Log the new user creation
      if (req.isAuthenticated()) {
        const currentUser = req.user as User;
        await dataStorage.createSystemLog({
          userId: currentUser.id,
          action: "user_created",
          details: `Created user ${user.username} with role ${user.role}`,
          ipAddress: req.ip
        });
      }

      // If not already authenticated, log the new user in
      if (!req.isAuthenticated()) {
        req.login(user, (err) => {
          if (err) return next(err);
          res.status(201).json(user);
        });
      } else {
        res.status(201).json(user);
      }
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", passport.authenticate("local"), async (req, res) => {
    // Log the login
    const user = req.user as User;
    await dataStorage.createSystemLog({
      userId: user.id,
      action: "user_login",
      details: `User ${user.username} logged in`,
      ipAddress: req.ip
    });
    
    res.status(200).json(req.user);
  });

  app.post("/api/logout", async (req, res, next) => {
    if (req.isAuthenticated()) {
      const user = req.user as User;
      
      // Log the logout
      await dataStorage.createSystemLog({
        userId: user.id,
        action: "user_logout",
        details: `User ${user.username} logged out`,
        ipAddress: req.ip
      });
    }
    
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
}
