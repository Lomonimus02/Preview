import type { Express } from "express";
import { createServer, type Server } from "http";
import { dbStorage } from "./db-storage";

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

  // Middleware to check if user has specific role
  const hasRole = (roles: UserRoleEnum[]) => async (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    // Проверяем активную роль пользователя, если она установлена
    if (req.user.activeRole && roles.includes(req.user.activeRole)) {
      return next();
    }
    
    // Если активная роль не установлена, проверяем основную роль пользователя
    if (!req.user.activeRole && roles.includes(req.user.role)) {
      return next();
    }
    
    // Доступ запрещен, если активная роль не соответствует требуемой
    res.status(403).json({ message: "Forbidden. You don't have the required role permissions." });
  };

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

  // Users API
  app.get("/api/users", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    const activeRole = req.user.activeRole || req.user.role;
    
    if (activeRole === UserRoleEnum.SUPER_ADMIN) {
      const users = await dataStorage.getUsers();
      return res.json(users);
    } else if (activeRole === UserRoleEnum.SCHOOL_ADMIN && req.user.schoolId) {
      const users = await dataStorage.getUsersBySchool(req.user.schoolId);
      return res.json(users);
    }
    
    res.json([]);
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

  app.post("/api/classes", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    // Validate school access
    if (req.user.role === UserRoleEnum.SCHOOL_ADMIN && req.body.schoolId !== req.user.schoolId) {
      return res.status(403).json({ message: "You can only create classes for your school" });
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
    // Validate school access
    if (req.user.role === UserRoleEnum.SCHOOL_ADMIN && req.body.schoolId !== req.user.schoolId) {
      return res.status(403).json({ message: "You can only create subjects for your school" });
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
      
      // Get schedules for each class
      for (const cls of classes) {
        const classSchedules = await dataStorage.getSchedulesByClass(cls.id);
        schedules.push(...classSchedules);
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
    
    const schedule = await dataStorage.createSchedule(req.body);
    
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
  
  // Обновление статуса урока (проведен/не проведен)
  app.patch("/api/schedules/:id/status", hasRole([UserRoleEnum.TEACHER]), async (req, res) => {
    const scheduleId = parseInt(req.params.id);
    const { status } = req.body;
    
    // Проверяем, существует ли расписание
    const schedule = await dataStorage.getSchedule(scheduleId);
    if (!schedule) {
      return res.status(404).json({ message: "Schedule not found" });
    }
    
    // Проверяем, является ли текущий пользователь учителем этого урока
    if (schedule.teacherId !== req.user.id) {
      return res.status(403).json({ message: "You can only update schedules where you are the teacher" });
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
  
  // Удаление оценки
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
  app.get("/api/user-roles/:userId", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    const userId = parseInt(req.params.userId);
    const user = await dataStorage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Проверка прав: школьный администратор может видеть роли только пользователей своей школы
    if (req.user.role === UserRoleEnum.SCHOOL_ADMIN && user.schoolId !== req.user.schoolId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    const userRoles = await dataStorage.getUserRoles(userId);
    res.json(userRoles);
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
    
    const user = await dataStorage.updateUser(userId, { activeRole });
    
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
      } else if (![UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN, UserRoleEnum.PRINCIPAL, UserRoleEnum.VICE_PRINCIPAL].includes(req.user.role)) {
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
      } else if (![UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN, UserRoleEnum.PRINCIPAL, UserRoleEnum.VICE_PRINCIPAL].includes(req.user.role)) {
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
