import type { Express } from "express";
import { createServer, type Server } from "http";
import { dbStorage } from "./db-storage";
import { db } from "./db";

// Используем хранилище БД для всех операций
const dataStorage = dbStorage;
import { setupAuth } from "./auth";
import { z } from "zod";
import { UserRoleEnum, studentClasses as studentClassesTable, attendance, studentSubgroups } from "@shared/schema";
import { eq } from "drizzle-orm";

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
      console.log(`Попытка смены роли для пользователя ${req.user.id} на роль ${role}`);
      
      // Получаем все доступные роли пользователя (дополнительные роли из user_roles)
      const userRoles = await dataStorage.getUserRoles(req.user.id);
      console.log(`Получены роли пользователя: ${JSON.stringify(userRoles.map(r => r.role))}`);
      
      // Проверяем, есть ли у пользователя указанная роль среди дополнительных ролей
      const userRole = userRoles.find(ur => ur.role === role);
      
      // Проверяем, является ли указанная роль основной ролью пользователя
      const isMainUserRole = req.user.role === role;
      
      console.log(`Роль ${role} найдена в дополнительных ролях: ${!!userRole}, основная роль пользователя: ${isMainUserRole}`);
      
      // Допускаем переключение только если роль найдена среди дополнительных или является основной
      if (!userRole && !isMainUserRole) {
        console.log(`Отказано в смене роли: роль ${role} не найдена среди доступных ролей пользователя`);
        return res.status(403).json({ message: "Forbidden. Role not found or doesn't belong to user" });
      }
      
      // Используем найденную дополнительную роль или создаем объект из основной роли
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
      const requestedRole = req.query.role as string | undefined;

      console.log("Получение списка пользователей:");
      console.log("Роль пользователя:", activeRole);
      console.log("ID школы пользователя:", req.user?.schoolId);
      console.log("Запрошенная роль:", requestedRole);
      
      // Проверяем роль пользователя
      if (!activeRole) {
        return res.status(403).json({ message: "Доступ запрещен - отсутствует роль пользователя" });
      }
      
      // Если запрошена конкретная роль (например, учителя)
      if (requestedRole) {
        // Пользователь имеет роль SUPER_ADMIN или SCHOOL_ADMIN среди своих ролей
        const userRoles = await dataStorage.getUserRoles(req.user.id);
        const isSuperAdmin = userRoles.some(role => role.role === UserRoleEnum.SUPER_ADMIN) || 
                             activeRole === UserRoleEnum.SUPER_ADMIN;
        const isSchoolAdmin = userRoles.some(role => role.role === UserRoleEnum.SCHOOL_ADMIN) ||
                             activeRole === UserRoleEnum.SCHOOL_ADMIN;
        
        if (isSuperAdmin) {
          // Супер-админ получает всех пользователей с запрошенной ролью из всех школ
          console.log(`Получение всех пользователей с ролью ${requestedRole} для SUPER_ADMIN`);
          const allUsers = await dataStorage.getUsers();
          const filteredUsers = allUsers.filter(user => user.role === requestedRole);
          return res.json(filteredUsers);
        } 
        else if (isSchoolAdmin) {
          // Школьный администратор получает пользователей своей школы с запрошенной ролью
          // Получаем ID школы 
          const schoolAdminRole = userRoles.find(role => 
            role.role === UserRoleEnum.SCHOOL_ADMIN && role.schoolId
          );
          
          let schoolId = req.user.schoolId || (schoolAdminRole ? schoolAdminRole.schoolId : null);
          
          if (!schoolId) {
            // Пробуем найти первую школу
            const schools = await dataStorage.getSchools();
            
            if (schools.length > 0) {
              schoolId = schools[0].id;
              console.log("Использование первой доступной школы:", schools[0].id);
            }
          }
          
          if (schoolId) {
            console.log(`Получение пользователей с ролью ${requestedRole} школы для SCHOOL_ADMIN, ID школы:`, schoolId);
            const schoolUsers = await dataStorage.getUsersBySchool(schoolId);
            const filteredUsers = schoolUsers.filter(user => user.role === requestedRole);
            console.log(`Найдено пользователей с ролью ${requestedRole}:`, filteredUsers.length);
            return res.json(filteredUsers);
          } else {
            return res.status(400).json({ message: "Не найдена школа администратора" });
          }
        }
        else {
          return res.status(403).json({ message: "Недостаточно прав для просмотра списка пользователей" });
        }
      }
      else {
        // Стандартное поведение без фильтрации по роли
        // Пользователь имеет роль SUPER_ADMIN среди своих ролей?
        const userRoles = await dataStorage.getUserRoles(req.user.id);
        const isSuperAdmin = userRoles.some(role => role.role === UserRoleEnum.SUPER_ADMIN) || 
                            activeRole === UserRoleEnum.SUPER_ADMIN;
        
        // Супер-админ получает всех пользователей
        if (isSuperAdmin) {
          console.log("Получение всех пользователей для SUPER_ADMIN");
          const users = await dataStorage.getUsers();
          return res.json(users);
        } 
        // Школьный администратор или директор получает пользователей своей школы
        else if (activeRole === UserRoleEnum.SCHOOL_ADMIN || activeRole === UserRoleEnum.PRINCIPAL) {
          // Получаем ID школы из профиля пользователя или из роли
          const userRoles = await dataStorage.getUserRoles(req.user.id);
          const schoolRole = userRoles.find(role => 
            (role.role === UserRoleEnum.SCHOOL_ADMIN || role.role === UserRoleEnum.PRINCIPAL) && role.schoolId
          );
          
          // Используем ID школы из профиля пользователя или из роли
          let schoolId = req.user.schoolId || (schoolRole ? schoolRole.schoolId : null);
          
          // Логирование для отладки
          console.log(`Проверка роли ${activeRole === UserRoleEnum.PRINCIPAL ? 'директора' : 'администратора школы'}...`);
          console.log("schoolId из профиля:", req.user.schoolId);
          console.log("schoolId из роли:", schoolRole?.schoolId);
          console.log("Используемый schoolId:", schoolId);
          
          // Если школа не найдена даже в роли, ищем любую доступную
          if (!schoolId) {
            console.log(`Не найден ID школы для ${activeRole === UserRoleEnum.PRINCIPAL ? 'директора' : 'администратора'}`);
            
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
            console.log(`Получение пользователей школы для ${activeRole}, ID школы:`, schoolId);
            const users = await dataStorage.getUsersBySchool(schoolId);
            console.log("Найдено пользователей:", users.length);
            return res.json(users);
          } else {
            return res.status(400).json({ message: `Не найдена школа для ${activeRole}` });
          }
        } 
        // Для других ролей (учитель, ученик) не разрешаем доступ к полному списку пользователей
        else {
          return res.status(403).json({ message: "Недостаточно прав для просмотра списка пользователей" });
        }
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
      
      // Если создается студент и указаны классы - добавляем записи в таблицу student_classes
      if (newUserRole === UserRoleEnum.STUDENT && req.body.classIds && req.body.classIds.length > 0) {
        // Обрабатываем все классы, в которые нужно добавить студента
        for (const classId of req.body.classIds) {
          console.log(`Создан новый студент id=${user.id}, добавляем его в класс id=${classId}`);
          try {
            // Добавляем запись в таблицу связи студентов с классами
            await dataStorage.addStudentToClass(user.id, classId);
            console.log(`Студент id=${user.id} успешно добавлен в класс id=${classId}`);
          } catch (error) {
            console.error(`Ошибка при добавлении студента id=${user.id} в класс id=${classId}:`, error);
            // Продолжаем выполнение, не прерываем запрос из-за этой ошибки
          }
        }
      } 
      // Обратная совместимость с предыдущим API (если передается classId вместо classIds)
      else if (newUserRole === UserRoleEnum.STUDENT && req.body.classId) {
        console.log(`Создан новый студент id=${user.id}, добавляем его в класс id=${req.body.classId}`);
        try {
          // Добавляем запись в таблицу связи студентов с классами
          await dataStorage.addStudentToClass(user.id, req.body.classId);
          console.log(`Студент id=${user.id} успешно добавлен в класс id=${req.body.classId}`);
        } catch (error) {
          console.error(`Ошибка при добавлении студента id=${user.id} в класс id=${req.body.classId}:`, error);
          // Продолжаем выполнение, не прерываем запрос из-за этой ошибки
        }
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
    
    // Проверяем, меняется ли класс пользователя
    // Проверяем оба варианта передачи класса - classId (устаревший) и classIds (новый формат)
    let newClassId: number | undefined;
    
    // Если пришел classIds (массив классов) - берем первый элемент
    if (req.body.classIds && Array.isArray(req.body.classIds) && req.body.classIds.length > 0) {
      newClassId = req.body.classIds[0];
      console.log(`Получен массив classIds: ${req.body.classIds}, используем первый элемент: ${newClassId}`);
    } 
    // Если пришел classId (обратная совместимость)
    else if (req.body.classId) {
      newClassId = parseInt(req.body.classId);
      console.log(`Получен classId: ${newClassId}`);
    }
    
    const classIdChanged = newClassId !== undefined && newClassId !== user.classId;
    const oldClassId = user.classId;
    
    // Обновляем базовую информацию пользователя
    const updatedUser = await dataStorage.updateUser(id, req.body);
    
    // Если пользователь студент и его класс изменился, обновляем связанные записи
    if (updatedUser && (user.role === UserRoleEnum.STUDENT || updatedUser.role === UserRoleEnum.STUDENT) && classIdChanged && newClassId) {
      try {
        console.log(`Обновление связей ученика id=${id} при смене класса с ${oldClassId} на ${newClassId}`);
        
        // Получаем все роли пользователя
        const userRoles = await dataStorage.getUserRoles(id);
        
        // Находим роль студента и обновляем classId
        for (const role of userRoles) {
          if (role.role === UserRoleEnum.STUDENT) {
            // Обновляем classId в записи роли
            if (role.id > 0) { // Не обновляем дефолтную роль с id = -1
              console.log(`Удаляем запись о роли студента id=${role.id}`);
              await dataStorage.removeUserRole(role.id);
              
              console.log(`Создаем новую запись о роли студента с classId=${newClassId}`);
              await dataStorage.addUserRole({
                userId: id,
                role: UserRoleEnum.STUDENT,
                classId: newClassId,
                schoolId: role.schoolId
              });
            }
          }
        }
        
        // Находим подгруппы старого класса и удаляем ученика из них
        if (oldClassId) {
          const oldClassSubgroups = await dataStorage.getSubgroupsByClass(oldClassId);
          for (const subgroup of oldClassSubgroups) {
            // Получаем всех студентов подгруппы
            const subgroupStudents = await dataStorage.getSubgroupStudents(subgroup.id);
            // Если студент находится в этой подгруппе, удаляем его
            if (subgroupStudents.some(s => s.id === id)) {
              console.log(`Удаляем студента id=${id} из подгруппы id=${subgroup.id}`);
              await dataStorage.removeStudentFromSubgroup(id, subgroup.id);
            }
          }
        }
        
        // Удаляем студента из всех классов перед добавлением в новый
        console.log(`Удаляем студента id=${id} из всех старых классов`);
        
        try {
          // Получаем все существующие связи студент-класс
          const studentClassConnections = await db
            .select()
            .from(studentClassesTable)
            .where(eq(studentClassesTable.studentId, id));
            
          console.log(`Найдено ${studentClassConnections.length} существующих связей студент-класс`);
          
          // Удаляем все старые связи
          if (studentClassConnections.length > 0) {
            await db
              .delete(studentClassesTable)
              .where(eq(studentClassesTable.studentId, id));
            console.log(`Удалены все старые связи студента id=${id} с классами`);
          }
        } catch (error) {
          console.error(`Ошибка при удалении старых связей студент-класс:`, error);
        }
        
        // Важно: явно добавляем студента в новый класс
        console.log(`Явно добавляем студента id=${id} в класс id=${newClassId}`);
        
        // После удаления всех старых связей просто добавляем запись в таблицу связи студентов с классами
        try {
          await dataStorage.addStudentToClass(id, newClassId);
          console.log(`Студент id=${id} добавлен в класс id=${newClassId}`);
        } catch (error) {
          console.error(`Ошибка при добавлении студента id=${id} в класс id=${newClassId}:`, error);
        }
      } catch (error) {
        console.error("Error updating user associations:", error);
        // Продолжаем выполнение, не прерываем запрос из-за этой ошибки
      }
    }
    
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
  
  app.patch("/api/classes/:id", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    const classId = parseInt(req.params.id);
    
    if (isNaN(classId)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }
    
    // Проверяем существование класса
    const classData = await dataStorage.getClass(classId);
    if (!classData) {
      return res.status(404).json({ message: "Class not found" });
    }
    
    // Проверка прав: школьный администратор может обновлять только классы своей школы
    if (req.user.role === UserRoleEnum.SCHOOL_ADMIN) {
      let userSchoolId = req.user.schoolId;
      
      // Если у пользователя нет schoolId в профиле, проверяем роли
      if (!userSchoolId) {
        const userRoles = await dataStorage.getUserRoles(req.user.id);
        const schoolAdminRole = userRoles.find(role => 
          role.role === UserRoleEnum.SCHOOL_ADMIN && role.schoolId
        );
        
        if (schoolAdminRole && schoolAdminRole.schoolId) {
          userSchoolId = schoolAdminRole.schoolId;
        }
      }
      
      // Проверяем принадлежность класса к школе пользователя
      if (!userSchoolId || classData.schoolId !== userSchoolId) {
        return res.status(403).json({ message: "You can only update classes in your school" });
      }
    }
    
    // Обновляем данные класса
    try {
      const updatedClass = await dataStorage.updateClass(classId, req.body);
      
      // Логируем действие
      await dataStorage.createSystemLog({
        userId: req.user.id,
        action: "class_updated",
        details: `Updated class: ${updatedClass.name}`,
        ipAddress: req.ip
      });
      
      res.json(updatedClass);
    } catch (error) {
      console.error("Error updating class:", error);
      res.status(500).json({ message: "Failed to update class" });
    }
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

    // Для каждого расписания получаем связанные задания
    for (const schedule of schedules) {
      try {
        // Получаем задания для урока независимо от статуса
        const assignments = await dataStorage.getAssignmentsBySchedule(schedule.id);
        if (assignments && assignments.length > 0) {
          // Добавляем задания к объекту расписания
          schedule.assignments = assignments;
        }
      } catch (error) {
        console.error(`Error fetching assignments for schedule ${schedule.id}:`, error);
        // Продолжаем работу даже при ошибке получения заданий
      }
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
  
  // API для получения среднего балла по предмету и ученику - точно как в журнале учителя
  app.get("/api/student-subject-average", isAuthenticated, async (req, res) => {
    try {
      const { studentId, subjectId, subgroupId } = req.query;
      
      if (!studentId || !subjectId) {
        return res.status(400).json({ message: "Необходимо указать studentId и subjectId" });
      }
      
      // Проверяем права доступа
      const parsedStudentId = parseInt(studentId as string);
      const parsedSubjectId = parseInt(subjectId as string);
      const parsedSubgroupId = subgroupId ? parseInt(subgroupId as string) : null;
      
      // Студент может видеть только свои оценки
      if (req.user.role === UserRoleEnum.STUDENT && req.user.id !== parsedStudentId) {
        return res.status(403).json({ message: "Вы можете видеть только свои оценки" });
      }
      
      // Родитель может видеть только оценки своих детей
      if (req.user.role === UserRoleEnum.PARENT) {
        const relationships = await dataStorage.getParentStudents(req.user.id);
        const childIds = relationships.map(r => r.studentId);
        
        if (!childIds.includes(parsedStudentId)) {
          return res.status(403).json({ message: "Вы можете видеть только оценки своих детей" });
        }
      }
      
      // Получаем оценки ученика по предмету
      const allGrades = await dataStorage.getGradesByStudent(parsedStudentId);
      let studentSubjectGrades;
      
      // Если указана подгруппа, фильтруем оценки по предмету и подгруппе
      if (parsedSubgroupId) {
        studentSubjectGrades = allGrades.filter(g => 
          g.subjectId === parsedSubjectId && g.subgroupId === parsedSubgroupId);
        console.log(`Фильтрация по предмету ${parsedSubjectId} и подгруппе ${parsedSubgroupId}`);
      } else {
        // Если подгруппа не указана, находим все оценки по предмету (с подгруппами и без)
        // Изменение: теперь берем ВСЕ оценки для предмета, включая те, что в подгруппах
        studentSubjectGrades = allGrades.filter(g => g.subjectId === parsedSubjectId);
        console.log(`Фильтрация только по предмету ${parsedSubjectId}, всего оценок: ${studentSubjectGrades.length}`);
      }
      
      console.log(`Найдено оценок: ${studentSubjectGrades.length}`);
      
      // Получаем класс ученика для определения системы оценивания
      const studentClasses = await dataStorage.getStudentClasses(parsedStudentId);
      if (!studentClasses || studentClasses.length === 0) {
        return res.status(404).json({ message: "Класс ученика не найден" });
      }
      
      const classInfo = await dataStorage.getClass(studentClasses[0].id);
      if (!classInfo) {
        return res.status(404).json({ message: "Информация о классе не найдена" });
      }
      
      // Получаем список подгрупп ученика
      const studentSubgroups = await dataStorage.getStudentSubgroups(parsedStudentId);
      console.log("Подгруппы ученика:", studentSubgroups.map(sg => sg.id));
      
      // Получаем задания для этого предмета, если используется накопительная система
      let assignments = [];
      if (classInfo.gradingSystem === 'cumulative') {
        assignments = await dataStorage.getAssignmentsBySubject(parsedSubjectId);
        console.log(`Найдено ${assignments.length} заданий для предмета ${parsedSubjectId}`);
      }
      
      // Рассчитываем средний балл по той же логике, что и в журнале учителя
      let result;
      
      if (classInfo.gradingSystem === 'cumulative') {
        // Для накопительной системы считаем по заданиям
        let totalEarnedScore = 0;
        let totalMaxScore = 0;
        
        console.log("Оценки студента по предмету:", studentSubjectGrades);
        console.log("Задания по предмету:", assignments);
        
        // Проходим по всем оценкам
        for (const grade of studentSubjectGrades) {
          console.log(`Обработка оценки: ${grade.id}, значение: ${grade.grade}, scheduleId: ${grade.scheduleId}, subgroupId: ${grade.subgroupId}`);
          
          // Проверяем, имеет ли студент доступ к оценке подгруппы
          if (grade.subgroupId) {
            const studentIsInSubgroup = studentSubgroups.some(sg => sg.id === grade.subgroupId);
            console.log(`Оценка принадлежит подгруппе ${grade.subgroupId}, студент в подгруппе: ${studentIsInSubgroup}`);
            
            if (!studentIsInSubgroup && !parsedSubgroupId) {
              console.log(`Пропускаем оценку ${grade.id}, т.к. студент не в этой подгруппе`);
              continue; // Пропускаем оценки подгрупп, к которым студент не принадлежит
            }
          }
          
          // Обрабатываем оценки с привязкой к расписанию
          if (grade.scheduleId) {
            const relatedAssignments = assignments.filter(a => a.scheduleId === grade.scheduleId);
            console.log(`Найдено связанных заданий: ${relatedAssignments.length} для scheduleId=${grade.scheduleId}`);
            
            if (relatedAssignments.length > 0) {
              const assignment = grade.assignmentId ? 
                relatedAssignments.find(a => a.id === grade.assignmentId) : 
                relatedAssignments[0];
              
              if (assignment) {
                console.log(`Использую задание: ${assignment.id}, maxScore: ${assignment.maxScore}, plannedFor: ${assignment.plannedFor}`);
                
                // Получаем информацию о расписании, чтобы проверить статус урока
                const schedule = await dataStorage.getSchedule(grade.scheduleId);
                
                // Проверяем, запланировано ли задание и проведен ли урок
                // Учитываем оценку только если:
                // 1. задание не запланировано (plannedFor=false) или
                // 2. задание запланировано, но урок уже проведен (status='conducted')
                if (!assignment.plannedFor || (assignment.plannedFor && schedule && schedule.status === 'conducted')) {
                  totalEarnedScore += grade.grade;
                  totalMaxScore += Number(assignment.maxScore);
                  console.log(`Оценка учтена в расчете среднего балла`);
                } else {
                  console.log(`Оценка не учтена в расчете, т.к. задание запланировано, а урок не проведен`);
                }
              }
            } else {
              // Если не найдено связанных заданий, но известен scheduleId,
              // попробуем получить задания напрямую для этого урока
              console.log(`Поиск заданий напрямую для урока ${grade.scheduleId}`);
              const scheduleAssignments = await dataStorage.getAssignmentsBySchedule(grade.scheduleId);
              
              if (scheduleAssignments && scheduleAssignments.length > 0) {
                console.log(`Найдено ${scheduleAssignments.length} заданий для урока`);
                const assignment = scheduleAssignments[0]; // Используем первое задание для этого урока
                
                // Получаем информацию о расписании, чтобы проверить статус урока
                const schedule = await dataStorage.getSchedule(grade.scheduleId);
                
                // Проверяем, запланировано ли задание и проведен ли урок
                if (!assignment.plannedFor || (assignment.plannedFor && schedule && schedule.status === 'conducted')) {
                  totalEarnedScore += grade.grade;
                  totalMaxScore += Number(assignment.maxScore);
                  console.log(`Оценка учтена в расчете среднего балла (прямое получение задания)`);
                } else {
                  console.log(`Оценка не учтена в расчете, т.к. задание запланировано, а урок не проведен (прямое получение задания)`);
                }
              } else {
                // Если для урока нет заданий, но есть оценка, создаем virtual maxScore = 10.0
                console.log(`Нет заданий для урока, создаем виртуальный maxScore = 10.0`);
                totalEarnedScore += grade.grade;
                totalMaxScore += 10.0; // Виртуальный maxScore для оценок без задания
              }
            }
          } else {
            // Для оценок без привязки к расписанию также создаем virtual maxScore = 10.0
            console.log(`Оценка без scheduleId, создаем виртуальный maxScore = 10.0`);
            totalEarnedScore += grade.grade;
            totalMaxScore += 10.0;
          }
        }
        
        console.log(`Итоговые баллы: earned=${totalEarnedScore}, max=${totalMaxScore}`);
        
        if (totalMaxScore === 0) {
          console.log("Нет максимального балла, возвращаем дефолтные значения");
          result = { average: "0", percentage: "0%" };
        } else {
          const percentage = (totalEarnedScore / totalMaxScore) * 100;
          const cappedPercentage = Math.min(percentage, 100);
          console.log(`Рассчитанный процент: ${percentage}, ограниченный: ${cappedPercentage}`);
          result = { 
            average: totalEarnedScore.toFixed(1),
            maxScore: totalMaxScore.toFixed(1),
            percentage: cappedPercentage.toFixed(1) + "%"
          };
        }
      } else {
        // Для пятибалльной системы используем алгоритм с весами
        const weights = {
          'test': 2,
          'exam': 3,
          'homework': 1,
          'project': 2,
          'classwork': 1,
          'Текущая': 1,
          'Контрольная': 2,
          'Экзамен': 3,
          'Практическая': 1.5,
          'Домашняя': 1
        };
        
        let weightedSum = 0;
        let totalWeight = 0;
        
        studentSubjectGrades.forEach(grade => {
          const weight = weights[grade.gradeType] || 1;
          weightedSum += grade.grade * weight;
          totalWeight += weight;
        });
        
        if (totalWeight === 0) {
          result = { average: "-", percentage: "-" };
        } else {
          const average = weightedSum / totalWeight;
          const percentage = (average / 5) * 100;
          const cappedPercentage = Math.min(percentage, 100);
          
          result = {
            average: average.toFixed(1),
            percentage: cappedPercentage.toFixed(1) + "%"
          };
        }
      }
      
      res.json(result);
    } catch (error) {
      console.error("Ошибка при расчете среднего балла:", error);
      res.status(500).json({ message: "Ошибка сервера при расчете среднего балла" });
    }
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
      
      // Если указан scheduleId и assignmentId, проверяем наличие уже существующей оценки для этого задания и ученика
      if (gradeData.scheduleId && gradeData.assignmentId) {
        // Получаем все оценки для данного ученика
        const studentGrades = await dataStorage.getGradesByStudent(gradeData.studentId);
        
        // Проверяем, есть ли уже оценка для этого задания
        const existingGrade = studentGrades.find(g => 
          g.scheduleId === gradeData.scheduleId && 
          (g.assignmentId === gradeData.assignmentId || 
           (gradeData.assignmentId === undefined && g.scheduleId === gradeData.scheduleId))
        );
        
        if (existingGrade) {
          return res.status(400).json({ 
            message: 'На это задание уже выставлена оценка. Для выставления новой оценки, создайте новое задание или измените существующую оценку.',
            existingGradeId: existingGrade.id
          });
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
    let attendanceList = [];
    
    if (req.query.scheduleId) {
      const scheduleId = parseInt(req.query.scheduleId as string);
      
      // Проверяем, что расписание существует
      const schedule = await dataStorage.getSchedule(scheduleId);
      if (!schedule) {
        return res.status(404).json({ message: "Schedule not found" });
      }
      
      // Проверяем права доступа
      if ([UserRoleEnum.TEACHER, UserRoleEnum.SCHOOL_ADMIN, UserRoleEnum.PRINCIPAL, UserRoleEnum.VICE_PRINCIPAL, UserRoleEnum.CLASS_TEACHER].includes(req.user.role)) {
        let students = [];
        
        // Если в расписании указана подгруппа, получаем только студентов этой подгруппы
        if (schedule.subgroupId) {
          // Получаем связи студент-подгруппа
          const studentSubgroupRecords = await db
            .select()
            .from(studentSubgroups)
            .where(eq(studentSubgroups.subgroupId, schedule.subgroupId));
            
          // Получаем ID студентов для данной подгруппы
          const studentIds = studentSubgroupRecords.map(r => r.studentId);
          console.log(`Найдено ${studentIds.length} студентов в подгруппе ${schedule.subgroupId}`);
          
          // Получаем информацию о студентах
          if (studentIds.length > 0) {
            students = await dataStorage.getClassStudents(schedule.classId);
            console.log(`Найдено ${students.length} студентов в классе ${schedule.classId}`);
            // Фильтруем только студентов из текущей подгруппы
            students = students.filter(student => studentIds.includes(student.id));
            console.log(`После фильтрации осталось ${students.length} студентов в подгруппе ${schedule.subgroupId}`);
          }
        } else {
          // Получаем список всех студентов класса, если подгруппа не указана
          students = await dataStorage.getClassStudents(schedule.classId);
        }
        
        // Получаем записи о посещаемости для данного урока используя новый метод
        const attendanceRecords = await dataStorage.getAttendanceBySchedule(scheduleId);
        
        // Формируем результат с информацией о каждом студенте и его статусе посещения
        const studentAttendance = students.map(student => {
          const attendanceRecord = attendanceRecords.find(a => a.studentId === student.id);
          return {
            studentId: student.id,
            studentName: `${student.lastName} ${student.firstName}`,
            attendance: attendanceRecord || null
          };
        });
        
        return res.json(studentAttendance);
      } else {
        return res.status(403).json({ message: "Forbidden" });
      }
    } else if (req.query.studentId) {
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
      
      attendanceList = await dataStorage.getAttendanceByStudent(studentId);
    } else if (req.query.classId) {
      const classId = parseInt(req.query.classId as string);
      
      // Teachers, school admins, principals, and vice principals can view class attendance
      if ([UserRoleEnum.TEACHER, UserRoleEnum.SCHOOL_ADMIN, UserRoleEnum.PRINCIPAL, UserRoleEnum.VICE_PRINCIPAL].includes(req.user.role)) {
        attendanceList = await dataStorage.getAttendanceByClass(classId);
      } else {
        return res.status(403).json({ message: "Forbidden" });
      }
    } else if (req.user.role === UserRoleEnum.STUDENT) {
      attendanceList = await dataStorage.getAttendanceByStudent(req.user.id);
    }
    
    res.json(attendanceList);
  });

  app.post("/api/attendance", hasRole([UserRoleEnum.TEACHER, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    try {
      console.log("Получен запрос на создание/обновление посещаемости:", req.body);
      
      // Проверяем формат запроса - это может быть массив для пакетной обработки или объект для одной записи
      const isBulkOperation = Array.isArray(req.body);
      
      // Берем scheduleId из запроса для проверки состояния урока
      let scheduleId;
      if (isBulkOperation) {
        if (req.body.length === 0) {
          return res.status(400).json({ message: "Empty attendance list provided" });
        }
        scheduleId = req.body[0].scheduleId;
      } else {
        scheduleId = req.body.scheduleId;
      }
      
      if (!scheduleId) {
        return res.status(400).json({ message: "scheduleId is required" });
      }
      
      // Проверяем, что урок существует и проведен
      const schedule = await dataStorage.getSchedule(scheduleId);
      if (!schedule) {
        console.log("Расписание не найдено:", scheduleId);
        return res.status(404).json({ message: "Schedule not found" });
      }
      
      console.log("Статус расписания:", schedule.status);
      if (schedule.status !== "conducted") {
        console.log("Невозможно отметить посещаемость для непроведенного урока");
        return res.status(400).json({ message: "Cannot record attendance for non-conducted lessons" });
      }
      
      // Получаем все существующие записи о посещаемости для данного урока
      const existingAttendanceRecords = await db
        .select()
        .from(attendance)
        .where(eq(attendance.scheduleId, scheduleId));
      
      console.log(`Найдено ${existingAttendanceRecords.length} существующих записей для урока ${scheduleId}`);
      
      // Обработка в зависимости от типа запроса
      if (isBulkOperation) {
        const results = [];
        
        // Для каждой записи в массиве
        for (const attendanceItem of req.body) {
          if (!attendanceItem.studentId || !attendanceItem.scheduleId || !attendanceItem.classId) {
            console.log("Пропускаем некорректную запись:", attendanceItem);
            continue;
          }
          
          // Ищем существующую запись для этого студента
          const existingRecord = existingAttendanceRecords.find(
            record => record.studentId === attendanceItem.studentId
          );
          
          // Определяем дату (из запроса, из расписания или текущую)
          const attendanceDate = 
            attendanceItem.date || 
            schedule.scheduleDate || 
            new Date().toISOString().split('T')[0];
          
          if (existingRecord) {
            // Обновляем существующую запись
            const [updatedRecord] = await db.update(attendance)
              .set({
                status: attendanceItem.status,
                comment: attendanceItem.comment,
                date: attendanceDate
              })
              .where(eq(attendance.id, existingRecord.id))
              .returning();
              
            console.log(`Обновлена запись для студента ${attendanceItem.studentId}`);
            results.push(updatedRecord);
            
            // Отправляем уведомление родителям, если студент отсутствует
            if (updatedRecord.status !== "present" && updatedRecord.status !== existingRecord.status) {
              await notifyParentsAboutAbsence(updatedRecord.studentId, updatedRecord.status);
            }
          } else {
            // Создаем новую запись
            const [newRecord] = await db.insert(attendance)
              .values({
                studentId: attendanceItem.studentId,
                scheduleId: attendanceItem.scheduleId,
                classId: attendanceItem.classId,
                status: attendanceItem.status,
                date: attendanceDate,
                comment: attendanceItem.comment
              })
              .returning();
              
            console.log(`Создана новая запись для студента ${attendanceItem.studentId}`);
            results.push(newRecord);
            
            // Отправляем уведомление родителям, если студент отсутствует
            if (newRecord.status !== "present") {
              await notifyParentsAboutAbsence(newRecord.studentId, newRecord.status);
            }
          }
        }
        
        // Логируем массовое обновление
        await dataStorage.createSystemLog({
          userId: req.user.id,
          action: "attendance_bulk_updated",
          details: `Updated attendance for ${results.length} students in schedule ${scheduleId}`,
          ipAddress: req.ip
        });
        
        return res.status(200).json(results);
      } else {
        // Обработка одиночной записи
        if (!req.body.studentId || !req.body.classId) {
          return res.status(400).json({ 
            message: "Invalid request data. studentId, scheduleId, and classId are required" 
          });
        }
        
        // Ищем существующую запись для этого студента
        const existingRecord = existingAttendanceRecords.find(
          record => record.studentId === req.body.studentId
        );
        
        // Определяем дату (из запроса, из расписания или текущую)
        const attendanceDate = 
          req.body.date || 
          schedule.scheduleDate || 
          new Date().toISOString().split('T')[0];
        
        let result;
        
        if (existingRecord) {
          // Обновляем существующую запись
          const [updatedRecord] = await db.update(attendance)
            .set({
              status: req.body.status,
              comment: req.body.comment,
              date: attendanceDate
            })
            .where(eq(attendance.id, existingRecord.id))
            .returning();
            
          console.log(`Обновлена запись для студента ${req.body.studentId}:`, updatedRecord);
          result = updatedRecord;
          
          // Логируем обновление
          await dataStorage.createSystemLog({
            userId: req.user.id,
            action: "attendance_updated",
            details: `Updated attendance for student ${updatedRecord.studentId}: ${updatedRecord.status}`,
            ipAddress: req.ip
          });
          
          // Отправляем уведомление родителям, если студент отсутствует
          if (updatedRecord.status !== "present" && updatedRecord.status !== existingRecord.status) {
            await notifyParentsAboutAbsence(updatedRecord.studentId, updatedRecord.status);
          }
        } else {
          // Создаем новую запись
          const [newRecord] = await db.insert(attendance)
            .values({
              studentId: req.body.studentId,
              scheduleId: req.body.scheduleId,
              classId: req.body.classId,
              status: req.body.status,
              date: attendanceDate,
              comment: req.body.comment
            })
            .returning();
            
          console.log(`Создана новая запись для студента ${req.body.studentId}:`, newRecord);
          result = newRecord;
          
          // Логируем создание
          await dataStorage.createSystemLog({
            userId: req.user.id,
            action: "attendance_created",
            details: `Recorded attendance for student ${newRecord.studentId}: ${newRecord.status}`,
            ipAddress: req.ip
          });
          
          // Отправляем уведомление родителям, если студент отсутствует
          if (newRecord.status !== "present") {
            await notifyParentsAboutAbsence(newRecord.studentId, newRecord.status);
          }
        }
        
        return res.status(200).json(result);
      }
    } catch (error) {
      console.error("Ошибка при обработке запроса на обновление посещаемости:", error);
      return res.status(500).json({ 
        message: "Error processing attendance update", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Вспомогательная функция для отправки уведомлений родителям об отсутствии ученика
  async function notifyParentsAboutAbsence(studentId: number, status: string) {
    try {
      const student = await dataStorage.getUser(studentId);
      if (!student) return;
      
      const relationships = await dataStorage.getStudentParents(student.id);
      
      for (const relationship of relationships) {
        const parent = await dataStorage.getUser(relationship.parentId);
        if (parent) {
          await dataStorage.createNotification({
            userId: parent.id,
            title: "Отсутствие на уроке",
            content: `Ваш ребенок ${student.lastName} ${student.firstName} отмечен как "${status}" на уроке`
          });
        }
      }
    } catch (error) {
      console.error("Ошибка при отправке уведомлений родителям:", error);
    }
  }

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
      
      // Получаем связи студент-класс напрямую из БД, чтобы сохранить структуру {studentId, classId}
      try {
        const studentClassConnections = await db
          .select()
          .from(studentClassesTable)
          .where(eq(studentClassesTable.studentId, studentId));
          
        console.log(`Получены связи студент-класс для студента ${studentId}:`, studentClassConnections);
        return res.json(studentClassConnections);
      } catch (error) {
        console.error("Ошибка при получении связей студент-класс:", error);
        return res.status(500).json({ message: "Ошибка при получении классов студента" });
      }
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
    
    // Проверим, существует ли активная роль среди доступных ролей пользователя
    const activeRoleExists = req.user.activeRole && 
                            result.some(role => role.role === req.user.activeRole);

    // Пометим активную роль или первую доступную, если активной больше нет
    if (activeRoleExists) {
      // Если активная роль существует, отметим её
      for (const role of result) {
        role.isActive = role.role === req.user.activeRole;
      }
    } else {
      // Если активной роли нет или она была удалена, пометим первую роль как активную
      if (result.length > 0) {
        result[0].isActive = true;
        
        // Также обновим активную роль в сессии
        if (req.session) {
          const user = req.user as any;
          user.activeRole = result[0].role;
          req.session.save();
        }
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
      
      // Для каждого расписания получаем связанные задания
      for (const schedule of schedules) {
        try {
          // Получаем задания для урока независимо от статуса
          const assignments = await dataStorage.getAssignmentsBySchedule(schedule.id);
          if (assignments && assignments.length > 0) {
            // Добавляем задания к объекту расписания
            schedule.assignments = assignments;
          }
        } catch (error) {
          console.error(`Error fetching assignments for schedule ${schedule.id}:`, error);
          // Продолжаем работу даже при ошибке получения заданий
        }
      }
      
      res.json(schedules);
    } catch (error) {
      console.error("Error fetching student schedules:", error);
      res.status(500).json({ message: "Failed to fetch student schedules" });
    }
  });

  // Маршрут для получения учеников по ID класса для страницы оценок
  // API endpoint для получения студентов по идентификатору подгруппы
  app.get("/api/students-by-subgroup/:subgroupId", isAuthenticated, async (req, res) => {
    const subgroupId = parseInt(req.params.subgroupId);
    if (isNaN(subgroupId)) {
      return res.status(400).json({ message: "Invalid subgroup ID" });
    }
    
    console.log(`Запрос списка студентов для подгруппы с ID=${subgroupId}`);
    
    try {
      // Получаем информацию о подгруппе
      const subgroup = await dataStorage.getSubgroup(subgroupId);
      if (!subgroup) {
        return res.status(404).json({ message: "Subgroup not found" });
      }
      
      // Получаем студентов подгруппы
      const students = await dataStorage.getSubgroupStudents(subgroupId);
      console.log(`Найдено ${students.length} студентов в подгруппе ${subgroupId}`);
      
      res.json(students);
    } catch (error) {
      console.error(`Ошибка при получении студентов подгруппы ${subgroupId}:`, error);
      res.status(500).json({ message: "Failed to fetch students" });
    }
  });
  
  app.get("/api/students-by-class/:classId", isAuthenticated, async (req, res) => {
    const classId = parseInt(req.params.classId);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }
    
    console.log(`Запрос списка студентов для класса с ID=${classId} от пользователя ${req.user.username} (${req.user.role})`);
    
    try {
      // Получаем информацию о классе для отладки
      const classObj = await dataStorage.getClass(classId);
      console.log(`Информация о классе: ${JSON.stringify(classObj)}`);
      
      // Проверяем, имеет ли пользователь доступ к классу
      if (req.user.role === UserRoleEnum.SCHOOL_ADMIN) {
        if (!classObj || classObj.schoolId !== req.user.schoolId) {
          return res.status(403).json({ message: "You can only view students in classes of your school" });
        }
      } else if (req.user.role === UserRoleEnum.TEACHER) {
        // Учитель может видеть только учеников тех классов, где преподает
        const schedules = await dataStorage.getSchedulesByTeacher(req.user.id);
        const teacherClassIds = [...new Set(schedules.map(s => s.classId))];
        console.log(`Классы, где преподает учитель: ${JSON.stringify(teacherClassIds)}`);
        
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
        console.log(`Роль классного руководителя: ${JSON.stringify(classTeacherRole)}`);
        
        if (!classTeacherRole) {
          return res.status(403).json({ message: "You can only view students in your assigned class" });
        }
      } else if (![UserRoleEnum.SUPER_ADMIN, UserRoleEnum.PRINCIPAL, UserRoleEnum.VICE_PRINCIPAL].includes(req.user.role)) {
        return res.status(403).json({ message: "You don't have permission to view class students" });
      }
      
      // Получаем студентов этого класса
      const students = await dataStorage.getClassStudents(classId);
      console.log(`Получено ${students.length} студентов для класса ${classId}: ${JSON.stringify(students.map(s => ({ id: s.id, username: s.username })))}`);
      
      // Отладка: проверяем записи в таблице student_classes
      if (students.length === 0) {
        if (typeof db !== 'undefined') {
          try {
            // Только если используется реальная БД
            const dbStudentClasses = await db.select().from(studentClassesTable).where(eq(studentClassesTable.classId, classId));
            console.log(`Записи в таблице student_classes для класса ${classId}: ${JSON.stringify(dbStudentClasses)}`);
          } catch (error) {
            console.log(`Ошибка при проверке таблицы student_classes: ${error.message}`);
          }
        }
        
        // Проверяем, есть ли студенты с этим classId в поле classId
        const usersWithClassId = Array.from(dataStorage.users.values())
          .filter(user => user.role === UserRoleEnum.STUDENT && user.classId === classId);
        console.log(`Студенты с classId=${classId} в поле classId: ${JSON.stringify(usersWithClassId.map(u => ({ id: u.id, username: u.username })))}`);
      }
      
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
      
      // Для каждого расписания получаем связанные задания
      for (const schedule of studentSchedules) {
        try {
          // Получаем задания для урока независимо от статуса
          const assignments = await dataStorage.getAssignmentsBySchedule(schedule.id);
          if (assignments && assignments.length > 0) {
            // Добавляем задания к объекту расписания
            schedule.assignments = assignments;
          }
        } catch (error) {
          console.error(`Error fetching assignments for schedule ${schedule.id}:`, error);
          // Продолжаем работу даже при ошибке получения заданий
        }
      }
      
      res.json(studentSchedules);
    } catch (error) {
      console.error("Error fetching student schedules:", error);
      return res.status(500).json({ message: "Failed to fetch student schedules" });
    }
  });
  
  // ===== Assignment routes =====

  // Общий маршрут для получения заданий с фильтрацией по параметрам
  app.get("/api/assignments", isAuthenticated, async (req, res) => {
    try {
      const { classId, subjectId, subgroupId } = req.query;
      
      let assignments = [];
      
      // Проверка что параметры могут быть преобразованы в числа
      let classIdNum = null;
      let subjectIdNum = null;
      let subgroupIdNum = null;
      
      // Безопасное преобразование строковых ID в числа
      if (classId) {
        const parsed = parseInt(String(classId), 10);
        if (!isNaN(parsed)) {
          classIdNum = parsed;
        } else {
          console.log(`Invalid classId: ${classId}`);
          return res.json([]);
        }
      }
      
      if (subjectId) {
        const parsed = parseInt(String(subjectId), 10);
        if (!isNaN(parsed)) {
          subjectIdNum = parsed;
        } else {
          console.log(`Invalid subjectId: ${subjectId}`);
          return res.json([]);
        }
      }
      
      if (subgroupId) {
        const parsed = parseInt(String(subgroupId), 10);
        if (!isNaN(parsed)) {
          subgroupIdNum = parsed;
        } else {
          console.log(`Invalid subgroupId: ${subgroupId}`);
          return res.json([]);
        }
      }
      
      // Если указан classId и subjectId, получаем задания для класса и предмета
      if (classIdNum && subjectIdNum) {
        // Получаем задания для класса
        const classAssignments = await dataStorage.getAssignmentsByClass(classIdNum);
        
        // Фильтруем по предмету
        assignments = classAssignments.filter(assignment => 
          assignment.subjectId === subjectIdNum
        );
        
        // Если указан subgroupId, фильтруем дополнительно
        if (subgroupIdNum) {
          assignments = assignments.filter(assignment => 
            assignment.subgroupId === subgroupIdNum
          );
        }
      } else if (classIdNum) {
        // Если указан только classId
        assignments = await dataStorage.getAssignmentsByClass(classIdNum);
      } else if (subjectIdNum) {
        // Если указан только subjectId
        assignments = await dataStorage.getAssignmentsBySubject(subjectIdNum);
      } else if (subgroupIdNum) {
        // Если указан только subgroupId
        assignments = await dataStorage.getAssignmentsBySubgroup(subgroupIdNum);
      }
      
      console.log(`Assignments found: ${assignments.length} for query:`, req.query);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching assignments:", error);
      res.status(500).json({ message: "Failed to fetch assignments" });
    }
  });

  // Получение всех заданий для класса
  app.get("/api/assignments/class/:classId", isAuthenticated, async (req, res) => {
    try {
      const classId = parseInt(req.params.classId);
      const assignments = await dataStorage.getAssignmentsByClass(classId);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching assignments:", error);
      res.status(500).json({ message: "Failed to fetch assignments" });
    }
  });

  // Получение всех заданий учителя
  app.get("/api/assignments/teacher/:teacherId", isAuthenticated, async (req, res) => {
    try {
      const teacherId = parseInt(req.params.teacherId);
      const assignments = await dataStorage.getAssignmentsByTeacher(teacherId);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching teacher assignments:", error);
      res.status(500).json({ message: "Failed to fetch teacher assignments" });
    }
  });

  // Получение всех заданий для предмета
  app.get("/api/assignments/subject/:subjectId", isAuthenticated, async (req, res) => {
    try {
      const subjectId = parseInt(req.params.subjectId);
      const assignments = await dataStorage.getAssignmentsBySubject(subjectId);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching subject assignments:", error);
      res.status(500).json({ message: "Failed to fetch subject assignments" });
    }
  });

  // Получение всех заданий для подгруппы
  app.get("/api/assignments/subgroup/:subgroupId", isAuthenticated, async (req, res) => {
    try {
      const subgroupId = parseInt(req.params.subgroupId);
      const assignments = await dataStorage.getAssignmentsBySubgroup(subgroupId);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching subgroup assignments:", error);
      res.status(500).json({ message: "Failed to fetch subgroup assignments" });
    }
  });

  // Получение всех заданий для урока (расписания)
  app.get("/api/assignments/schedule/:scheduleId", isAuthenticated, async (req, res) => {
    try {
      const scheduleId = parseInt(req.params.scheduleId);
      const assignments = await dataStorage.getAssignmentsBySchedule(scheduleId);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching schedule assignments:", error);
      res.status(500).json({ message: "Failed to fetch schedule assignments" });
    }
  });

  // Получение задания по ID
  app.get("/api/assignments/:id", isAuthenticated, async (req, res) => {
    try {
      const assignmentId = parseInt(req.params.id);
      const assignment = await dataStorage.getAssignment(assignmentId);
      
      if (!assignment) {
        return res.status(404).json({ message: "Assignment not found" });
      }
      
      res.json(assignment);
    } catch (error) {
      console.error("Error fetching assignment:", error);
      res.status(500).json({ message: "Failed to fetch assignment" });
    }
  });

  // Создание нового задания (для учителей и администраторов)
  app.post("/api/assignments", isAuthenticated, hasRole([
    UserRoleEnum.TEACHER, 
    UserRoleEnum.SCHOOL_ADMIN, 
    UserRoleEnum.SUPER_ADMIN, 
    UserRoleEnum.CLASS_TEACHER
  ]), async (req, res) => {
    try {
      const assignment = req.body;
      const newAssignment = await dataStorage.createAssignment(assignment);
      res.status(201).json(newAssignment);
    } catch (error) {
      console.error("Error creating assignment:", error);
      res.status(500).json({ message: "Failed to create assignment" });
    }
  });

  // Обновление задания
  app.patch("/api/assignments/:id", isAuthenticated, hasRole([
    UserRoleEnum.TEACHER, 
    UserRoleEnum.SCHOOL_ADMIN, 
    UserRoleEnum.SUPER_ADMIN, 
    UserRoleEnum.CLASS_TEACHER
  ]), async (req, res) => {
    try {
      const assignmentId = parseInt(req.params.id);
      const assignmentData = req.body;
      
      const updatedAssignment = await dataStorage.updateAssignment(assignmentId, assignmentData);
      
      if (!updatedAssignment) {
        return res.status(404).json({ message: "Assignment not found" });
      }
      
      res.json(updatedAssignment);
    } catch (error) {
      console.error("Error updating assignment:", error);
      res.status(500).json({ message: "Failed to update assignment" });
    }
  });

  // Удаление задания
  app.delete("/api/assignments/:id", isAuthenticated, hasRole([
    UserRoleEnum.TEACHER, 
    UserRoleEnum.SCHOOL_ADMIN, 
    UserRoleEnum.SUPER_ADMIN, 
    UserRoleEnum.CLASS_TEACHER
  ]), async (req, res) => {
    try {
      const assignmentId = parseInt(req.params.id);
      
      const deletedAssignment = await dataStorage.deleteAssignment(assignmentId);
      
      if (!deletedAssignment) {
        return res.status(404).json({ message: "Assignment not found" });
      }
      
      res.json({ message: "Assignment deleted successfully", assignment: deletedAssignment });
    } catch (error) {
      console.error("Error deleting assignment:", error);
      res.status(500).json({ message: "Failed to delete assignment" });
    }
  });

  // ===== Cumulative Grade routes =====

  // Получение всех накопительных оценок по заданию
  app.get("/api/cumulative-grades/assignment/:assignmentId", isAuthenticated, async (req, res) => {
    try {
      const assignmentId = parseInt(req.params.assignmentId);
      const grades = await dataStorage.getCumulativeGradesByAssignment(assignmentId);
      res.json(grades);
    } catch (error) {
      console.error("Error fetching cumulative grades:", error);
      res.status(500).json({ message: "Failed to fetch cumulative grades" });
    }
  });

  // Получение всех накопительных оценок ученика
  app.get("/api/cumulative-grades/student/:studentId", isAuthenticated, async (req, res) => {
    try {
      const studentId = parseInt(req.params.studentId);
      const grades = await dataStorage.getCumulativeGradesByStudent(studentId);
      res.json(grades);
    } catch (error) {
      console.error("Error fetching student cumulative grades:", error);
      res.status(500).json({ message: "Failed to fetch student cumulative grades" });
    }
  });

  // Получение конкретной накопительной оценки ученика по заданию
  app.get("/api/cumulative-grades/student/:studentId/assignment/:assignmentId", isAuthenticated, async (req, res) => {
    try {
      const studentId = parseInt(req.params.studentId);
      const assignmentId = parseInt(req.params.assignmentId);
      
      const grade = await dataStorage.getStudentCumulativeGradesByAssignment(studentId, assignmentId);
      
      if (!grade) {
        return res.status(404).json({ message: "Cumulative grade not found" });
      }
      
      res.json(grade);
    } catch (error) {
      console.error("Error fetching student's cumulative grade for assignment:", error);
      res.status(500).json({ message: "Failed to fetch student's cumulative grade" });
    }
  });

  // Получение накопительной оценки по ID
  app.get("/api/cumulative-grades/:id", isAuthenticated, async (req, res) => {
    try {
      const gradeId = parseInt(req.params.id);
      const grade = await dataStorage.getCumulativeGrade(gradeId);
      
      if (!grade) {
        return res.status(404).json({ message: "Cumulative grade not found" });
      }
      
      res.json(grade);
    } catch (error) {
      console.error("Error fetching cumulative grade:", error);
      res.status(500).json({ message: "Failed to fetch cumulative grade" });
    }
  });

  // Создание новой накопительной оценки
  app.post("/api/cumulative-grades", isAuthenticated, hasRole([
    UserRoleEnum.TEACHER, 
    UserRoleEnum.SCHOOL_ADMIN, 
    UserRoleEnum.SUPER_ADMIN, 
    UserRoleEnum.CLASS_TEACHER
  ]), async (req, res) => {
    try {
      const grade = req.body;
      const newGrade = await dataStorage.createCumulativeGrade(grade);
      res.status(201).json(newGrade);
    } catch (error) {
      console.error("Error creating cumulative grade:", error);
      res.status(500).json({ message: "Failed to create cumulative grade" });
    }
  });

  // Обновление накопительной оценки
  app.patch("/api/cumulative-grades/:id", isAuthenticated, hasRole([
    UserRoleEnum.TEACHER, 
    UserRoleEnum.SCHOOL_ADMIN, 
    UserRoleEnum.SUPER_ADMIN, 
    UserRoleEnum.CLASS_TEACHER
  ]), async (req, res) => {
    try {
      const gradeId = parseInt(req.params.id);
      const gradeData = req.body;
      
      const updatedGrade = await dataStorage.updateCumulativeGrade(gradeId, gradeData);
      
      if (!updatedGrade) {
        return res.status(404).json({ message: "Cumulative grade not found" });
      }
      
      res.json(updatedGrade);
    } catch (error) {
      console.error("Error updating cumulative grade:", error);
      res.status(500).json({ message: "Failed to update cumulative grade" });
    }
  });

  // Удаление накопительной оценки
  app.delete("/api/cumulative-grades/:id", isAuthenticated, hasRole([
    UserRoleEnum.TEACHER, 
    UserRoleEnum.SCHOOL_ADMIN, 
    UserRoleEnum.SUPER_ADMIN, 
    UserRoleEnum.CLASS_TEACHER
  ]), async (req, res) => {
    try {
      const gradeId = parseInt(req.params.id);
      
      const deletedGrade = await dataStorage.deleteCumulativeGrade(gradeId);
      
      if (!deletedGrade) {
        return res.status(404).json({ message: "Cumulative grade not found" });
      }
      
      res.json({ message: "Cumulative grade deleted successfully", grade: deletedGrade });
    } catch (error) {
      console.error("Error deleting cumulative grade:", error);
      res.status(500).json({ message: "Failed to delete cumulative grade" });
    }
  });

  // Получение среднего балла для всех заданий класса
  app.get("/api/class/:classId/average-scores", isAuthenticated, async (req, res) => {
    try {
      const classId = parseInt(req.params.classId);
      const averageScores = await dataStorage.calculateClassAverageScores(classId);
      res.json(averageScores);
    } catch (error) {
      console.error("Error calculating class average scores:", error);
      res.status(500).json({ message: "Failed to calculate class average scores" });
    }
  });

  // === API для работы с временными слотами ===

  // Инициализация слотов по умолчанию при первичном запросе
  app.get("/api/time-slots/defaults", isAuthenticated, async (req, res) => {
    try {
      // Проверяем наличие и инициализируем слоты по умолчанию, если их нет
      const timeSlots = await dataStorage.initializeDefaultTimeSlots();
      res.json(timeSlots);
    } catch (error) {
      console.error("Error initializing default time slots:", error);
      res.status(500).json({ message: "Failed to initialize default time slots" });
    }
  });

  // Получение всех временных слотов по умолчанию
  app.get("/api/time-slots", isAuthenticated, async (req, res) => {
    try {
      const timeSlots = await dataStorage.getDefaultTimeSlots();
      res.json(timeSlots);
    } catch (error) {
      console.error("Error getting time slots:", error);
      res.status(500).json({ message: "Failed to get time slots" });
    }
  });

  // Получение временных слотов для школы
  app.get("/api/school/:schoolId/time-slots", isAuthenticated, async (req, res) => {
    try {
      const schoolId = parseInt(req.params.schoolId);
      const timeSlots = await dataStorage.getSchoolTimeSlots(schoolId);
      res.json(timeSlots);
    } catch (error) {
      console.error("Error getting school time slots:", error);
      res.status(500).json({ message: "Failed to get school time slots" });
    }
  });

  // Обновление временного слота по умолчанию
  app.put("/api/time-slots/:id", isAuthenticated, hasRole([UserRoleEnum.SUPER_ADMIN]), async (req, res) => {
    try {
      const slotId = parseInt(req.params.id);
      const timeSlot = req.body;
      const updatedSlot = await dataStorage.updateTimeSlot(slotId, timeSlot);
      if (!updatedSlot) {
        return res.status(404).json({ message: "Time slot not found" });
      }
      res.json(updatedSlot);
    } catch (error) {
      console.error("Error updating time slot:", error);
      res.status(500).json({ message: "Failed to update time slot" });
    }
  });

  // Получение настроек временных слотов для класса
  app.get("/api/class/:classId/time-slots", isAuthenticated, async (req, res) => {
    try {
      const classId = parseInt(req.params.classId);
      const timeSlots = await dataStorage.getClassTimeSlots(classId);
      res.json(timeSlots);
    } catch (error) {
      console.error("Error getting class time slots:", error);
      res.status(500).json({ message: "Failed to get class time slots" });
    }
  });

  // Создание настройки временного слота для класса
  app.post("/api/class/:classId/time-slots", isAuthenticated, hasRole([UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    try {
      const classId = parseInt(req.params.classId);
      const timeSlot = req.body;
      
      // Проверяем, существует ли уже слот для этого класса с таким же номером
      const existingSlot = await dataStorage.getClassTimeSlotByNumber(classId, timeSlot.slotNumber);
      if (existingSlot) {
        // Если слот уже существует, обновляем его
        const updatedSlot = await dataStorage.updateClassTimeSlot(existingSlot.id, timeSlot);
        return res.json(updatedSlot);
      }
      
      // Если слота нет, создаем новый
      const newSlot = await dataStorage.createClassTimeSlot({
        ...timeSlot,
        classId
      });
      res.status(201).json(newSlot);
    } catch (error) {
      console.error("Error creating class time slot:", error);
      res.status(500).json({ message: "Failed to create class time slot" });
    }
  });

  // Обновление настройки временного слота для класса
  app.put("/api/class-time-slots/:id", isAuthenticated, hasRole([UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    try {
      const slotId = parseInt(req.params.id);
      const timeSlot = req.body;
      const updatedSlot = await dataStorage.updateClassTimeSlot(slotId, timeSlot);
      if (!updatedSlot) {
        return res.status(404).json({ message: "Class time slot not found" });
      }
      res.json(updatedSlot);
    } catch (error) {
      console.error("Error updating class time slot:", error);
      res.status(500).json({ message: "Failed to update class time slot" });
    }
  });

  // Удаление настройки временного слота для класса
  app.delete("/api/class-time-slots/:id", isAuthenticated, hasRole([UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    try {
      const slotId = parseInt(req.params.id);
      const deletedSlot = await dataStorage.deleteClassTimeSlot(slotId);
      if (!deletedSlot) {
        return res.status(404).json({ message: "Class time slot not found" });
      }
      res.json({ message: "Class time slot deleted successfully" });
    } catch (error) {
      console.error("Error deleting class time slot:", error);
      res.status(500).json({ message: "Failed to delete class time slot" });
    }
  });

  // Сброс всех настроек временных слотов для класса
  // Старый метод DELETE - оставлен для обратной совместимости
  app.delete("/api/class/:classId/time-slots", isAuthenticated, hasRole([UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    try {
      const classId = parseInt(req.params.classId);
      await dataStorage.deleteClassTimeSlots(classId);
      res.json({ message: "All class time slots deleted successfully" });
    } catch (error) {
      console.error("Error deleting all class time slots:", error);
      res.status(500).json({ message: "Failed to delete all class time slots" });
    }
  });

  // Новый метод POST для сброса временных слотов класса
  app.post("/api/class/:classId/time-slots/reset", isAuthenticated, hasRole([UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    try {
      const classId = parseInt(req.params.classId);
      await dataStorage.deleteClassTimeSlots(classId);
      res.json({ message: "All class time slots reset successfully" });
    } catch (error) {
      console.error("Error resetting all class time slots:", error);
      res.status(500).json({ message: "Failed to reset all class time slots" });
    }
  });

  // Получение эффективного временного слота для класса
  app.get("/api/class/:classId/time-slots/:slotNumber/effective", isAuthenticated, async (req, res) => {
    try {
      const classId = parseInt(req.params.classId);
      const slotNumber = parseInt(req.params.slotNumber);
      const effectiveSlot = await dataStorage.getEffectiveTimeSlot(classId, slotNumber);
      if (!effectiveSlot) {
        return res.status(404).json({ message: "Effective time slot not found" });
      }
      res.json(effectiveSlot);
    } catch (error) {
      console.error("Error getting effective time slot:", error);
      res.status(500).json({ message: "Failed to get effective time slot" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
