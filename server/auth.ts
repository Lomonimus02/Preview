import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User, UserRole } from "@shared/schema";

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
    store: storage.sessionStore,
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
      const user = await storage.getUserByUsername(username);
      if (!user || !(await comparePasswords(password, user.password))) {
        return done(null, false);
      } else {
        return done(null, user);
      }
    }),
  );

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      // Check if the user is authorized to create this type of user
      if (req.isAuthenticated()) {
        const currentUser = req.user as User;
        const newUserRole = req.body.role;
        
        // Validate permissions based on user roles
        if (currentUser.role !== UserRole.SUPER_ADMIN && 
            (newUserRole === UserRole.SUPER_ADMIN || 
             newUserRole === UserRole.SCHOOL_ADMIN && currentUser.role !== UserRole.SCHOOL_ADMIN)) {
          return res.status(403).send("У вас нет прав для создания пользователя с данной ролью");
        }
        
        // School admin can only create users for their school
        if (currentUser.role === UserRole.SCHOOL_ADMIN && 
            req.body.schoolId !== currentUser.schoolId) {
          return res.status(403).send("Вы можете создавать пользователей только для своей школы");
        }
      } else if (req.body.role !== UserRole.SUPER_ADMIN) {
        // Only allow super admin registration when not authenticated
        return res.status(403).send("Необходима авторизация для регистрации");
      }
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).send("Пользователь с таким логином уже существует");
      }

      // Create the user
      const hashedPassword = await hashPassword(req.body.password);
      const user = await storage.createUser({
        ...req.body,
        password: hashedPassword,
      });

      // Log the new user creation
      if (req.isAuthenticated()) {
        const currentUser = req.user as User;
        await storage.createSystemLog({
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
    await storage.createSystemLog({
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
      await storage.createSystemLog({
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
