import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { dbStorage } from "./db-storage";

// Выбираем хранилище для использования (БД или in-memory)
const dataStorage = process.env.USE_DATABASE === "true" ? dbStorage : storage;
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
    const { roleId } = req.body;
    
    if (!roleId) {
      return res.status(400).json({ message: "RoleId is required" });
    }
    
    try {
      // Получаем роль из пользовательских ролей
      const userRole = await dataStorage.getUserRole(parseInt(roleId));
      
      if (!userRole || userRole.userId !== req.user.id) {
        return res.status(403).json({ message: "Forbidden. Role not found or doesn't belong to user" });
      }
      
      // Обновляем активную роль пользователя
      const updatedUser = await dataStorage.updateUser(req.user.id, { 
        activeRole: userRole.role,
        // Если роль привязана к школе, обновляем и schoolId
        schoolId: userRole.schoolId
      });
      
      // Обновляем данные пользователя в сессии
      req.user.activeRole = userRole.role;
      req.user.schoolId = userRole.schoolId;
      
      // Создаем запись о действии пользователя
      await dataStorage.createSystemLog({
        userId: req.user.id,
        action: "role_switched",
        details: `User switched to role: ${userRole.role}`,
        ipAddress: req.ip
      });
      
      res.json(updatedUser);
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
    
    // Проверяем основную роль пользователя
    if (roles.includes(req.user.role)) {
      return next();
    }
    
    // Если ни активная, ни основная роль не подходит, проверяем дополнительные роли
    const userRoles = await dataStorage.getUserRoles(req.user.id);
    const userRoleValues = userRoles.map(ur => ur.role);
    
    if (roles.some(role => userRoleValues.includes(role))) {
      return next();
    }
    
    res.status(403).json({ message: "Forbidden" });
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
    if (req.user.role === UserRoleEnum.SUPER_ADMIN) {
      const users = await dataStorage.getUsers();
      return res.json(users);
    } else if (req.user.role === UserRoleEnum.SCHOOL_ADMIN && req.user.schoolId) {
      const users = await dataStorage.getUsersBySchool(req.user.schoolId);
      return res.json(users);
    }
    
    res.json([]);
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
    
    if (req.query.classId) {
      const classId = parseInt(req.query.classId as string);
      schedules = await dataStorage.getSchedulesByClass(classId);
    } else if (req.query.teacherId) {
      const teacherId = parseInt(req.query.teacherId as string);
      schedules = await dataStorage.getSchedulesByTeacher(teacherId);
    } else if (req.user.role === UserRoleEnum.TEACHER) {
      schedules = await dataStorage.getSchedulesByTeacher(req.user.id);
    } else if (req.user.role === UserRoleEnum.STUDENT) {
      // Get all classes for the student
      const classes = await dataStorage.getStudentClasses(req.user.id);
      
      // Get schedules for each class
      for (const cls of classes) {
        const classSchedules = await dataStorage.getSchedulesByClass(cls.id);
        schedules.push(...classSchedules);
      }
    }
    
    res.json(schedules);
  });

  app.post("/api/schedules", hasRole([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]), async (req, res) => {
    const schedule = await dataStorage.createSchedule(req.body);
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "schedule_created",
      details: `Created schedule entry`,
      ipAddress: req.ip
    });
    
    res.status(201).json(schedule);
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
    const homework = await dataStorage.createHomework({
      ...req.body,
      teacherId: req.user.id
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
      
      grades = await dataStorage.getGradesByStudent(studentId);
    } else if (req.query.classId) {
      const classId = parseInt(req.query.classId as string);
      
      // Teachers, school admins, principals, and vice principals can view class grades
      if ([UserRoleEnum.TEACHER, UserRoleEnum.SCHOOL_ADMIN, UserRoleEnum.PRINCIPAL, UserRoleEnum.VICE_PRINCIPAL].includes(req.user.role)) {
        grades = await dataStorage.getGradesByClass(classId);
      } else {
        return res.status(403).json({ message: "Forbidden" });
      }
    } else if (req.user.role === UserRoleEnum.STUDENT) {
      grades = await dataStorage.getGradesByStudent(req.user.id);
    }
    
    res.json(grades);
  });

  app.post("/api/grades", hasRole([UserRoleEnum.TEACHER]), async (req, res) => {
    const grade = await dataStorage.createGrade({
      ...req.body,
      teacherId: req.user.id
    });
    
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
    const { userId, role, schoolId } = req.body;
    
    const user = await dataStorage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Проверка прав: школьный администратор может добавлять роли только пользователям своей школы
    if (req.user.role === UserRoleEnum.SCHOOL_ADMIN && user.schoolId !== req.user.schoolId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    // Проверяем, не существует ли уже такая роль у пользователя
    const existingRoles = await dataStorage.getUserRoles(userId);
    if (existingRoles.some(r => r.role === role && r.schoolId === schoolId)) {
      return res.status(400).json({ message: "User already has this role" });
    }
    
    const userRole = await dataStorage.addUserRole({ userId, role, schoolId });
    
    // Log the action
    await dataStorage.createSystemLog({
      userId: req.user.id,
      action: "user_role_added",
      details: `Added role ${role} to user ${userId}`,
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

  const httpServer = createServer(app);
  return httpServer;
}
