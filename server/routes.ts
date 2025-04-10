import type { Express } from "express";
import { createServer, type Server } from "http";
import { dbStorage } from "./db-storage";
import { db } from "./db";

// Используем хранилище БД для всех операций
const dataStorage = dbStorage;
import { setupAuth } from "./auth";
import { z } from "zod";
import { UserRoleEnum } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes
  setupAuth(app);

  // Middleware to check if user is authenticated
  const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
      return next();
    }
    res.status(401).json({ message: "Unauthorized" });
  };
  
  // Middleware to check if user has specific role
  const hasRole = (roles: UserRoleEnum[]) => async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    // Проверяем активную роль пользователя, если она установлена
    if (req.user.activeRole && roles.includes(req.user.activeRole)) {
      return next();
    }
    
    // Если активной роли нет или она не подходит, проверяем все роли пользователя
    if (req.user.role === UserRoleEnum.SUPER_ADMIN) {
      return next();
    }
    
    if (roles.includes(req.user.role)) {
      return next();
    }
    
    // Проверка через базу данных (для многоролевых пользователей)
    try {
      const userRoles = await dataStorage.getUserRoles(req.user.id);
      if (userRoles.some(r => roles.includes(r.role as UserRoleEnum))) {
        return next();
      }
    } catch (error) {
      console.error("Error checking user roles:", error);
    }
    
    return res.status(403).json({ message: "Forbidden - Insufficient permissions" });
  };
  
  // Subgroups API
  app.get("/api/subgroups", isAuthenticated, async (req, res) => {
    try {
      const { classId, schoolId } = req.query;
      let subgroups = [];
      
      if (classId) {
        // Get subgroups for a specific class
        subgroups = await dataStorage.getSubgroupsByClass(Number(classId));
      } else if (schoolId) {
        // Get all subgroups for a school
        subgroups = await dataStorage.getSubgroupsBySchool(Number(schoolId));
      } else if (req.user.role === UserRoleEnum.SUPER_ADMIN) {
        // Super admin can see all subgroups from all schools
        const schools = await dataStorage.getSchools();
        for (const school of schools) {
          const schoolSubgroups = await dataStorage.getSubgroupsBySchool(school.id);
          subgroups.push(...schoolSubgroups);
        }
      } else if (req.user.role === UserRoleEnum.SCHOOL_ADMIN || 
                req.user.role === UserRoleEnum.PRINCIPAL || 
                req.user.role === UserRoleEnum.VICE_PRINCIPAL) {
        // School administrators can see all subgroups in their school
        if (req.user.schoolId) {
          subgroups = await dataStorage.getSubgroupsBySchool(req.user.schoolId);
        }
      } else if (req.user.role === UserRoleEnum.TEACHER || 
                req.user.role === UserRoleEnum.CLASS_TEACHER) {
        // Учителя должны видеть подгруппы в своих занятиях
        // Получаем все расписания преподавателя
        const schedules = await dataStorage.getSchedulesByTeacher(req.user.id);
        
        // Собираем все subgroupId из расписаний
        const subgroupIds = new Set<number>();
        const classIds = new Set<number>();
        
        for (const schedule of schedules) {
          // Если в расписании есть подгруппа, добавляем её идентификатор
          if (schedule.subgroupId) {
            subgroupIds.add(schedule.subgroupId);
          }
          // Также собираем все классы, в которых преподаёт учитель
          if (schedule.classId) {
            classIds.add(schedule.classId);
          }
        }
        
        // Если есть подгруппы в расписании, получаем их
        if (subgroupIds.size > 0) {
          for (const subgroupId of subgroupIds) {
            const subgroup = await dataStorage.getSubgroup(subgroupId);
            if (subgroup) {
              subgroups.push(subgroup);
            }
          }
        }
        
        // Если учитель преподаёт в классах, получаем все подгруппы для этих классов
        if (subgroups.length === 0 && classIds.size > 0) {
          for (const classId of classIds) {
            const classSubgroups = await dataStorage.getSubgroupsByClass(classId);
            subgroups.push(...classSubgroups);
          }
        }
      } else if (req.user.role === UserRoleEnum.STUDENT) {
        // Students can see their own subgroups
        subgroups = await dataStorage.getStudentSubgroups(req.user.id);
      }
      
      // Логируем количество найденных подгрупп для отладки
      console.log(`Found ${subgroups.length} subgroups for ${req.user.role} with ID ${req.user.id}`);
      
      res.json(subgroups);
    } catch (error) {
      console.error("Error fetching subgroups:", error);
      res.status(500).json({ message: "Failed to fetch subgroups" });
    }
  });
  
  app.get("/api/subgroups/:id", isAuthenticated, async (req, res) => {
    try {
      const subgroupId = parseInt(req.params.id);
      const subgroup = await dataStorage.getSubgroup(subgroupId);
      
      if (!subgroup) {
        return res.status(404).json({ message: "Subgroup not found" });
      }
      
      res.json(subgroup);
    } catch (error) {
      console.error("Error fetching subgroup:", error);
      res.status(500).json({ message: "Failed to fetch subgroup" });
    }
  });
  
  app.post("/api/subgroups", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    try {
      console.log("Создание подгруппы. Request body:", req.body);
      
      // Ensure the user has access to the school
      if (req.user.role === UserRoleEnum.SCHOOL_ADMIN && req.body.schoolId !== req.user.schoolId) {
        console.log("Доступ запрещен: школа в запросе не соответствует школе администратора");
        return res.status(403).json({ message: "You can only create subgroups in your own school" });
      }
      
      // Проверяем, что все необходимые поля присутствуют
      if (!req.body.name || !req.body.classId || !req.body.schoolId) {
        console.log("Отсутствуют обязательные поля:", { body: req.body });
        return res.status(400).json({ 
          message: "Missing required fields", 
          received: req.body,
          required: ["name", "classId", "schoolId"] 
        });
      }
      
      const subgroupData = {
        name: req.body.name,
        classId: req.body.classId,
        schoolId: req.body.schoolId,
        description: req.body.description || null
      };
      
      console.log("Подготовленные данные для создания подгруппы:", subgroupData);
      
      const newSubgroup = await dataStorage.createSubgroup(subgroupData);
      console.log("Созданная подгруппа:", newSubgroup);
      
      // Log the action
      await dataStorage.createSystemLog({
        userId: req.user.id,
        action: "subgroup_created",
        details: `Created subgroup: ${newSubgroup.name} for class ID: ${newSubgroup.classId}`,
        ipAddress: req.ip
      });
      
      res.status(201).json(newSubgroup);
    } catch (error) {
      console.error("Error creating subgroup:", error);
      res.status(500).json({ message: "Failed to create subgroup", error: error.message });
    }
  });
  
  app.patch("/api/subgroups/:id", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    try {
      const subgroupId = parseInt(req.params.id);
      const subgroup = await dataStorage.getSubgroup(subgroupId);
      
      if (!subgroup) {
        return res.status(404).json({ message: "Subgroup not found" });
      }
      
      // Verify that school admin only updates subgroups in their own school
      if (req.user.role === UserRoleEnum.SCHOOL_ADMIN) {
        const classData = await dataStorage.getClass(subgroup.classId);
        if (!classData || classData.schoolId !== req.user.schoolId) {
          return res.status(403).json({ message: "You can only update subgroups in your own school" });
        }
      }
      
      const updatedSubgroup = await dataStorage.updateSubgroup(subgroupId, req.body);
      
      // Log the action
      await dataStorage.createSystemLog({
        userId: req.user.id,
        action: "subgroup_updated",
        details: `Updated subgroup ID: ${subgroupId}, Name: ${updatedSubgroup?.name}`,
        ipAddress: req.ip
      });
      
      res.json(updatedSubgroup);
    } catch (error) {
      console.error("Error updating subgroup:", error);
      res.status(500).json({ message: "Failed to update subgroup" });
    }
  });
  
  app.delete("/api/subgroups/:id", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    try {
      const subgroupId = parseInt(req.params.id);
      const subgroup = await dataStorage.getSubgroup(subgroupId);
      
      if (!subgroup) {
        return res.status(404).json({ message: "Subgroup not found" });
      }
      
      // Verify that school admin only deletes subgroups in their own school
      if (req.user.role === UserRoleEnum.SCHOOL_ADMIN) {
        const classData = await dataStorage.getClass(subgroup.classId);
        if (!classData || classData.schoolId !== req.user.schoolId) {
          return res.status(403).json({ message: "You can only delete subgroups in your own school" });
        }
      }
      
      const deletedSubgroup = await dataStorage.deleteSubgroup(subgroupId);
      
      // Log the action
      await dataStorage.createSystemLog({
        userId: req.user.id,
        action: "subgroup_deleted",
        details: `Deleted subgroup ID: ${subgroupId}, Name: ${deletedSubgroup?.name}`,
        ipAddress: req.ip
      });
      
      res.json(deletedSubgroup);
    } catch (error) {
      console.error("Error deleting subgroup:", error);
      res.status(500).json({ message: "Failed to delete subgroup" });
    }
  });
  
  // Student-Subgroup Association API
  app.get("/api/student-subgroups", isAuthenticated, async (req, res) => {
    try {
      let result = [];
      
      if (req.query.subgroupId) {
        // Get all students in a specific subgroup
        const subgroupId = parseInt(req.query.subgroupId as string);
        const students = await dataStorage.getSubgroupStudents(subgroupId);
        
        result = students.map(student => ({
          studentId: student.id,
          subgroupId
        }));
      } else if (req.query.studentId) {
        // Get all subgroups for a specific student
        const studentId = parseInt(req.query.studentId as string);
        const subgroups = await dataStorage.getStudentSubgroups(studentId);
        
        console.log(`Found ${subgroups.length} subgroups for student with ID ${studentId}`);
        
        result = subgroups.map(subgroup => ({
          studentId,
          subgroupId: subgroup.id
        }));
      } else {
        // If no specific filters provided, directly query the database for all student-subgroup associations
        // This is more efficient than looping through all schools and subgroups
        
        try {
          // Direct query to get all student-subgroup associations
          const { rows } = await db.execute(
            `SELECT student_id AS "studentId", subgroup_id AS "subgroupId" FROM student_subgroups`
          );
          
          result = rows;
        } catch (dbError) {
          console.error("Error querying student_subgroups table:", dbError);
          // Fallback to the old method if direct query fails
          const schools = await dataStorage.getSchools();
          for (const school of schools) {
            const schoolSubgroups = await dataStorage.getSubgroupsBySchool(school.id);
            
            // For each subgroup, get all students
            for (const subgroup of schoolSubgroups) {
              const students = await dataStorage.getSubgroupStudents(subgroup.id);
              
              // Add student-subgroup associations to result
              students.forEach(student => {
                result.push({
                  studentId: student.id,
                  subgroupId: subgroup.id
                });
              });
            }
          }
        }
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error fetching student-subgroup associations:", error);
      res.status(500).json({ message: "Failed to fetch student-subgroup associations" });
    }
  });
  
  app.post("/api/student-subgroups", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    try {
      const { studentId, subgroupId } = req.body;
      
      if (!studentId || !subgroupId) {
        return res.status(400).json({ message: "studentId and subgroupId are required" });
      }
      
      // Check if subgroup exists
      const subgroup = await dataStorage.getSubgroup(subgroupId);
      if (!subgroup) {
        return res.status(404).json({ message: "Subgroup not found" });
      }
      
      // Check if student exists
      const student = await dataStorage.getUser(studentId);
      if (!student || student.role !== UserRoleEnum.STUDENT) {
        return res.status(404).json({ message: "Student not found" });
      }
      
      // Verify that school admin only adds students to subgroups in their own school
      if (req.user.role === UserRoleEnum.SCHOOL_ADMIN) {
        const classData = await dataStorage.getClass(subgroup.classId);
        if (!classData || classData.schoolId !== req.user.schoolId) {
          return res.status(403).json({ message: "You can only add students to subgroups in your own school" });
        }
        
        if (student.schoolId !== req.user.schoolId) {
          return res.status(403).json({ message: "You can only add students from your own school" });
        }
      }
      
      // Ensure student belongs to the class that this subgroup is for
      const studentClasses = await dataStorage.getStudentClasses(studentId);
      const isInClass = studentClasses.some(cls => cls.id === subgroup.classId);
      
      if (!isInClass) {
        return res.status(400).json({ 
          message: "Student must belong to the class that this subgroup is for" 
        });
      }
      
      // Add student to subgroup
      const result = await dataStorage.addStudentToSubgroup({ studentId, subgroupId });
      
      // Log the action
      await dataStorage.createSystemLog({
        userId: req.user.id,
        action: "student_added_to_subgroup",
        details: `Added student ID: ${studentId} to subgroup ID: ${subgroupId}`,
        ipAddress: req.ip
      });
      
      res.status(201).json(result);
    } catch (error) {
      console.error("Error adding student to subgroup:", error);
      res.status(500).json({ message: "Failed to add student to subgroup" });
    }
  });
  
  app.delete("/api/student-subgroups", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    try {
      const { studentId, subgroupId } = req.query;
      
      if (!studentId || !subgroupId) {
        return res.status(400).json({ message: "studentId and subgroupId are required" });
      }
      
      const studentIdNum = parseInt(studentId as string);
      const subgroupIdNum = parseInt(subgroupId as string);
      
      // Check if subgroup exists
      const subgroup = await dataStorage.getSubgroup(subgroupIdNum);
      if (!subgroup) {
        return res.status(404).json({ message: "Subgroup not found" });
      }
      
      // Verify that school admin only removes students from subgroups in their own school
      if (req.user.role === UserRoleEnum.SCHOOL_ADMIN) {
        const classData = await dataStorage.getClass(subgroup.classId);
        if (!classData || classData.schoolId !== req.user.schoolId) {
          return res.status(403).json({ message: "You can only remove students from subgroups in your own school" });
        }
      }
      
      await dataStorage.removeStudentFromSubgroup(studentIdNum, subgroupIdNum);
      
      // Log the action
      await dataStorage.createSystemLog({
        userId: req.user.id,
        action: "student_removed_from_subgroup",
        details: `Removed student ID: ${studentIdNum} from subgroup ID: ${subgroupIdNum}`,
        ipAddress: req.ip
      });
      
      res.status(200).json({ message: "Student removed from subgroup successfully" });
    } catch (error) {
      console.error("Error removing student from subgroup:", error);
      res.status(500).json({ message: "Failed to remove student from subgroup" });
    }
  });
  
  // API для смены активной роли
  app.post("/api/switch-role", isAuthenticated, async (req, res) => {
    const { role } = req.body;
    
    if (!role) {
      return res.status(400).json({ message: "Role is required" });
    }
    
    try {
      // Получаем роли пользователя
      const userRoles = await dataStorage.getUserRoles(req.user.id);
      
      // Проверяем, есть ли у пользователя указанная роль
      const userRole = userRoles.find(ur => ur.role === role);
      
      if (!userRole && req.user.role !== role) {
        return res.status(403).json({ message: "Forbidden. Role not found or doesn't belong to user" });
      }
      
      // Используем роль пользователя или значение по умолчанию
      const newRole = userRole || { 
        role: req.user.role, 
        schoolId: req.user.schoolId 
      };
      
      // Обновляем активную роль пользователя
      const updatedUser = await dataStorage.updateUser(req.user.id, { 
        activeRole: newRole.role,
        // Если роль привязана к школе, обновляем и schoolId
        schoolId: newRole.schoolId
      });
      
      // Обновляем данные пользователя в сессии
      req.user.activeRole = newRole.role;
      req.user.schoolId = newRole.schoolId;
      
      // Создаем запись о действии пользователя
      await dataStorage.createSystemLog({
        userId: req.user.id,
        action: "role_switched",
        details: `User switched to role: ${newRole.role}`,
        ipAddress: req.ip
      });
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error switching role:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  // Альтернативный API для смены активной роли (поддержка PUT /api/users/{id}/active-role)
  app.put("/api/users/:id/active-role", isAuthenticated, async (req, res) => {
    const userId = parseInt(req.params.id);
    const { activeRole } = req.body;
    
    // Проверяем доступ
    if (userId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden. You can only change your own role" });
    }
    
    if (!activeRole) {
      return res.status(400).json({ message: "Active role is required" });
    }
    
    try {
      // Перенаправляем запрос на обычный маршрут смены роли
      req.body.role = activeRole;
      return await app._router.handle(req, res);
    } catch (error) {
      console.error("Error switching role:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });



  // Schools API
  app.get("/api/schools", isAuthenticated, async (req, res) => {
    const schools = await dataStorage.getSchools();
    res.json(schools);
  });

  app.post("/api/schools", hasRole([UserRoleEnum.SUPER_ADMIN]), async (req, res) => {
    const school = await dataStorage.createSchool(req.body);
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "school_created",
      details: `Created school: ${school.name}`,
      ipAddress: req.ip
    });
    
    res.status(201).json(school);
  });

  app.get("/api/schools/:id", isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id);
    const school = await dataStorage.getSchool(id);
    
    if (!school) {
      return res.status(404).json({ message: "School not found" });
    }
    
    res.json(school);
  });

  app.put("/api/schools/:id", hasRole([UserRoleEnum.SUPER_ADMIN]), async (req, res) => {
    const id = parseInt(req.params.id);
    const updatedSchool = await dataStorage.updateSchool(id, req.body);
    
    if (!updatedSchool) {
      return res.status(404).json({ message: "School not found" });
    }
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "school_updated",
      details: `Updated school: ${updatedSchool.name}`,
      ipAddress: req.ip
    });
    
    res.json(updatedSchool);
  });

  app.delete("/api/schools/:id", hasRole([UserRoleEnum.SUPER_ADMIN]), async (req, res) => {
    const id = parseInt(req.params.id);
    const deletedSchool = await dataStorage.deleteSchool(id);
    
    if (!deletedSchool) {
      return res.status(404).json({ message: "School not found" });
    }
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "school_deleted",
      details: `Deleted school: ${deletedSchool.name}`,
      ipAddress: req.ip
    });
    
    res.json({ message: "School deleted successfully", school: deletedSchool });
  });

  // Users API
  app.get("/api/users", isAuthenticated, async (req, res) => {
    try {
      const activeRole = req.user?.activeRole || req.user?.role;
      console.log("Получение списка пользователей:");
      console.log("Роль пользователя:", activeRole);
      console.log("ID школы пользователя:", req.user?.schoolId);
      
      // Проверяем роль пользователя
      if (!activeRole) {
        return res.status(403).json({ message: "Доступ запрещен - отсутствует роль пользователя" });
      }
      
      // Супер-админ получает всех пользователей
      if (activeRole === UserRoleEnum.SUPER_ADMIN) {
        console.log("Получение всех пользователей для SUPER_ADMIN");
        const users = await dataStorage.getUsers();
        return res.json(users);
      } 
      // Школьный администратор получает пользователей своей школы
      else if (activeRole === UserRoleEnum.SCHOOL_ADMIN) {
        // Получаем ID школы из профиля пользователя или из роли
        const userRoles = await dataStorage.getUserRoles(req.user.id);
        const schoolAdminRole = userRoles.find(role => 
          role.role === UserRoleEnum.SCHOOL_ADMIN && role.schoolId
        );
        
        // Используем ID школы из профиля пользователя или из роли
        let schoolId = req.user.schoolId || (schoolAdminRole ? schoolAdminRole.schoolId : null);
        
        // Логирование для отладки
        console.log("Проверка роли администратора школы...");
        console.log("schoolId из профиля:", req.user.schoolId);
        console.log("schoolId из роли:", schoolAdminRole?.schoolId);
        console.log("Используемый schoolId:", schoolId);
        
        // Если школа не найдена даже в роли, ищем любую доступную
        if (!schoolId) {
          console.log("Не найден ID школы для администратора");
          
          // Пробуем найти первую школу
          const schools = await dataStorage.getSchools();
          console.log("Доступные школы:", schools.map(s => `${s.id}: ${s.name}`).join(", "));
          
          if (schools.length > 0) {
            schoolId = schools[0].id;
            console.log("Использование первой доступной школы:", schools[0].id, schools[0].name);
          }
        }
        
        // Если нашли ID школы, получаем пользователей
        if (schoolId) {
          console.log("Получение пользователей школы для SCHOOL_ADMIN, ID школы:", schoolId);
          const users = await dataStorage.getUsersBySchool(schoolId);
          console.log("Найдено пользователей:", users.length);
          return res.json(users);
        } else {
          return res.status(400).json({ message: "Не найдена школа администратора" });
        }
      } 
      // Для других ролей (учитель, ученик) не разрешаем доступ к полному списку пользователей
      else {
        return res.status(403).json({ message: "Недостаточно прав для просмотра списка пользователей" });
      }
    } catch (error) {
      console.error("Ошибка при получении пользователей:", error);
      return res.status(500).json({ message: "Внутренняя ошибка сервера" });
    }
  });

  // Add user API endpoint
  app.post("/api/users", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res, next) => {
    try {
      // Check if the user is authorized to create this type of user
      const currentUser = req.user;
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
      
      // Check if username already exists
      const existingUser = await dataStorage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).send("Пользователь с таким логином уже существует");
      }

      // Create the user
      const hashedPassword = await dataStorage.hashPassword(req.body.password);
      const user = await dataStorage.createUser({
        ...req.body,
        password: hashedPassword,
      });

      // Process related data (class assignments, parent-student connections, etc.)
      if (newUserRole === UserRoleEnum.CLASS_TEACHER && req.body.classIds && req.body.classIds.length > 0) {
        // Add class teacher role
        await dataStorage.addUserRole({
          userId: user.id,
          role: UserRoleEnum.CLASS_TEACHER,
          classId: req.body.classIds[0]
        });
      }

      // Log the new user creation
      await dataStorage.createSystemLog({
        userId: currentUser.id,
        action: "user_created",
        details: `Created user ${user.username} with role ${user.role}`,
        ipAddress: req.ip
      });

      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/users/:id", isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id);
    const user = await dataStorage.getUser(id);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Check permissions
    if (req.user.role !== UserRoleEnum.SUPER_ADMIN && 
        req.user.role === UserRoleEnum.SCHOOL_ADMIN && user.schoolId !== req.user.schoolId &&
        req.user.id !== id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    res.json(user);
  });

  app.put("/api/users/:id", isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id);
    const user = await dataStorage.getUser(id);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Check permissions
    if (req.user.role !== UserRoleEnum.SUPER_ADMIN && 
        !(req.user.role === UserRoleEnum.SCHOOL_ADMIN && user.schoolId === req.user.schoolId) &&
        req.user.id !== id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    // Don't allow role changes unless super admin
    if (req.body.role && req.body.role !== user.role && req.user.role !== UserRoleEnum.SUPER_ADMIN) {
      return res.status(403).json({ message: "Cannot change user role" });
    }
    
    const updatedUser = await dataStorage.updateUser(id, req.body);
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "user_updated",
      details: `Updated user: ${updatedUser?.username}`,
      ipAddress: req.ip
    });
    
    res.json(updatedUser);
  });
  
  // Delete user
  app.delete("/api/users/:id", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    const id = parseInt(req.params.id);
    const user = await dataStorage.getUser(id);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Check permissions
    if (req.user.role === UserRoleEnum.SCHOOL_ADMIN && user.schoolId !== req.user.schoolId) {
      return res.status(403).json({ message: "Вы не можете удалить пользователя из другой школы" });
    }
    
    // Don't allow deleting self
    if (req.user.id === id) {
      return res.status(403).json({ message: "Вы не можете удалить свою учетную запись" });
    }
    
    // Don't allow school admin to delete super admin
    if (req.user.role === UserRoleEnum.SCHOOL_ADMIN && user.role === UserRoleEnum.SUPER_ADMIN) {
      return res.status(403).json({ message: "Вы не можете удалить администратора системы" });
    }
    
    const deletedUser = await dataStorage.deleteUser(id);
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "user_deleted",
      details: `Deleted user: ${deletedUser?.username}`,
      ipAddress: req.ip
    });
    
    res.json({ success: true, message: "Пользователь успешно удален" });
  });

  // Classes API
  app.get("/api/classes", isAuthenticated, async (req, res) => {
    let classes = [];
    
    if (req.user.role === UserRoleEnum.SUPER_ADMIN) {
      // Get all classes from all schools
      const schools = await dataStorage.getSchools();
      for (const school of schools) {
        const schoolClasses = await dataStorage.getClasses(school.id);
        classes.push(...schoolClasses);
      }
    } else if (req.user.schoolId) {
      // Get classes for the user's school
      classes = await dataStorage.getClasses(req.user.schoolId);
    } else if (req.user.role === UserRoleEnum.STUDENT) {
      // Get classes the student is enrolled in
      classes = await dataStorage.getStudentClasses(req.user.id);
    } else if (req.user.role === UserRoleEnum.TEACHER) {
      // Get classes the teacher teaches (this is a simplification)
      const schedules = await dataStorage.getSchedulesByTeacher(req.user.id);
      const classIds = [...new Set(schedules.map(s => s.classId))];
      
      for (const classId of classIds) {
        const classObj = await dataStorage.getClass(classId);
        if (classObj) {
          classes.push(classObj);
        }
      }
    }
    
    res.json(classes);
  });
  
  // Get a specific class by ID
  app.get("/api/classes/:id", isAuthenticated, async (req, res) => {
    try {
      const classId = parseInt(req.params.id);
      if (isNaN(classId)) {
        return res.status(400).json({ message: "Invalid class ID" });
      }
      
      const classObj = await dataStorage.getClass(classId);
      if (!classObj) {
        return res.status(404).json({ message: "Class not found" });
      }
      
      // Check permissions
      if (req.user.role === UserRoleEnum.SUPER_ADMIN) {
        // Super admin can access any class
      } else if (req.user.role === UserRoleEnum.SCHOOL_ADMIN || 
                req.user.role === UserRoleEnum.PRINCIPAL || 
                req.user.role === UserRoleEnum.VICE_PRINCIPAL) {
        // School admin, principal, and vice principal can access classes in their school only
        if (classObj.schoolId !== req.user.schoolId) {
          return res.status(403).json({ message: "You can only access classes in your school" });
        }
      } else if (req.user.role === UserRoleEnum.CLASS_TEACHER) {
        // Class teacher can access their assigned class
        const userRoles = await dataStorage.getUserRoles(req.user.id);
        const classTeacherRole = userRoles.find(r => 
          r.role === UserRoleEnum.CLASS_TEACHER && r.classId === classId
        );
        
        if (!classTeacherRole) {
          return res.status(403).json({ message: "You can only access your assigned class" });
        }
      } else if (req.user.role === UserRoleEnum.TEACHER) {
        // Teacher can access classes they teach
        const schedules = await dataStorage.getSchedulesByTeacher(req.user.id);
        const teacherClassIds = [...new Set(schedules.map(s => s.classId))];
        
        if (!teacherClassIds.includes(classId)) {
          return res.status(403).json({ message: "You can only access classes you teach" });
        }
      } else if (req.user.role === UserRoleEnum.STUDENT) {
        // Student can access classes they are enrolled in
        const studentClasses = await dataStorage.getStudentClasses(req.user.id);
        const studentClassIds = studentClasses.map(c => c.id);
        
        if (!studentClassIds.includes(classId)) {
          return res.status(403).json({ message: "You can only access classes you are enrolled in" });
        }
      } else {
        return res.status(403).json({ message: "You don't have permission to access this class" });
      }
      
      res.json(classObj);
    } catch (error) {
      console.error("Error fetching class:", error);
      res.status(500).json({ message: "Failed to fetch class" });
    }
  });

  app.post("/api/classes", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    // Get the correct schoolId for the school admin
    if (req.user.role === UserRoleEnum.SCHOOL_ADMIN) {
      const schoolId = req.body.schoolId;
      // If the user doesn't have a schoolId, check if they have a role with schoolId
      if (!req.user.schoolId) {
        const userRoles = await dataStorage.getUserRoles(req.user.id);
        const schoolAdminRole = userRoles.find(role => 
          role.role === UserRoleEnum.SCHOOL_ADMIN && role.schoolId
        );
        
        if (schoolAdminRole && schoolAdminRole.schoolId) {
          // If the client didn't send a schoolId, use the one from the role
          if (!schoolId) {
            req.body.schoolId = schoolAdminRole.schoolId;
          } 
          // If the client sent a different schoolId than the one in their role, reject
          else if (schoolId !== schoolAdminRole.schoolId) {
            return res.status(403).json({ message: "You can only create classes for your school" });
          }
        } else {
          return res.status(403).json({ message: "You don't have access to any school" });
        }
      } 
      // User has schoolId in their profile
      else if (schoolId && schoolId !== req.user.schoolId) {
        return res.status(403).json({ message: "You can only create classes for your school" });
      } else if (!schoolId) {
        // If no schoolId in request, use the one from the user profile
        req.body.schoolId = req.user.schoolId;
      }
    }
    
    // Ensure we have a schoolId at this point
    if (!req.body.schoolId) {
      return res.status(400).json({ message: "School ID is required" });
    }
    
    const newClass = await dataStorage.createClass(req.body);
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "class_created",
      details: `Created class: ${newClass.name}`,
      ipAddress: req.ip
    });
    
    res.status(201).json(newClass);
  });

  // Subjects API
  app.get("/api/subjects", isAuthenticated, async (req, res) => {
    let subjects = [];
    
    if (req.user.role === UserRoleEnum.SUPER_ADMIN) {
      // Get all subjects from all schools
      const schools = await dataStorage.getSchools();
      for (const school of schools) {
        const schoolSubjects = await dataStorage.getSubjects(school.id);
        subjects.push(...schoolSubjects);
      }
    } else if (req.user.schoolId) {
      // Get subjects for the user's school
      subjects = await dataStorage.getSubjects(req.user.schoolId);
    } else if (req.user.role === UserRoleEnum.TEACHER) {
      // Get subjects the teacher teaches
      subjects = await dataStorage.getTeacherSubjects(req.user.id);
    }
    
    res.json(subjects);
  });
  
  // Get specific teacher's subjects
  app.get("/api/teacher-subjects/:teacherId", isAuthenticated, async (req, res) => {
    try {
      const teacherId = parseInt(req.params.teacherId);
      if (isNaN(teacherId)) {
        return res.status(400).json({ message: "Invalid teacher ID" });
      }
      
      const subjects = await dataStorage.getTeacherSubjects(teacherId);
      res.json(subjects);
    } catch (error) {
      console.error("Error getting teacher subjects:", error);
      res.status(500).json({ message: "Failed to get teacher subjects" });
    }
  });

  // Get a specific subject by ID
  app.get("/api/subjects/:id", isAuthenticated, async (req, res) => {
    try {
      const subjectId = parseInt(req.params.id);
      if (isNaN(subjectId)) {
        return res.status(400).json({ message: "Invalid subject ID" });
      }
      
      const subject = await dataStorage.getSubject(subjectId);
      if (!subject) {
        return res.status(404).json({ message: "Subject not found" });
      }
      
      res.json(subject);
    } catch (error) {
      console.error("Error fetching subject:", error);
      res.status(500).json({ message: "Failed to fetch subject" });
    }
  });

  app.post("/api/subjects", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    // Get the correct schoolId for the school admin
    if (req.user.role === UserRoleEnum.SCHOOL_ADMIN) {
      const schoolId = req.body.schoolId;
      // If the user doesn't have a schoolId, check if they have a role with schoolId
      if (!req.user.schoolId) {
        const userRoles = await dataStorage.getUserRoles(req.user.id);
        const schoolAdminRole = userRoles.find(role => 
          role.role === UserRoleEnum.SCHOOL_ADMIN && role.schoolId
        );
        
        if (schoolAdminRole && schoolAdminRole.schoolId) {
          // If the client didn't send a schoolId, use the one from the role
          if (!schoolId) {
            req.body.schoolId = schoolAdminRole.schoolId;
          } 
          // If the client sent a different schoolId than the one in their role, reject
          else if (schoolId !== schoolAdminRole.schoolId) {
            return res.status(403).json({ message: "You can only create subjects for your school" });
          }
        } else {
          return res.status(403).json({ message: "You don't have access to any school" });
        }
      } 
      // User has schoolId in their profile
      else if (schoolId && schoolId !== req.user.schoolId) {
        return res.status(403).json({ message: "You can only create subjects for your school" });
      } else if (!schoolId) {
        // If no schoolId in request, use the one from the user profile
        req.body.schoolId = req.user.schoolId;
      }
    }
    
    // Ensure we have a schoolId at this point
    if (!req.body.schoolId) {
      return res.status(400).json({ message: "School ID is required" });
    }
    
    const subject = await dataStorage.createSubject(req.body);
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "subject_created",
      details: `Created subject: ${subject.name}`,
      ipAddress: req.ip
    });
    
    res.status(201).json(subject);
  });

  // DELETE endpoint for subjects
  app.delete("/api/subjects/:id", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    try {
      const subjectId = parseInt(req.params.id);
      if (isNaN(subjectId)) {
        return res.status(400).json({ message: "Некорректный ID предмета" });
      }
      
      // Get the subject to check if it exists and get its school
      const subject = await dataStorage.getSubject(subjectId);
      if (!subject) {
        return res.status(404).json({ message: "Предмет не найден" });
      }
      
      // Check if school admin has permission to delete this subject
      if (req.user.role === UserRoleEnum.SCHOOL_ADMIN) {
        // Get the correct schoolId for the school admin
        let adminSchoolId = req.user.schoolId;
        
        // If user doesn't have schoolId in profile, check their roles
        if (!adminSchoolId) {
          const userRoles = await dataStorage.getUserRoles(req.user.id);
          const schoolAdminRole = userRoles.find(role => 
            role.role === UserRoleEnum.SCHOOL_ADMIN && role.schoolId
          );
          
          if (schoolAdminRole && schoolAdminRole.schoolId) {
            adminSchoolId = schoolAdminRole.schoolId;
          }
        }
        
        // Check if the subject belongs to the admin's school
        if (!adminSchoolId || subject.schoolId !== adminSchoolId) {
          return res.status(403).json({ 
            message: "Вы можете удалять только предметы вашей школы" 
          });
        }
      }
      
      // Delete the subject
      const deletedSubject = await dataStorage.deleteSubject(subjectId);
      
      // Log the action
      await dataStorage.createSystemLog({
        userId: req.user.id,
        action: "subject_deleted",
        details: `Deleted subject: ${subject.name}`,
        ipAddress: req.ip
      });
      
      res.json(deletedSubject);
    } catch (error) {
      console.error("Error deleting subject:", error);
      res.status(500).json({ message: "Не удалось удалить предмет" });
    }
  });

  // Schedule API
  app.get("/api/schedules", isAuthenticated, async (req, res) => {
    let schedules = [];
    
    // Добавляем фильтрацию по дате
    const scheduleDate = req.query.scheduleDate ? String(req.query.scheduleDate) : null;
    
    if (req.query.classId) {
      const classId = parseInt(req.query.classId as string);
      schedules = await dataStorage.getSchedulesByClass(classId);
    } else if (req.query.teacherId) {
      const teacherId = parseInt(req.query.teacherId as string);
      schedules = await dataStorage.getSchedulesByTeacher(teacherId);
    } else if (req.user.role === UserRoleEnum.SUPER_ADMIN) {
      // Супер администратор может видеть расписание всех школ
      // Получим все классы из всех школ
      const schools = await dataStorage.getSchools();
      for (const school of schools) {
        const classes = await dataStorage.getClasses(school.id);
        for (const cls of classes) {
          const classSchedules = await dataStorage.getSchedulesByClass(cls.id);
          schedules.push(...classSchedules);
        }
      }
    } else if (req.user.role === UserRoleEnum.SCHOOL_ADMIN || req.user.role === UserRoleEnum.PRINCIPAL || req.user.role === UserRoleEnum.VICE_PRINCIPAL) {
      // Школьный администратор, директор и завуч могут видеть расписание своей школы
      if (req.user.schoolId) {
        const classes = await dataStorage.getClasses(req.user.schoolId);
        for (const cls of classes) {
          const classSchedules = await dataStorage.getSchedulesByClass(cls.id);
          schedules.push(...classSchedules);
        }
      }
    } else if (req.user.role === UserRoleEnum.TEACHER) {
      schedules = await dataStorage.getSchedulesByTeacher(req.user.id);
    } else if (req.user.role === UserRoleEnum.CLASS_TEACHER) {
      // Классный руководитель видит расписание для своего класса
      // Получаем роли пользователя, чтобы найти роль классного руководителя и определить его класс
      const userRoles = await dataStorage.getUserRoles(req.user.id);
      const classTeacherRole = userRoles.find(r => r.role === UserRoleEnum.CLASS_TEACHER && r.classId);
      
      if (classTeacherRole && classTeacherRole.classId) {
        // Получаем расписание для класса
        const classSchedules = await dataStorage.getSchedulesByClass(classTeacherRole.classId);
        schedules.push(...classSchedules);
      }
    } else if (req.user.role === UserRoleEnum.STUDENT) {
      // Get all classes for the student
      const classes = await dataStorage.getStudentClasses(req.user.id);
      
      // Get student's subgroups
      const studentSubgroups = await dataStorage.getStudentSubgroups(req.user.id);
      const studentSubgroupIds = studentSubgroups.map(sg => sg.id);
      
      // Get schedules for each class
      for (const cls of classes) {
        const classSchedules = await dataStorage.getSchedulesByClass(cls.id);
        
        // Filter the schedules:
        // 1. Include if no subgroup is specified (whole class lesson)
        // 2. Include if subgroup is specified AND student is in that subgroup
        const filteredSchedules = classSchedules.filter(schedule => 
          !schedule.subgroupId || (schedule.subgroupId && studentSubgroupIds.includes(schedule.subgroupId))
        );
        
        schedules.push(...filteredSchedules);
      }
    } else if (req.user.role === UserRoleEnum.PARENT) {
      // Родители могут видеть расписание своих детей
      const parentStudents = await dataStorage.getParentStudents(req.user.id);
      for (const relation of parentStudents) {
        const studentClasses = await dataStorage.getStudentClasses(relation.studentId);
        for (const cls of studentClasses) {
          const classSchedules = await dataStorage.getSchedulesByClass(cls.id);
          schedules.push(...classSchedules);
        }
      }
    }
    
    // Фильтрация по дате, если указана
    if (scheduleDate) {
      schedules = schedules.filter(schedule => {
        // Если у нас есть поле scheduleDate в расписании, то проверяем его
        if (schedule.scheduleDate) {
          return schedule.scheduleDate === scheduleDate;
        }
        return false;
      });
    }
    
    res.json(schedules);
  });

  app.post("/api/schedules", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    // Если дата передана как строка или объект Date, преобразуем ее в правильный формат для PostgreSQL
    if (req.body.scheduleDate) {
      try {
        // Преобразуем дату в формат ISO, затем берем только часть с датой (без времени)
        const dateObj = new Date(req.body.scheduleDate);
        req.body.scheduleDate = dateObj.toISOString().split('T')[0];
      } catch (error) {
        console.error('Error processing schedule date:', error);
      }
    }
    
    // Создаем расписание
    const schedule = await dataStorage.createSchedule(req.body);
    
    try {
      // Автоматически назначаем учителя на предмет при создании расписания, если ещё не назначен
      if (req.body.teacherId && req.body.subjectId) {
        // Получаем текущие предметы учителя
        const teacherSubjects = await dataStorage.getTeacherSubjects(req.body.teacherId);
        
        // Проверяем, назначен ли учитель уже на этот предмет
        const isAlreadyAssigned = teacherSubjects.some(subject => subject.id === req.body.subjectId);
        
        // Если не назначен, то назначаем
        if (!isAlreadyAssigned) {
          await dataStorage.assignTeacherToSubject(req.body.teacherId, req.body.subjectId);
          console.log(`Teacher (ID: ${req.body.teacherId}) assigned to subject (ID: ${req.body.subjectId})`);
        }
      }
    } catch (error) {
      console.error('Error assigning teacher to subject:', error);
      // Не возвращаем ошибку, чтобы не мешать созданию расписания
    }
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "schedule_created",
      details: `Created schedule entry for ${req.body.scheduleDate || 'unspecified date'}`,
      ipAddress: req.ip
    });
    
    res.status(201).json(schedule);
  });
  
  // Удаление расписания
  app.delete("/api/schedules/:id", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    const scheduleId = parseInt(req.params.id);
    
    // Проверяем, существует ли расписание
    const schedule = await dataStorage.getSchedule(scheduleId);
    if (!schedule) {
      return res.status(404).json({ message: "Schedule not found" });
    }
    
    // Проверяем права доступа для школьного администратора (школа должна совпадать)
    if (req.user.role === UserRoleEnum.SCHOOL_ADMIN) {
      const scheduleClass = await dataStorage.getClass(schedule.classId);
      if (!scheduleClass || scheduleClass.schoolId !== req.user.schoolId) {
        return res.status(403).json({ message: "You can only delete schedules for your school" });
      }
    }
    
    // Удаляем расписание
    const deletedSchedule = await dataStorage.deleteSchedule(scheduleId);
    
    // Логируем действие
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "schedule_deleted",
      details: `Deleted schedule entry for ${schedule.scheduleDate || 'unspecified date'}, class ID: ${schedule.classId}`,
      ipAddress: req.ip
    });
    
    res.json(deletedSchedule);
  });
  
  // Обновление урока расписания
  app.patch("/api/schedules/:id", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    const scheduleId = parseInt(req.params.id);
    
    // Проверяем, существует ли расписание
    const schedule = await dataStorage.getSchedule(scheduleId);
    if (!schedule) {
      return res.status(404).json({ message: "Schedule not found" });
    }
    
    // Проверяем права доступа для школьного администратора (школа должна совпадать)
    if (req.user.role === UserRoleEnum.SCHOOL_ADMIN) {
      const scheduleClass = await dataStorage.getClass(schedule.classId);
      if (!scheduleClass || scheduleClass.schoolId !== req.user.schoolId) {
        return res.status(403).json({ message: "You can only update schedules from your school" });
      }
    }
    
    // Если дата передана как строка или объект Date, преобразуем ее в правильный формат для PostgreSQL
    if (req.body.scheduleDate) {
      try {
        const dateObj = new Date(req.body.scheduleDate);
        req.body.scheduleDate = dateObj.toISOString().split('T')[0];
      } catch (error) {
        console.error('Error processing schedule date:', error);
      }
    }
    
    const updatedSchedule = await dataStorage.updateSchedule(scheduleId, req.body);
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "schedule_updated",
      details: `Updated schedule entry ID ${scheduleId}`,
      ipAddress: req.ip
    });
    
    res.json(updatedSchedule);
  });

  // Обновление статуса урока (проведен/не проведен)
  app.patch("/api/schedules/:id/status", hasRole([UserRoleEnum.TEACHER, UserRoleEnum.CLASS_TEACHER, UserRoleEnum.SCHOOL_ADMIN, UserRoleEnum.SUPER_ADMIN, UserRoleEnum.PRINCIPAL, UserRoleEnum.VICE_PRINCIPAL]), async (req, res) => {
    const scheduleId = parseInt(req.params.id);
    const { status } = req.body;
    
    // Проверяем, существует ли расписание
    const schedule = await dataStorage.getSchedule(scheduleId);
    if (!schedule) {
      return res.status(404).json({ message: "Schedule not found" });
    }
    
    // Проверяем права доступа пользователя
    // Учитель может изменять только свои уроки
    if (req.user.role === UserRoleEnum.TEACHER && schedule.teacherId !== req.user.id) {
      return res.status(403).json({ message: "You can only update schedules where you are the teacher" });
    }
    
    // Школьный администратор может изменять уроки только в своей школе
    if (req.user.role === UserRoleEnum.SCHOOL_ADMIN) {
      const classData = await dataStorage.getClass(schedule.classId);
      if (!classData || classData.schoolId !== req.user.schoolId) {
        return res.status(403).json({ message: "You can only update schedules from your school" });
      }
    }
    
    // Проверяем, что статус валидный
    if (status !== 'conducted' && status !== 'not_conducted') {
      return res.status(400).json({ message: "Invalid status. Must be 'conducted' or 'not_conducted'" });
    }
    
    // Проверяем время урока - нельзя отметить урок как проведенный, если он еще не начался или не закончился
    if (status === 'conducted') {
      // Получаем текущую дату и время
      const now = new Date();
      
      // Создаем дату из scheduleDate, startTime и endTime
      if (schedule.scheduleDate) {
        const scheduleDate = new Date(schedule.scheduleDate);
        const currentDate = new Date();
        
        // Сравнение только даты (без учета времени)
        const isCurrentDay = scheduleDate.getFullYear() === currentDate.getFullYear() &&
                             scheduleDate.getMonth() === currentDate.getMonth() &&
                             scheduleDate.getDate() === currentDate.getDate();
        
        // Проверка времени только для уроков текущего дня
        if (isCurrentDay) {
          const [hours, minutes] = schedule.endTime.split(':').map(Number);
          const lessonEndDate = new Date(schedule.scheduleDate);
          lessonEndDate.setHours(hours, minutes, 0);
          
          // Если текущее время раньше окончания урока, нельзя отметить как проведенный
          if (now < lessonEndDate) {
            return res.status(400).json({ 
              message: "Cannot mark lesson as conducted before it ends",
              endTime: lessonEndDate
            });
          }
        }
      }
    }
    
    // Обновляем статус урока
    const updatedSchedule = await dataStorage.updateScheduleStatus(scheduleId, status);
    
    // Логируем действие
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "schedule_status_updated",
      details: `Updated schedule ${scheduleId} status to ${status}`,
      ipAddress: req.ip
    });
    
    res.json(updatedSchedule);
  });

  // Student-Class relationships API
  app.get("/api/student-classes", isAuthenticated, async (req, res) => {
    try {
      const classId = req.query.classId ? parseInt(String(req.query.classId)) : null;
      const studentId = req.query.studentId ? parseInt(String(req.query.studentId)) : null;
      
      if (!classId && !studentId) {
        return res.status(400).json({ message: "Either classId or studentId must be provided" });
      }
      
      let result = [];
      
      if (classId) {
        // Получить студентов для конкретного класса
        const students = await dataStorage.getClassStudents(classId);
        result = students.map(student => ({
          studentId: student.id,
          classId: classId
        }));
      } else if (studentId) {
        // Получить классы для конкретного студента
        const classes = await dataStorage.getStudentClasses(studentId);
        result = classes.map(classObj => ({
          studentId: studentId,
          classId: classObj.id
        }));
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error fetching student-class relationships:", error);
      res.status(500).json({ message: "Server error" });
    }
  });
  
  // Homework API
  app.get("/api/homework", isAuthenticated, async (req, res) => {
    let homework = [];
    
    if (req.query.classId) {
      const classId = parseInt(req.query.classId as string);
      homework = await dataStorage.getHomeworkByClass(classId);
    } else if (req.user.role === UserRoleEnum.TEACHER) {
      homework = await dataStorage.getHomeworkByTeacher(req.user.id);
    } else if (req.user.role === UserRoleEnum.STUDENT) {
      homework = await dataStorage.getHomeworkByStudent(req.user.id);
    }
    
    res.json(homework);
  });

  app.post("/api/homework", hasRole([UserRoleEnum.TEACHER]), async (req, res) => {
    // Получаем расписание урока, чтобы задать срок сдачи автоматически
    const scheduleId = req.body.scheduleId;
    const schedule = await dataStorage.getSchedule(scheduleId);
    
    if (!schedule) {
      return res.status(400).json({ message: "Указанный урок не найден" });
    }
    
    // Рассчитываем срок сдачи (7 дней после даты урока)
    let dueDate;
    if (schedule.scheduleDate) {
      const lessonDate = new Date(schedule.scheduleDate);
      dueDate = new Date(lessonDate);
      dueDate.setDate(dueDate.getDate() + 7); // Срок сдачи через неделю после урока
    } else {
      // Если дата урока не указана, используем текущую дату + 7 дней
      dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);
    }
    
    // Преобразуем дату в строку формата YYYY-MM-DD для хранения в БД
    const formattedDueDate = dueDate.toISOString().split('T')[0];
    
    const homework = await dataStorage.createHomework({
      ...req.body,
      teacherId: req.user.id,
      dueDate: formattedDueDate
    });
    
    // Create notifications for all students in the class
    const students = await dataStorage.getClassStudents(homework.classId);
    for (const student of students) {
      await dataStorage.createNotification({
        userId: student.id,
        title: "Новое домашнее задание",
        content: `По предмету добавлено новое задание: ${homework.title}`
      });
    }
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "homework_created",
      details: `Created homework: ${homework.title}`,
      ipAddress: req.ip
    });
    
    res.status(201).json(homework);
  });
  
  // Update homework
  app.patch("/api/homework/:id", hasRole([UserRoleEnum.TEACHER]), async (req, res) => {
    const homeworkId = parseInt(req.params.id);
    
    // Check if homework exists
    const existingHomework = await dataStorage.getHomework(homeworkId);
    if (!existingHomework) {
      return res.status(404).json({ message: "Homework not found" });
    }
    
    // Check if current user is the teacher who created this homework
    if (existingHomework.teacherId !== req.user.id) {
      return res.status(403).json({ message: "You can only update your own homework assignments" });
    }
    
    // Если в запросе присутствует дата, обработаем её
    let updateData = { ...req.body };
    
    // Если нужно обработать dueDate, переведём в строку
    if (updateData.dueDate && updateData.dueDate instanceof Date) {
      updateData.dueDate = updateData.dueDate.toISOString().split('T')[0];
    }
    
    // Update the homework
    const updatedHomework = await dataStorage.updateHomework(homeworkId, updateData);
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "homework_updated",
      details: `Updated homework: ${updatedHomework.title}`,
      ipAddress: req.ip
    });
    
    res.json(updatedHomework);
  });
  
  // Delete homework
  app.delete("/api/homework/:id", hasRole([UserRoleEnum.TEACHER]), async (req, res) => {
    const homeworkId = parseInt(req.params.id);
    
    // Check if homework exists
    const existingHomework = await dataStorage.getHomework(homeworkId);
    if (!existingHomework) {
      return res.status(404).json({ message: "Homework not found" });
    }
    
    // Check if current user is the teacher who created this homework
    if (existingHomework.teacherId !== req.user.id) {
      return res.status(403).json({ message: "You can only delete your own homework assignments" });
    }
    
    // Delete the homework
    const deletedHomework = await dataStorage.deleteHomework(homeworkId);
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "homework_deleted",
      details: `Deleted homework: ${deletedHomework.title}`,
      ipAddress: req.ip
    });
    
    res.json(deletedHomework);
  });

  // Homework submissions API
  app.get("/api/homework-submissions", isAuthenticated, async (req, res) => {
    let submissions = [];
    
    if (req.query.homeworkId) {
      const homeworkId = parseInt(req.query.homeworkId as string);
      
      // For teachers, get all submissions for this homework
      if (req.user.role === UserRoleEnum.TEACHER) {
        const homework = await dataStorage.getHomework(homeworkId);
        if (homework && homework.teacherId === req.user.id) {
          submissions = await dataStorage.getHomeworkSubmissionsByHomework(homeworkId);
        }
      }
      // For students, get only their submissions
      else if (req.user.role === UserRoleEnum.STUDENT) {
        submissions = await dataStorage.getHomeworkSubmissionsByStudent(req.user.id);
        submissions = submissions.filter(s => s.homeworkId === homeworkId);
      }
    } else if (req.user.role === UserRoleEnum.STUDENT) {
      submissions = await dataStorage.getHomeworkSubmissionsByStudent(req.user.id);
    }
    
    res.json(submissions);
  });

  app.post("/api/homework-submissions", hasRole([UserRoleEnum.STUDENT]), async (req, res) => {
    const submission = await dataStorage.createHomeworkSubmission({
      ...req.body,
      studentId: req.user.id
    });
    
    // Get the homework details
    const homework = await dataStorage.getHomework(submission.homeworkId);
    if (homework) {
      // Notify the teacher
      await dataStorage.createNotification({
        userId: homework.teacherId,
        title: "Новая сдача домашнего задания",
        content: `Ученик сдал задание: ${homework.title}`
      });
    }
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "homework_submitted",
      details: `Submitted homework`,
      ipAddress: req.ip
    });
    
    res.status(201).json(submission);
  });

  app.post("/api/homework-submissions/:id/grade", hasRole([UserRoleEnum.TEACHER]), async (req, res) => {
    const id = parseInt(req.params.id);
    const { grade, feedback } = req.body;
    
    // Validate the submission belongs to a homework assigned by this teacher
    const submission = await dataStorage.getHomeworkSubmission(id);
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }
    
    const homework = await dataStorage.getHomework(submission.homeworkId);
    if (!homework || homework.teacherId !== req.user.id) {
      return res.status(403).json({ message: "You can only grade submissions for your assignments" });
    }
    
    const gradedSubmission = await dataStorage.gradeHomeworkSubmission(id, grade, feedback);
    
    // Notify the student
    await dataStorage.createNotification({
      userId: submission.studentId,
      title: "Домашнее задание оценено",
      content: `Ваше задание "${homework.title}" оценено на ${grade}`
    });
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "homework_graded",
      details: `Graded homework submission with ${grade}`,
      ipAddress: req.ip
    });
    
    res.json(gradedSubmission);
  });

  // Grades API
  app.get("/api/grades", isAuthenticated, async (req, res) => {
    let grades = [];
    
    if (req.query.studentId) {
      const studentId = parseInt(req.query.studentId as string);
      
      // Check permissions
      if (req.user.role === UserRoleEnum.STUDENT && req.user.id !== studentId) {
        return res.status(403).json({ message: "You can only view your own grades" });
      }
      
      if (req.user.role === UserRoleEnum.PARENT) {
        // Check if the student is a child of this parent
        const relationships = await dataStorage.getParentStudents(req.user.id);
        const childIds = relationships.map(r => r.studentId);
        
        if (!childIds.includes(studentId)) {
          return res.status(403).json({ message: "You can only view your children's grades" });
        }
      }
      
      // Если указан также subjectId, фильтруем оценки по предмету
      if (req.query.subjectId) {
        const subjectId = parseInt(req.query.subjectId as string);
        const allGrades = await dataStorage.getGradesByStudent(studentId);
        grades = allGrades.filter(grade => grade.subjectId === subjectId);
      } else {
        grades = await dataStorage.getGradesByStudent(studentId);
      }
    } else if (req.query.classId) {
      const classId = parseInt(req.query.classId as string);
      
      // Teachers, school admins, principals, and vice principals can view class grades
      if ([UserRoleEnum.TEACHER, UserRoleEnum.SCHOOL_ADMIN, UserRoleEnum.PRINCIPAL, UserRoleEnum.VICE_PRINCIPAL].includes(req.user.role)) {
        // Если указан также subjectId, фильтруем оценки по предмету и классу
        if (req.query.subjectId) {
          const subjectId = parseInt(req.query.subjectId as string);
          const classGrades = await dataStorage.getGradesByClass(classId);
          grades = classGrades.filter(grade => grade.subjectId === subjectId);
        } else {
          grades = await dataStorage.getGradesByClass(classId);
        }
      } else {
        return res.status(403).json({ message: "Forbidden" });
      }
    } else if (req.query.subjectId) {
      // Если указан только subjectId, получаем все оценки по этому предмету
      const subjectId = parseInt(req.query.subjectId as string);
      if ([UserRoleEnum.TEACHER, UserRoleEnum.SCHOOL_ADMIN, UserRoleEnum.PRINCIPAL, UserRoleEnum.VICE_PRINCIPAL].includes(req.user.role)) {
        grades = await dataStorage.getGradesBySubject(subjectId);
      } else {
        return res.status(403).json({ message: "Forbidden" });
      }
    } else if (req.user.role === UserRoleEnum.STUDENT) {
      grades = await dataStorage.getGradesByStudent(req.user.id);
    }
    
    res.json(grades);
  });

  app.post("/api/grades", hasRole([UserRoleEnum.TEACHER]), async (req, res) => {
    try {
      // Если указана дата, используем её для установки createdAt
      let gradeData = { ...req.body, teacherId: req.user.id };
      
      // Если не передан scheduleId, установим его как null (опционально)
      if (gradeData.scheduleId === undefined) {
        gradeData.scheduleId = null;
      }
      
      if (gradeData.date) {
        try {
          // Преобразуем дату урока в объект Date
          const dateObj = new Date(gradeData.date);
          // Проверяем, что дата валидна
          if (!isNaN(dateObj.getTime())) {
            gradeData.createdAt = dateObj;
          }
          // Удаляем временное поле date из данных
          delete gradeData.date;
        } catch (dateError) {
          console.error('Ошибка при преобразовании даты:', dateError);
          // Если была ошибка при преобразовании, оставляем поле createdAt как есть
          // Базовое значение будет установлено на уровне БД (defaultNow)
        }
      }
      
      const grade = await dataStorage.createGrade(gradeData);
      
      // Notify the student
      await dataStorage.createNotification({
        userId: grade.studentId,
        title: "Новая оценка",
        content: `У вас новая оценка: ${grade.grade} (${grade.gradeType})`
      });
      
      // Log the action
      await dataStorage.createSystemLog({
        userId: req.user.id,
        action: "grade_created",
        details: `Created grade ${grade.grade} for student ${grade.studentId}`,
        ipAddress: req.ip
      });
      
      res.status(201).json(grade);
    } catch (error) {
      console.error('Ошибка при создании оценки:', error);
      res.status(500).json({ message: 'Не удалось создать оценку', error: error.message });
    }
  });
  
  // Обновление оценки
  app.put("/api/grades/:id", hasRole([UserRoleEnum.TEACHER]), async (req, res) => {
    try {
      const gradeId = parseInt(req.params.id);
      if (isNaN(gradeId)) {
        return res.status(400).json({ message: "Invalid grade ID" });
      }
      
      // Проверяем, существует ли оценка
      const existingGrade = await dataStorage.getGrade(gradeId);
      if (!existingGrade) {
        return res.status(404).json({ message: "Оценка не найдена" });
      }
      
      // Проверяем, имеет ли учитель право редактировать эту оценку
      if (existingGrade.teacherId !== req.user.id) {
        return res.status(403).json({ message: "Вы можете редактировать только выставленные вами оценки" });
      }
      
      let updateData = { ...req.body };
      
      // Убедимся, что scheduleId корректно обрабатывается 
      if (updateData.scheduleId === undefined) {
        // Если scheduleId не передан, сохраняем текущее значение
        updateData.scheduleId = existingGrade.scheduleId;
      }
      
      // Обновляем оценку
      const updatedGrade = await dataStorage.updateGrade(gradeId, updateData);
      
      // Уведомляем ученика об изменении оценки
      await dataStorage.createNotification({
        userId: existingGrade.studentId,
        title: "Обновление оценки",
        content: `Ваша оценка была изменена на: ${req.body.grade} (${req.body.gradeType || existingGrade.gradeType})`
      });
      
      // Логируем действие
      await dataStorage.createSystemLog({
        userId: req.user.id,
        action: "grade_updated",
        details: `Updated grade for student ${existingGrade.studentId}`,
        ipAddress: req.ip
      });
      
      res.status(200).json(updatedGrade);
    } catch (error) {
      console.error('Ошибка при обновлении оценки:', error);
      res.status(500).json({ message: 'Не удалось обновить оценку', error: error.message });
    }
  });
  
  // PATCH endpoint для частичного обновления оценки
  app.patch("/api/grades/:id", hasRole([UserRoleEnum.TEACHER]), async (req, res) => {
    try {
      const gradeId = parseInt(req.params.id);
      if (isNaN(gradeId)) {
        return res.status(400).json({ message: "Invalid grade ID" });
      }
      
      // Проверяем, существует ли оценка
      const existingGrade = await dataStorage.getGrade(gradeId);
      if (!existingGrade) {
        return res.status(404).json({ message: "Оценка не найдена" });
      }
      
      // Проверяем, имеет ли учитель право редактировать эту оценку
      if (existingGrade.teacherId !== req.user.id) {
        return res.status(403).json({ message: "Вы можете редактировать только выставленные вами оценки" });
      }
      
      const data = req.body;
      if (!data) {
        return res.status(400).json({ message: "Данные для обновления не предоставлены" });
      }
      
      // Проверяем корректность типа оценки
      if (data.gradeType) {
        const validTypes = ['classwork', 'homework', 'test', 'exam', 'project', 'Текущая', 'Контрольная', 'Экзамен', 'Практическая', 'Домашняя'];
        if (!validTypes.includes(data.gradeType)) {
          return res.status(400).json({ message: "Некорректный тип оценки" });
        }
      }
      
      const updatedGrade = await dataStorage.updateGrade(gradeId, data);
      if (!updatedGrade) {
        return res.status(404).json({ message: "Не удалось обновить оценку" });
      }
      
      res.json(updatedGrade);
    } catch (error) {
      console.error('Error updating grade:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
  
  app.delete("/api/grades/:id", hasRole([UserRoleEnum.TEACHER]), async (req, res) => {
    try {
      const gradeId = parseInt(req.params.id);
      if (isNaN(gradeId)) {
        return res.status(400).json({ message: "Invalid grade ID" });
      }
      
      // Проверяем, существует ли оценка
      const existingGrade = await dataStorage.getGrade(gradeId);
      if (!existingGrade) {
        return res.status(404).json({ message: "Оценка не найдена" });
      }
      
      // Проверяем, имеет ли учитель право удалить эту оценку
      if (existingGrade.teacherId !== req.user.id) {
        return res.status(403).json({ message: "Вы можете удалять только выставленные вами оценки" });
      }
      
      // Удаляем оценку
      await dataStorage.deleteGrade(gradeId);
      
      // Уведомляем ученика об удалении оценки
      await dataStorage.createNotification({
        userId: existingGrade.studentId,
        title: "Удаление оценки",
        content: `Ваша оценка по предмету была удалена`
      });
      
      // Логируем действие
      await dataStorage.createSystemLog({
        userId: req.user.id,
        action: "grade_deleted",
        details: `Deleted grade for student ${existingGrade.studentId}`,
        ipAddress: req.ip
      });
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Ошибка при удалении оценки:', error);
      res.status(500).json({ message: 'Не удалось удалить оценку', error: error.message });
    }
  });

  // Attendance API
  app.get("/api/attendance", isAuthenticated, async (req, res) => {
    let attendance = [];
    
    if (req.query.studentId) {
      const studentId = parseInt(req.query.studentId as string);
      
      // Check permissions
      if (req.user.role === UserRoleEnum.STUDENT && req.user.id !== studentId) {
        return res.status(403).json({ message: "You can only view your own attendance" });
      }
      
      if (req.user.role === UserRoleEnum.PARENT) {
        // Check if the student is a child of this parent
        const relationships = await dataStorage.getParentStudents(req.user.id);
        const childIds = relationships.map(r => r.studentId);
        
        if (!childIds.includes(studentId)) {
          return res.status(403).json({ message: "You can only view your children's attendance" });
        }
      }
      
      attendance = await dataStorage.getAttendanceByStudent(studentId);
    } else if (req.query.classId) {
      const classId = parseInt(req.query.classId as string);
      
      // Teachers, school admins, principals, and vice principals can view class attendance
      if ([UserRoleEnum.TEACHER, UserRoleEnum.SCHOOL_ADMIN, UserRoleEnum.PRINCIPAL, UserRoleEnum.VICE_PRINCIPAL].includes(req.user.role)) {
        attendance = await dataStorage.getAttendanceByClass(classId);
      } else {
        return res.status(403).json({ message: "Forbidden" });
      }
    } else if (req.user.role === UserRoleEnum.STUDENT) {
      attendance = await dataStorage.getAttendanceByStudent(req.user.id);
    }
    
    res.json(attendance);
  });

  app.post("/api/attendance", hasRole([UserRoleEnum.TEACHER, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    const attendance = await dataStorage.createAttendance(req.body);
    
    if (attendance.status !== "present") {
      // If student is absent or late, notify parents
      const student = await dataStorage.getUser(attendance.studentId);
      if (student) {
        const relationships = await dataStorage.getStudentParents(student.id);
        
        for (const relationship of relationships) {
          const parent = await dataStorage.getUser(relationship.parentId);
          if (parent) {
            await dataStorage.createNotification({
              userId: parent.id,
              title: "Отсутствие на уроке",
              content: `Ваш ребенок отмечен как "${attendance.status}" на уроке`
            });
          }
        }
      }
    }
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "attendance_created",
      details: `Recorded attendance for student ${attendance.studentId}: ${attendance.status}`,
      ipAddress: req.ip
    });
    
    res.status(201).json(attendance);
  });

  // Documents API
  app.get("/api/documents", isAuthenticated, async (req, res) => {
    let documents = [];
    
    if (req.query.schoolId) {
      const schoolId = parseInt(req.query.schoolId as string);
      documents = await dataStorage.getDocumentsBySchool(schoolId);
    } else if (req.query.classId) {
      const classId = parseInt(req.query.classId as string);
      documents = await dataStorage.getDocumentsByClass(classId);
    } else if (req.query.subjectId) {
      const subjectId = parseInt(req.query.subjectId as string);
      documents = await dataStorage.getDocumentsBySubject(subjectId);
    }
    
    res.json(documents);
  });

  app.post("/api/documents", isAuthenticated, async (req, res) => {
    const document = await dataStorage.createDocument({
      ...req.body,
      uploaderId: req.user.id
    });
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "document_uploaded",
      details: `Uploaded document: ${document.title}`,
      ipAddress: req.ip
    });
    
    res.status(201).json(document);
  });

  // Messages API
  app.get("/api/messages", isAuthenticated, async (req, res) => {
    // Get both sent and received messages
    const sent = await dataStorage.getMessagesBySender(req.user.id);
    const received = await dataStorage.getMessagesByReceiver(req.user.id);
    
    // Combine and sort by sent time (newest first)
    const messages = [...sent, ...received].sort((a, b) => 
      new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
    );
    
    res.json(messages);
  });

  app.post("/api/messages", isAuthenticated, async (req, res) => {
    const message = await dataStorage.createMessage({
      ...req.body,
      senderId: req.user.id
    });
    
    // Create notification for the receiver
    await dataStorage.createNotification({
      userId: message.receiverId,
      title: "Новое сообщение",
      content: "У вас новое сообщение"
    });
    
    res.status(201).json(message);
  });

  app.post("/api/messages/:id/read", isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id);
    const message = await dataStorage.getMessage(id);
    
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }
    
    // Ensure the user is the receiver
    if (message.receiverId !== req.user.id) {
      return res.status(403).json({ message: "You can only mark your own messages as read" });
    }
    
    const updatedMessage = await dataStorage.markMessageAsRead(id);
    res.json(updatedMessage);
  });

  // Notifications API
  app.get("/api/notifications", isAuthenticated, async (req, res) => {
    const notifications = await dataStorage.getNotificationsByUser(req.user.id);
    
    // Sort by creation time (newest first)
    notifications.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    res.json(notifications);
  });

  app.post("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id);
    const notification = await dataStorage.getNotification(id);
    
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    
    // Ensure the notification belongs to the user
    if (notification.userId !== req.user.id) {
      return res.status(403).json({ message: "You can only mark your own notifications as read" });
    }
    
    const updatedNotification = await dataStorage.markNotificationAsRead(id);
    res.json(updatedNotification);
  });

  // System logs API (only for super admin)
  app.get("/api/system-logs", hasRole([UserRoleEnum.SUPER_ADMIN]), async (req, res) => {
    const logs = await dataStorage.getSystemLogs();
    
    // Sort by creation time (newest first)
    logs.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    res.json(logs);
  });

  // Student-class relationships
  app.post("/api/student-classes", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    const { studentId, classId } = req.body;
    
    // Validate input
    if (!studentId || !classId) {
      return res.status(400).json({ message: "Student ID and Class ID are required" });
    }
    
    // Check if student and class exist
    const student = await dataStorage.getUser(studentId);
    const classObj = await dataStorage.getClass(classId);
    
    if (!student || student.role !== UserRoleEnum.STUDENT) {
      return res.status(404).json({ message: "Student not found" });
    }
    
    if (!classObj) {
      return res.status(404).json({ message: "Class not found" });
    }
    
    // School admin can only add students to classes in their school
    if (req.user.role === UserRoleEnum.SCHOOL_ADMIN && classObj.schoolId !== req.user.schoolId) {
      return res.status(403).json({ message: "You can only add students to classes in your school" });
    }
    
    await dataStorage.addStudentToClass(studentId, classId);
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "student_added_to_class",
      details: `Added student ${studentId} to class ${classId}`,
      ipAddress: req.ip
    });
    
    res.status(201).json({ message: "Student added to class" });
  });

  // GET student-classes - получение классов ученика или учеников класса
  app.get("/api/student-classes", isAuthenticated, async (req, res) => {
    const studentId = req.query.studentId ? parseInt(req.query.studentId as string) : null;
    const classId = req.query.classId ? parseInt(req.query.classId as string) : null;
    
    // Если запрашиваются классы ученика
    if (studentId) {
      // Проверка прав: только супер-админ, школьный админ, учитель, ученик (свои классы) и родитель (классы ребенка)
      if (req.user.role === UserRoleEnum.STUDENT && req.user.id !== studentId) {
        return res.status(403).json({ message: "You can only view your own classes" });
      }
      
      if (req.user.role === UserRoleEnum.PARENT) {
        // Проверяем, является ли запрашиваемый студент ребенком этого родителя
        const relations = await dataStorage.getParentStudents(req.user.id);
        const childIds = relations.map(r => r.studentId);
        
        if (!childIds.includes(studentId)) {
          return res.status(403).json({ message: "You can only view your children's classes" });
        }
      }
      
      const classes = await dataStorage.getStudentClasses(studentId);
      return res.json(classes);
    }
    
    // Если запрашиваются ученики класса
    if (classId) {
      // Проверяем, имеет ли пользователь доступ к классу
      if (req.user.role === UserRoleEnum.SCHOOL_ADMIN) {
        const classObj = await dataStorage.getClass(classId);
        if (!classObj || classObj.schoolId !== req.user.schoolId) {
          return res.status(403).json({ message: "You can only view students in classes of your school" });
        }
      } else if (req.user.role === UserRoleEnum.TEACHER) {
        // Учитель может видеть только учеников тех классов, где преподает
        const schedules = await dataStorage.getSchedulesByTeacher(req.user.id);
        const teacherClassIds = [...new Set(schedules.map(s => s.classId))];
        
        if (!teacherClassIds.includes(classId)) {
          return res.status(403).json({ message: "You can only view students in classes you teach" });
        }
      } else if (![UserRoleEnum.SUPER_ADMIN, UserRoleEnum.PRINCIPAL, UserRoleEnum.VICE_PRINCIPAL].includes(req.user.role)) {
        return res.status(403).json({ message: "You don't have permission to view class students" });
      }
      
      const students = await dataStorage.getClassStudents(classId);
      return res.json(students);
    }
    
    return res.status(400).json({ message: "Either studentId or classId must be provided" });
  });

  // Teacher-subject relationships
  app.get("/api/teacher-subjects/:teacherId", isAuthenticated, async (req, res) => {
    const teacherId = parseInt(req.params.teacherId);
    
    if (isNaN(teacherId)) {
      return res.status(400).json({ message: "Invalid teacher ID" });
    }
    
    // Проверка прав доступа
    if (req.user.role !== UserRoleEnum.SUPER_ADMIN && 
        req.user.role !== UserRoleEnum.SCHOOL_ADMIN && 
        req.user.id !== teacherId) {
      return res.status(403).json({ message: "You can only view your own subjects or subjects of teachers in your school" });
    }
    
    // Получение предметов учителя
    try {
      const subjects = await dataStorage.getTeacherSubjects(teacherId);
      res.json(subjects);
    } catch (error) {
      console.error("Error fetching teacher subjects:", error);
      res.status(500).json({ message: "Failed to fetch teacher subjects" });
    }
  });
  
  app.post("/api/teacher-subjects", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    const { teacherId, subjectId } = req.body;
    
    // Validate input
    if (!teacherId || !subjectId) {
      return res.status(400).json({ message: "Teacher ID and Subject ID are required" });
    }
    
    // Check if teacher and subject exist
    const teacher = await dataStorage.getUser(teacherId);
    const subject = await dataStorage.getSubject(subjectId);
    
    if (!teacher || teacher.role !== UserRoleEnum.TEACHER) {
      return res.status(404).json({ message: "Teacher not found" });
    }
    
    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }
    
    // School admin can only assign teachers to subjects in their school
    if (req.user.role === UserRoleEnum.SCHOOL_ADMIN && subject.schoolId !== req.user.schoolId) {
      return res.status(403).json({ message: "You can only assign teachers to subjects in your school" });
    }
    
    await dataStorage.assignTeacherToSubject(teacherId, subjectId);
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "teacher_assigned_to_subject",
      details: `Assigned teacher ${teacherId} to subject ${subjectId}`,
      ipAddress: req.ip
    });
    
    res.status(201).json({ message: "Teacher assigned to subject" });
  });

  // Parent-student relationships
  app.post("/api/parent-students", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    const { parentId, studentId } = req.body;
    
    // Validate input
    if (!parentId || !studentId) {
      return res.status(400).json({ message: "Parent ID and Student ID are required" });
    }
    
    // Check if parent and student exist
    const parent = await dataStorage.getUser(parentId);
    const student = await dataStorage.getUser(studentId);
    
    if (!parent || parent.role !== UserRoleEnum.PARENT) {
      return res.status(404).json({ message: "Parent not found" });
    }
    
    if (!student || student.role !== UserRoleEnum.STUDENT) {
      return res.status(404).json({ message: "Student not found" });
    }
    
    // School admin can only connect parents to students in their school
    if (req.user.role === UserRoleEnum.SCHOOL_ADMIN && 
        (student.schoolId !== req.user.schoolId || parent.schoolId !== req.user.schoolId)) {
      return res.status(403).json({ message: "You can only connect parents to students in your school" });
    }
    
    const relationship = await dataStorage.addParentStudent({ parentId, studentId });
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "parent_connected_to_student",
      details: `Connected parent ${parentId} to student ${studentId}`,
      ipAddress: req.ip
    });
    
    res.status(201).json(relationship);
  });

  // GET parent-students - получение списка родителей/детей
  app.get("/api/parent-students", isAuthenticated, async (req, res) => {
    const parentId = req.query.parentId ? parseInt(req.query.parentId as string) : null;
    const studentId = req.query.studentId ? parseInt(req.query.studentId as string) : null;
    
    // Если запрос для получения детей родителя
    if (parentId) {
      // Админ может видеть детей любого родителя
      if (![UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN, UserRoleEnum.PRINCIPAL, UserRoleEnum.VICE_PRINCIPAL].includes(req.user.role)) {
        // Родитель может видеть только своих детей
        if (req.user.role === UserRoleEnum.PARENT && req.user.id !== parentId) {
          return res.status(403).json({ message: "You can only view your own parent-student connections" });
        }
      }
      
      const relations = await dataStorage.getParentStudents(parentId);
      return res.json(relations);
    }
    
    // Если запрос для получения родителей ученика
    if (studentId) {
      // Админ может видеть родителей любого ученика
      if (![UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN, UserRoleEnum.PRINCIPAL, UserRoleEnum.VICE_PRINCIPAL, UserRoleEnum.TEACHER].includes(req.user.role)) {
        // Ученик может видеть только своих родителей
        if (req.user.role === UserRoleEnum.STUDENT && req.user.id !== studentId) {
          return res.status(403).json({ message: "You can only view your own parent-student connections" });
        }
        
        // Родитель может видеть только родителей своих детей
        if (req.user.role === UserRoleEnum.PARENT) {
          const parentChildren = await dataStorage.getParentStudents(req.user.id);
          const childIds = parentChildren.map(pc => pc.studentId);
          
          if (!childIds.includes(studentId)) {
            return res.status(403).json({ message: "You can only view parent connections for your children" });
          }
        }
      }
      
      const relations = await dataStorage.getStudentParents(studentId);
      return res.json(relations);
    }
    
    return res.status(400).json({ message: "Either parentId or studentId must be provided" });
  });

  // User roles API
  app.get("/api/user-roles/:userId", isAuthenticated, async (req, res) => {
    const userId = parseInt(req.params.userId);
    const user = await dataStorage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Пользователь может видеть свои собственные роли
    if (req.user.id === userId) {
      const userRoles = await dataStorage.getUserRoles(userId);
      return res.json(userRoles);
    }
    
    // Админы могут видеть роли всех пользователей (с ограничениями для школьного админа)
    if ([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN].includes(req.user.role)) {
      // Проверка прав: школьный администратор может видеть роли только пользователей своей школы
      if (req.user.role === UserRoleEnum.SCHOOL_ADMIN && user.schoolId !== req.user.schoolId) {
        return res.status(403).json({ message: "Forbidden. You don't have the required permissions." });
      }
      
      const userRoles = await dataStorage.getUserRoles(userId);
      return res.json(userRoles);
    }
    
    // Директор, завуч и классный руководитель могут видеть роли учеников из своей школы
    if ([UserRoleEnum.PRINCIPAL, UserRoleEnum.VICE_PRINCIPAL, UserRoleEnum.CLASS_TEACHER].includes(req.user.role)) {
      // Проверка, что пользователь из той же школы
      if (user.schoolId !== req.user.schoolId) {
        return res.status(403).json({ message: "Forbidden. User is not from your school." });
      }
      
      // Дополнительно для классного руководителя - может видеть только роли учеников своего класса
      if (req.user.role === UserRoleEnum.CLASS_TEACHER) {
        // Проверяем, что просматриваемый пользователь - ученик
        if (user.role !== UserRoleEnum.STUDENT) {
          return res.status(403).json({ message: "Forbidden. You can only view student roles." });
        }
        
        // TODO: дополнительные проверки для классного руководителя можно добавить здесь
      }
      
      const userRoles = await dataStorage.getUserRoles(userId);
      return res.json(userRoles);
    }
    
    return res.status(403).json({ message: "Forbidden. You don't have the required permissions." });
  });
  
  app.post("/api/user-roles", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    const { userId, role, schoolId, classId } = req.body;
    
    const user = await dataStorage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Проверка прав: школьный администратор может добавлять роли только пользователям своей школы
    if (req.user.role === UserRoleEnum.SCHOOL_ADMIN && user.schoolId !== req.user.schoolId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    // Особые проверки для роли классного руководителя
    if (role === UserRoleEnum.CLASS_TEACHER) {
      // Обязательно требуется указать и школу, и класс
      if (!schoolId) {
        return res.status(400).json({ message: "School ID is required for class teacher role" });
      }
      
      if (!classId) {
        return res.status(400).json({ message: "Class ID is required for class teacher role" });
      }
      
      // Проверяем, что класс существует и принадлежит указанной школе
      const classData = await dataStorage.getClass(classId);
      if (!classData) {
        return res.status(404).json({ message: "Class not found" });
      }
      
      if (classData.schoolId !== schoolId) {
        return res.status(400).json({ message: "Class does not belong to the selected school" });
      }
      
      // Проверяем, не существует ли уже такая роль у пользователя
      const existingRoles = await dataStorage.getUserRoles(userId);
      if (existingRoles.some(r => r.role === role && r.schoolId === schoolId && r.classId === classId)) {
        return res.status(400).json({ message: "User already has this role for the specified class" });
      }
    } else {
      // Для других ролей - стандартная проверка на дубликаты
      const existingRoles = await dataStorage.getUserRoles(userId);
      if (existingRoles.some(r => r.role === role && r.schoolId === schoolId)) {
        return res.status(400).json({ message: "User already has this role" });
      }
    }
    
    const userRole = await dataStorage.addUserRole({ userId, role, schoolId, classId });
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "user_role_added",
      details: `Added role ${role} to user ${userId}${schoolId ? ` for school ${schoolId}` : ''}${classId ? ` and class ${classId}` : ''}`,
      ipAddress: req.ip
    });
    
    res.status(201).json(userRole);
  });
  
  app.delete("/api/user-roles/:id", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    const id = parseInt(req.params.id);
    const userRole = await dataStorage.getUserRole(id);
    
    if (!userRole) {
      return res.status(404).json({ message: "User role not found" });
    }
    
    const user = await dataStorage.getUser(userRole.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Проверка прав: школьный администратор может удалять роли только пользователям своей школы
    if (req.user.role === UserRoleEnum.SCHOOL_ADMIN && user.schoolId !== req.user.schoolId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    await dataStorage.removeUserRole(id);
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "user_role_removed",
      details: `Removed role ${userRole.role} from user ${userRole.userId}`,
      ipAddress: req.ip
    });
    
    res.status(200).json({ message: "User role removed" });
  });
  
  // Получение списка всех доступных ролей пользователя
  app.get("/api/my-roles", isAuthenticated, async (req, res) => {
    const userRoles = await dataStorage.getUserRoles(req.user.id);
    
    // Добавляем основную роль пользователя, если её нет в списке
    const roleExists = userRoles.some(ur => ur.role === req.user.role);
    
    const result = [...userRoles];
    
    if (!roleExists) {
      // Добавим основную роль пользователя с виртуальным ID и пометим как default
      result.unshift({
        id: -1, // Виртуальный ID для основной роли
        userId: req.user.id,
        role: req.user.role,
        schoolId: req.user.schoolId,
        classId: req.user.classId || null, // Добавляем classId если он есть
        isDefault: true
      });
    }
    
    // Пометим активную роль, если она установлена
    if (req.user.activeRole) {
      for (const role of result) {
        role.isActive = role.role === req.user.activeRole;
      }
    } else {
      // Если активная роль не установлена, пометим основную роль как активную
      if (result.length > 0) {
        result[0].isActive = true;
      }
    }
    
    res.json(result);
  });

  app.put("/api/users/:id/active-role", isAuthenticated, async (req, res) => {
    const userId = parseInt(req.params.id);
    const { activeRole } = req.body;
    
    // Пользователь может изменить только свою активную роль
    if (req.user.id !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    // Проверяем, имеет ли пользователь эту роль
    const userRoles = await dataStorage.getUserRoles(userId);
    const hasMainRole = req.user.role === activeRole;
    const hasAdditionalRole = userRoles.some(r => r.role === activeRole);
    
    if (!hasMainRole && !hasAdditionalRole) {
      return res.status(400).json({ message: "User does not have this role" });
    }
    
    // Найдем выбранную роль, чтобы получить schoolId и classId
    const selectedRole = userRoles.find(r => r.role === activeRole);
    
    // Обновим пользователя с новой активной ролью и соответствующими данными
    const updateData: any = { activeRole };
    
    // Если выбрана дополнительная роль, то обновляем schoolId и classId
    if (selectedRole) {
      updateData.schoolId = selectedRole.schoolId;
      
      // Если есть classId (например, для классного руководителя), тоже обновляем
      if (selectedRole.classId) {
        updateData.classId = selectedRole.classId;
      }
    }
    
    const user = await dataStorage.updateUser(userId, updateData);
    
    // Обновим данные пользователя в сессии
    req.user.activeRole = activeRole;
    if (updateData.schoolId !== undefined) req.user.schoolId = updateData.schoolId;
    if (updateData.classId !== undefined) req.user.classId = updateData.classId;
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "active_role_changed",
      details: `Changed active role to ${activeRole}`,
      ipAddress: req.ip
    });
    
    res.json(user);
  });

  // Notifications count API
  app.get("/api/notifications/count", isAuthenticated, async (req, res) => {
    const notifications = await dataStorage.getNotificationsByUser(req.user.id);
    const unreadCount = notifications.filter(n => !n.isRead).length;
    res.json({ unreadCount });
  });
  
  // Endpoint для получения расписания для ученика (для классного руководителя)
  app.get("/api/students/:studentId/schedules", isAuthenticated, async (req, res) => {
    try {
      const studentId = parseInt(req.params.studentId);
      
      if (isNaN(studentId)) {
        return res.status(400).json({ message: "Invalid student ID" });
      }
      
      // Проверяем права доступа
      if (req.user.role === UserRoleEnum.CLASS_TEACHER) {
        // Классный руководитель может видеть расписания только учеников своего класса
        const userRoles = await dataStorage.getUserRoles(req.user.id);
        const classTeacherRole = userRoles.find(r => r.role === UserRoleEnum.CLASS_TEACHER && r.classId);
        
        if (!classTeacherRole || !classTeacherRole.classId) {
          return res.status(403).json({ message: "You don't have an assigned class" });
        }
        
        // Проверяем, что студент принадлежит к классу руководителя
        const classStudents = await dataStorage.getClassStudents(classTeacherRole.classId);
        const isStudentInClass = classStudents.some(s => s.id === studentId);
        
        if (!isStudentInClass) {
          return res.status(403).json({ message: "Student does not belong to your class" });
        }
      } else if (![UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN, UserRoleEnum.PRINCIPAL, UserRoleEnum.VICE_PRINCIPAL, UserRoleEnum.CLASS_TEACHER].includes(req.user.role)) {
        // Только администраторы и классные руководители могут просматривать расписание учеников
        return res.status(403).json({ message: "You don't have permission to view student schedules" });
      }
      
      // Получаем классы, к которым принадлежит студент
      const studentClasses = await dataStorage.getStudentClasses(studentId);
      if (!studentClasses.length) {
        return res.json([]);
      }
      
      let schedules = [];
      
      // Получаем расписание для каждого класса студента
      for (const classData of studentClasses) {
        const classSchedules = await dataStorage.getSchedulesByClass(classData.id);
        schedules = [...schedules, ...classSchedules];
      }
      
      res.json(schedules);
    } catch (error) {
      console.error("Error fetching student schedules:", error);
      res.status(500).json({ message: "Failed to fetch student schedules" });
    }
  });

  // Маршрут для получения учеников по ID класса для страницы оценок
  app.get("/api/students-by-class/:classId", isAuthenticated, async (req, res) => {
    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }
    
    try {
      // Проверяем, имеет ли пользователь доступ к классу
      if (req.user.role === UserRoleEnum.SCHOOL_ADMIN) {
        const classObj = await dataStorage.getClass(classId);
        if (!classObj || classObj.schoolId !== req.user.schoolId) {
          return res.status(403).json({ message: "You can only view students in classes of your school" });
        }
      } else if (req.user.role === UserRoleEnum.TEACHER) {
        // Учитель может видеть только учеников тех классов, где преподает
        const schedules = await dataStorage.getSchedulesByTeacher(req.user.id);
        const teacherClassIds = [...new Set(schedules.map(s => s.classId))];
        
        if (!teacherClassIds.includes(classId)) {
          return res.status(403).json({ message: "You can only view students in classes you teach" });
        }
      } else if (req.user.role === UserRoleEnum.CLASS_TEACHER) {
        // Классный руководитель может видеть студентов только своего класса
        // Получаем роли пользователя, чтобы найти роль классного руководителя
        const userRoles = await dataStorage.getUserRoles(req.user.id);
        const classTeacherRole = userRoles.find(r => 
          r.role === UserRoleEnum.CLASS_TEACHER && r.classId === classId
        );
        
        if (!classTeacherRole) {
          return res.status(403).json({ message: "You can only view students in your assigned class" });
        }
      } else if (![UserRoleEnum.SUPER_ADMIN, UserRoleEnum.PRINCIPAL, UserRoleEnum.VICE_PRINCIPAL].includes(req.user.role)) {
        return res.status(403).json({ message: "You don't have permission to view class students" });
      }
      
      // Получаем студентов этого класса
      const students = await dataStorage.getClassStudents(classId);
      res.json(students);
    } catch (error) {
      console.error("Error fetching students by class:", error);
      return res.status(500).json({ message: "Failed to fetch students" });
    }
  });
  
  // Получение расписания студента для классного руководителя
  app.get("/api/student-schedules/:studentId", isAuthenticated, async (req, res) => {
    try {
      const studentId = parseInt(req.params.studentId);
      
      // Проверяем права доступа - только классный руководитель, администраторы и родители могут просматривать расписание ученика
      if (req.user.role === UserRoleEnum.CLASS_TEACHER) {
        // Классный руководитель может видеть расписание только студентов своего класса
        // Получаем роли пользователя, чтобы найти роль классного руководителя
        const userRoles = await dataStorage.getUserRoles(req.user.id);
        const classTeacherRole = userRoles.find(r => r.role === UserRoleEnum.CLASS_TEACHER && r.classId);
        
        if (!classTeacherRole || !classTeacherRole.classId) {
          return res.status(403).json({ message: "You need to be assigned to a class as a class teacher" });
        }
        
        // Проверяем, принадлежит ли ученик к классу учителя
        const classStudents = await dataStorage.getClassStudents(classTeacherRole.classId);
        const isStudentInClass = classStudents.some(student => student.id === studentId);
        
        if (!isStudentInClass) {
          return res.status(403).json({ message: "You can only view schedules of students in your assigned class" });
        }
      } else if (![UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN, UserRoleEnum.PRINCIPAL, UserRoleEnum.VICE_PRINCIPAL, UserRoleEnum.CLASS_TEACHER].includes(req.user.role)) {
        // Проверяем, является ли текущий пользователь родителем этого ученика
        if (req.user.role === UserRoleEnum.PARENT) {
          const parentStudents = await dataStorage.getParentStudents(req.user.id);
          const isParentOfStudent = parentStudents.some(ps => ps.studentId === studentId);
          
          if (!isParentOfStudent) {
            return res.status(403).json({ message: "You can only view schedules of your children" });
          }
        } else {
          return res.status(403).json({ message: "You don't have permission to view student schedules" });
        }
      }
      
      // Получаем классы, к которым принадлежит студент
      const studentClasses = await dataStorage.getStudentClasses(studentId);
      
      // Получаем расписание для каждого класса студента
      const studentSchedules = [];
      for (const cls of studentClasses) {
        const classSchedules = await dataStorage.getSchedulesByClass(cls.id);
        studentSchedules.push(...classSchedules);
      }
      
      res.json(studentSchedules);
    } catch (error) {
      console.error("Error fetching student schedules:", error);
      return res.status(500).json({ message: "Failed to fetch student schedules" });
    }
  });
  
  const httpServer = createServer(app);
  return httpServer;
}
