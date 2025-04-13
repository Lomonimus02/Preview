import { IStorage } from './storage';
import { db } from './db';
import { eq, and, or, inArray, sql } from 'drizzle-orm';
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import {
  User, InsertUser,
  School, InsertSchool,
  Class, InsertClass,
  Subject, InsertSubject,
  Schedule, InsertSchedule,
  Homework, InsertHomework,
  HomeworkSubmission, InsertHomeworkSubmission,
  Grade, InsertGrade,
  Attendance, InsertAttendance,
  Document, InsertDocument,
  Message, InsertMessage,
  Notification, InsertNotification,
  ParentStudent, InsertParentStudent,
  SystemLog, InsertSystemLog,
  UserRoleEnum, UserRoleModel, InsertUserRole,
  Subgroup, InsertSubgroup,
  StudentSubgroup, InsertStudentSubgroup,
  Assignment, InsertAssignment, AssignmentTypeEnum,
  CumulativeGrade, InsertCumulativeGrade, GradingSystemEnum,
  TimeSlot, InsertTimeSlot,
  ClassTimeSlot, InsertClassTimeSlot,
  users, schools, classes, subjects, schedules,
  homework, homeworkSubmissions, grades, attendance,
  documents, messages, notifications, parentStudents,
  systemLogs, teacherSubjects, studentClasses, userRoles,
  subgroups, studentSubgroups, assignments, cumulativeGrades,
  timeSlots, classTimeSlots
} from '@shared/schema';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import pkg from 'pg';
const { Pool } = pkg;

// Создаем хранилище сессий на базе PostgreSQL
const PostgresStore = connectPg(session);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export class DatabaseStorage implements IStorage {
  // Хранилище сессий
  sessionStore: session.Store;

  constructor() {
    // Инициализируем хранилище сессий
    this.sessionStore = new PostgresStore({
      pool,
      tableName: 'session', // Имя таблицы для хранения сессий
      createTableIfMissing: true
    });
  }
  
  // Метод для хеширования паролей
  async hashPassword(password: string): Promise<string> {
    const scryptAsync = promisify(scrypt);
    const salt = randomBytes(16).toString("hex");
    const buf = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${buf.toString("hex")}.${salt}`;
  }
  
  // Метод для сравнения паролей
  async comparePasswords(supplied: string, stored: string): Promise<boolean> {
    const scryptAsync = promisify(scrypt);
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

  // ===== User operations =====
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }
  
  async getUsersCount(): Promise<number> {
    const result = await db.select({ count: sql`count(*)` }).from(users);
    return Number(result[0].count);
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async updateUser(id: number, user: Partial<InsertUser>): Promise<User | undefined> {
    const [updatedUser] = await db.update(users)
      .set(user)
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async deleteUser(id: number): Promise<User | undefined> {
    // Получаем пользователя перед удалением
    const userToDelete = await this.getUser(id);
    if (!userToDelete) return undefined;
    
    // Удаляем пользователя
    await db.delete(users)
      .where(eq(users.id, id));
    
    return userToDelete;
  }

  async getUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getUsersByRole(role: UserRoleEnum): Promise<User[]> {
    return await db.select().from(users).where(eq(users.role, role));
  }

  async getUsersBySchool(schoolId: number): Promise<User[]> {
    // Get users who have this school directly in their profile
    const usersWithSchoolId = await db.select().from(users).where(eq(users.schoolId, schoolId));
    
    // Get users with this school in their user roles
    const userRolesWithSchool = await db.select().from(userRoles)
      .where(eq(userRoles.schoolId, schoolId));
    
    const userIdsWithRoles = new Set(userRolesWithSchool.map(role => role.userId));
    
    // For users who have roles but no direct school, fetch their full profiles
    const usersWithRolesOnly = [];
    for (const userId of userIdsWithRoles) {
      // Skip users we've already fetched directly
      if (usersWithSchoolId.some(u => u.id === userId)) continue;
      
      const user = await this.getUser(userId);
      if (user) usersWithRolesOnly.push(user);
    }
    
    // Combine both sets of users
    return [...usersWithSchoolId, ...usersWithRolesOnly];
  }

  // ===== School operations =====
  async getSchool(id: number): Promise<School | undefined> {
    const result = await db.select().from(schools).where(eq(schools.id, id)).limit(1);
    return result[0];
  }

  async getSchools(): Promise<School[]> {
    return await db.select().from(schools);
  }

  async createSchool(school: InsertSchool): Promise<School> {
    const [newSchool] = await db.insert(schools).values(school).returning();
    return newSchool;
  }

  async updateSchool(id: number, school: Partial<InsertSchool>): Promise<School | undefined> {
    const [updatedSchool] = await db.update(schools)
      .set(school)
      .where(eq(schools.id, id))
      .returning();
    return updatedSchool;
  }

  async deleteSchool(id: number): Promise<School | undefined> {
    const [deletedSchool] = await db.delete(schools)
      .where(eq(schools.id, id))
      .returning();
    return deletedSchool;
  }

  // ===== Class operations =====
  async getClass(id: number): Promise<Class | undefined> {
    const result = await db.select().from(classes).where(eq(classes.id, id)).limit(1);
    return result[0];
  }

  async getClasses(schoolId: number): Promise<Class[]> {
    return await db.select().from(classes).where(eq(classes.schoolId, schoolId));
  }

  async createClass(classData: InsertClass): Promise<Class> {
    const [newClass] = await db.insert(classes).values(classData).returning();
    return newClass;
  }

  async updateClass(id: number, classData: Partial<InsertClass>): Promise<Class | undefined> {
    const [updatedClass] = await db.update(classes)
      .set(classData)
      .where(eq(classes.id, id))
      .returning();
    return updatedClass;
  }

  // ===== Subject operations =====
  async getSubject(id: number): Promise<Subject | undefined> {
    const result = await db.select().from(subjects).where(eq(subjects.id, id)).limit(1);
    return result[0];
  }

  async getSubjects(schoolId: number): Promise<Subject[]> {
    return await db.select().from(subjects).where(eq(subjects.schoolId, schoolId));
  }

  async createSubject(subject: InsertSubject): Promise<Subject> {
    const [newSubject] = await db.insert(subjects).values(subject).returning();
    return newSubject;
  }
  
  async deleteSubject(id: number): Promise<Subject | undefined> {
    const [deletedSubject] = await db.delete(subjects)
      .where(eq(subjects.id, id))
      .returning();
    return deletedSubject;
  }

  // ===== Schedule operations =====
  async getSchedule(id: number): Promise<Schedule | undefined> {
    const result = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1);
    return result[0];
  }

  async getSchedulesByClass(classId: number): Promise<Schedule[]> {
    return await db.select().from(schedules).where(eq(schedules.classId, classId));
  }

  async getSchedulesByTeacher(teacherId: number): Promise<Schedule[]> {
    return await db.select().from(schedules).where(eq(schedules.teacherId, teacherId));
  }

  async createSchedule(schedule: InsertSchedule): Promise<Schedule> {
    console.log('Creating schedule:', schedule);
    const [newSchedule] = await db.insert(schedules).values(schedule).returning();
    console.log('Created schedule:', newSchedule);
    return newSchedule;
  }
  
  async deleteSchedule(id: number): Promise<Schedule | undefined> {
    const [deletedSchedule] = await db.delete(schedules)
      .where(eq(schedules.id, id))
      .returning();
    return deletedSchedule;
  }
  
  async updateSchedule(id: number, schedule: Partial<InsertSchedule>): Promise<Schedule | undefined> {
    const [updatedSchedule] = await db.update(schedules)
      .set(schedule)
      .where(eq(schedules.id, id))
      .returning();
    return updatedSchedule;
  }
  
  async updateScheduleStatus(id: number, status: string): Promise<Schedule | undefined> {
    const [updatedSchedule] = await db.update(schedules)
      .set({ status })
      .where(eq(schedules.id, id))
      .returning();
    return updatedSchedule;
  }

  // ===== Homework operations =====
  async getHomework(id: number): Promise<Homework | undefined> {
    const result = await db.select().from(homework).where(eq(homework.id, id)).limit(1);
    return result[0];
  }

  async getHomeworkByClass(classId: number): Promise<Homework[]> {
    return await db.select().from(homework).where(eq(homework.classId, classId));
  }

  async getHomeworkByTeacher(teacherId: number): Promise<Homework[]> {
    return await db.select().from(homework).where(eq(homework.teacherId, teacherId));
  }

  async getHomeworkByStudent(studentId: number): Promise<Homework[]> {
    // Сначала получаем классы ученика
    const studentClassesList = await db.select().from(studentClasses).where(eq(studentClasses.studentId, studentId));
    if (studentClassesList.length === 0) return [];

    const classIds = studentClassesList.map(sc => sc.classId);
    return await db.select().from(homework).where(inArray(homework.classId, classIds));
  }

  async createHomework(homeworkData: InsertHomework): Promise<Homework> {
    const [newHomework] = await db.insert(homework).values(homeworkData).returning();
    return newHomework;
  }
  
  async updateHomework(id: number, homeworkData: Partial<InsertHomework>): Promise<Homework | undefined> {
    const [updatedHomework] = await db.update(homework)
      .set(homeworkData)
      .where(eq(homework.id, id))
      .returning();
    return updatedHomework;
  }
  
  async deleteHomework(id: number): Promise<Homework | undefined> {
    const [deletedHomework] = await db.delete(homework)
      .where(eq(homework.id, id))
      .returning();
    return deletedHomework;
  }

  // ===== Homework submission operations =====
  async getHomeworkSubmission(id: number): Promise<HomeworkSubmission | undefined> {
    const result = await db.select().from(homeworkSubmissions).where(eq(homeworkSubmissions.id, id)).limit(1);
    return result[0];
  }

  async getHomeworkSubmissionsByHomework(homeworkId: number): Promise<HomeworkSubmission[]> {
    return await db.select().from(homeworkSubmissions).where(eq(homeworkSubmissions.homeworkId, homeworkId));
  }

  async getHomeworkSubmissionsByStudent(studentId: number): Promise<HomeworkSubmission[]> {
    return await db.select().from(homeworkSubmissions).where(eq(homeworkSubmissions.studentId, studentId));
  }

  async createHomeworkSubmission(submission: InsertHomeworkSubmission): Promise<HomeworkSubmission> {
    const [newSubmission] = await db.insert(homeworkSubmissions).values(submission).returning();
    return newSubmission;
  }

  async gradeHomeworkSubmission(id: number, grade: number, feedback: string): Promise<HomeworkSubmission | undefined> {
    const [updatedSubmission] = await db.update(homeworkSubmissions)
      .set({ grade, feedback })
      .where(eq(homeworkSubmissions.id, id))
      .returning();
    return updatedSubmission;
  }

  // ===== Grade operations =====
  async getGrade(id: number): Promise<Grade | undefined> {
    const result = await db.select().from(grades).where(eq(grades.id, id)).limit(1);
    return result[0];
  }

  async getGradesByStudent(studentId: number): Promise<Grade[]> {
    return await db.select().from(grades).where(eq(grades.studentId, studentId));
  }

  async getGradesByClass(classId: number): Promise<Grade[]> {
    return await db.select().from(grades).where(eq(grades.classId, classId));
  }

  async getGradesBySubject(subjectId: number): Promise<Grade[]> {
    return await db.select().from(grades).where(eq(grades.subjectId, subjectId));
  }

  async createGrade(grade: InsertGrade): Promise<Grade> {
    const [newGrade] = await db.insert(grades).values(grade).returning();
    return newGrade;
  }
  
  async updateGrade(id: number, gradeData: Partial<InsertGrade>): Promise<Grade | undefined> {
    const [updatedGrade] = await db.update(grades)
      .set(gradeData)
      .where(eq(grades.id, id))
      .returning();
    
    return updatedGrade;
  }
  
  async deleteGrade(id: number): Promise<void> {
    await db.delete(grades).where(eq(grades.id, id));
  }

  // ===== Attendance operations =====
  async getAttendance(id: number): Promise<Attendance | undefined> {
    const result = await db.select().from(attendance).where(eq(attendance.id, id)).limit(1);
    return result[0];
  }

  async getAttendanceByStudent(studentId: number): Promise<Attendance[]> {
    return await db.select().from(attendance).where(eq(attendance.studentId, studentId));
  }

  async getAttendanceByClass(classId: number): Promise<Attendance[]> {
    return await db.select().from(attendance).where(eq(attendance.classId, classId));
  }
  
  async getAttendanceBySchedule(scheduleId: number): Promise<Attendance[]> {
    return await db.select().from(attendance).where(eq(attendance.scheduleId, scheduleId));
  }

  async createAttendance(attendanceData: InsertAttendance): Promise<Attendance> {
    const [newAttendance] = await db.insert(attendance).values(attendanceData).returning();
    return newAttendance;
  }

  // ===== Document operations =====
  async getDocument(id: number): Promise<Document | undefined> {
    const result = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    return result[0];
  }

  async getDocumentsBySchool(schoolId: number): Promise<Document[]> {
    return await db.select().from(documents).where(eq(documents.schoolId, schoolId));
  }

  async getDocumentsByClass(classId: number): Promise<Document[]> {
    return await db.select().from(documents).where(eq(documents.classId, classId));
  }

  async getDocumentsBySubject(subjectId: number): Promise<Document[]> {
    return await db.select().from(documents).where(eq(documents.subjectId, subjectId));
  }

  async createDocument(document: InsertDocument): Promise<Document> {
    const [newDocument] = await db.insert(documents).values(document).returning();
    return newDocument;
  }

  // ===== Message operations =====
  async getMessage(id: number): Promise<Message | undefined> {
    const result = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
    return result[0];
  }

  async getMessagesBySender(senderId: number): Promise<Message[]> {
    return await db.select().from(messages).where(eq(messages.senderId, senderId));
  }

  async getMessagesByReceiver(receiverId: number): Promise<Message[]> {
    return await db.select().from(messages).where(eq(messages.receiverId, receiverId));
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db.insert(messages).values({
      ...message,
      content: message.message,  // Поле в БД называется content
    }).returning();
    return {
      ...newMessage,
      message: newMessage.content, // Преобразуем обратно для совместимости с интерфейсом
    } as unknown as Message;
  }

  async markMessageAsRead(id: number): Promise<Message | undefined> {
    const [updatedMessage] = await db.update(messages)
      .set({ isRead: true })
      .where(eq(messages.id, id))
      .returning();
    
    return {
      ...updatedMessage,
      message: updatedMessage.content, // Преобразуем для совместимости с интерфейсом
    } as unknown as Message;
  }

  // ===== Notification operations =====
  async getNotification(id: number): Promise<Notification | undefined> {
    const result = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
    return result[0];
  }

  async getNotificationsByUser(userId: number): Promise<Notification[]> {
    return await db.select().from(notifications).where(eq(notifications.userId, userId));
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    // В схеме уже используется поле content, так что не нужно переименовывать
    const [newNotification] = await db.insert(notifications).values(notification).returning();
    
    return newNotification;
  }

  async markNotificationAsRead(id: number): Promise<Notification | undefined> {
    const [updatedNotification] = await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();
    
    return updatedNotification;
  }

  // ===== Parent-Student operations =====
  async getParentStudents(parentId: number): Promise<ParentStudent[]> {
    return await db.select().from(parentStudents).where(eq(parentStudents.parentId, parentId));
  }

  async getStudentParents(studentId: number): Promise<ParentStudent[]> {
    return await db.select().from(parentStudents).where(eq(parentStudents.studentId, studentId));
  }

  async addParentStudent(parentStudent: InsertParentStudent): Promise<ParentStudent> {
    const [newRelationship] = await db.insert(parentStudents).values(parentStudent).returning();
    return newRelationship;
  }

  // ===== System log operations =====
  async createSystemLog(log: InsertSystemLog): Promise<SystemLog> {
    const [newLog] = await db.insert(systemLogs).values(log).returning();
    return newLog;
  }

  async getSystemLogs(): Promise<SystemLog[]> {
    return await db.select().from(systemLogs);
  }

  // ===== Student-Class operations =====
  async addStudentToClass(studentId: number, classId: number): Promise<void> {
    await db.insert(studentClasses).values({ studentId, classId });
  }

  async getStudentClasses(studentId: number): Promise<Class[]> {
    const studentClassesList = await db.select().from(studentClasses).where(eq(studentClasses.studentId, studentId));
    if (studentClassesList.length === 0) return [];

    const classIds = studentClassesList.map(sc => sc.classId);
    return await db.select().from(classes).where(inArray(classes.id, classIds));
  }

  async getClassStudents(classId: number): Promise<User[]> {
    const classStudentsList = await db.select().from(studentClasses).where(eq(studentClasses.classId, classId));
    if (classStudentsList.length === 0) return [];

    const studentIds = classStudentsList.map(cs => cs.studentId);
    return await db.select().from(users).where(inArray(users.id, studentIds));
  }

  // ===== Teacher-Subject operations =====
  async assignTeacherToSubject(teacherId: number, subjectId: number): Promise<void> {
    await db.insert(teacherSubjects).values({ teacherId, subjectId });
  }

  async getTeacherSubjects(teacherId: number): Promise<Subject[]> {
    const teacherSubjectsList = await db.select().from(teacherSubjects).where(eq(teacherSubjects.teacherId, teacherId));
    if (teacherSubjectsList.length === 0) return [];

    const subjectIds = teacherSubjectsList.map(ts => ts.subjectId);
    return await db.select().from(subjects).where(inArray(subjects.id, subjectIds));
  }

  async getSubjectTeachers(subjectId: number): Promise<User[]> {
    const subjectTeachersList = await db.select().from(teacherSubjects).where(eq(teacherSubjects.subjectId, subjectId));
    if (subjectTeachersList.length === 0) return [];

    const teacherIds = subjectTeachersList.map(st => st.teacherId);
    return await db.select().from(users).where(inArray(users.id, teacherIds));
  }

  // User-Role operations
  async getUserRole(id: number): Promise<UserRoleModel | undefined> {
    const [userRole] = await db.select().from(userRoles).where(eq(userRoles.id, id)).limit(1);
    return userRole;
  }

  async getUserRoles(userId: number): Promise<UserRoleModel[]> {
    return await db.select().from(userRoles).where(eq(userRoles.userId, userId));
  }

  async addUserRole(userRole: InsertUserRole): Promise<UserRoleModel> {
    const [newUserRole] = await db.insert(userRoles).values(userRole).returning();
    return newUserRole;
  }

  async removeUserRole(id: number): Promise<void> {
    await db.delete(userRoles).where(eq(userRoles.id, id));
  }
  
  // ===== Subgroup operations =====
  async getSubgroup(id: number): Promise<Subgroup | undefined> {
    const result = await db.select().from(subgroups).where(eq(subgroups.id, id)).limit(1);
    return result[0];
  }
  
  async getSubgroupsByClass(classId: number): Promise<Subgroup[]> {
    return await db.select().from(subgroups).where(eq(subgroups.classId, classId));
  }
  
  async getSubgroupsBySchool(schoolId: number): Promise<Subgroup[]> {
    // Get all classes for the school
    const classesList = await this.getClasses(schoolId);
    if (classesList.length === 0) return [];
    
    // Get all subgroups for these classes
    const classIds = classesList.map(cls => cls.id);
    return await db.select().from(subgroups).where(inArray(subgroups.classId, classIds));
  }
  
  async createSubgroup(subgroup: InsertSubgroup): Promise<Subgroup> {
    const [newSubgroup] = await db.insert(subgroups).values({
      ...subgroup,
      description: subgroup.description || null
    }).returning();
    return newSubgroup;
  }
  
  async updateSubgroup(id: number, subgroup: Partial<InsertSubgroup>): Promise<Subgroup | undefined> {
    const [updatedSubgroup] = await db.update(subgroups)
      .set(subgroup)
      .where(eq(subgroups.id, id))
      .returning();
    return updatedSubgroup;
  }
  
  async deleteSubgroup(id: number): Promise<Subgroup | undefined> {
    // First, delete all associations between students and this subgroup
    await db.delete(studentSubgroups).where(eq(studentSubgroups.subgroupId, id));
    
    // Then delete the subgroup
    const [deletedSubgroup] = await db.delete(subgroups)
      .where(eq(subgroups.id, id))
      .returning();
    return deletedSubgroup;
  }
  
  // ===== Student-Subgroup operations =====
  async getStudentSubgroups(studentId: number): Promise<Subgroup[]> {
    // Get associations between student and subgroups
    const associations = await db.select().from(studentSubgroups)
      .where(eq(studentSubgroups.studentId, studentId));
    
    if (associations.length === 0) return [];
    
    // Get the actual subgroup objects
    const subgroupIds = associations.map(assoc => assoc.subgroupId);
    return await db.select().from(subgroups)
      .where(inArray(subgroups.id, subgroupIds));
  }
  
  async getSubgroupStudents(subgroupId: number): Promise<User[]> {
    // Get associations between subgroup and students
    const associations = await db.select().from(studentSubgroups)
      .where(eq(studentSubgroups.subgroupId, subgroupId));
    
    if (associations.length === 0) return [];
    
    // Get the actual student objects
    const studentIds = associations.map(assoc => assoc.studentId);
    return await db.select().from(users)
      .where(inArray(users.id, studentIds));
  }
  
  async addStudentToSubgroup(studentSubgroup: InsertStudentSubgroup): Promise<StudentSubgroup> {
    // Check if the association already exists
    const existing = await db.select().from(studentSubgroups)
      .where(and(
        eq(studentSubgroups.studentId, studentSubgroup.studentId),
        eq(studentSubgroups.subgroupId, studentSubgroup.subgroupId)
      )).limit(1);
    
    if (existing.length > 0) {
      return existing[0];
    }
    
    // Create new association
    const [newAssociation] = await db.insert(studentSubgroups)
      .values(studentSubgroup)
      .returning();
      
    return newAssociation;
  }
  
  async removeStudentFromSubgroup(studentId: number, subgroupId: number): Promise<void> {
    await db.delete(studentSubgroups)
      .where(and(
        eq(studentSubgroups.studentId, studentId),
        eq(studentSubgroups.subgroupId, subgroupId)
      ));
  }
  
  async getSchedulesBySubgroup(subgroupId: number): Promise<Schedule[]> {
    return await db.select().from(schedules)
      .where(eq(schedules.subgroupId, subgroupId));
  }

  // ===== Assignment operations =====
  async getAssignment(id: number): Promise<Assignment | undefined> {
    const result = await db.select().from(assignments).where(eq(assignments.id, id)).limit(1);
    return result[0];
  }

  async getAssignmentsBySchedule(scheduleId: number): Promise<Assignment[]> {
    return await db.select().from(assignments).where(eq(assignments.scheduleId, scheduleId));
  }

  async getAssignmentsByClass(classId: number): Promise<Assignment[]> {
    return await db.select().from(assignments).where(eq(assignments.classId, classId));
  }

  async getAssignmentsByTeacher(teacherId: number): Promise<Assignment[]> {
    return await db.select().from(assignments).where(eq(assignments.teacherId, teacherId));
  }

  async getAssignmentsBySubject(subjectId: number): Promise<Assignment[]> {
    return await db.select().from(assignments).where(eq(assignments.subjectId, subjectId));
  }

  async getAssignmentsBySubgroup(subgroupId: number): Promise<Assignment[]> {
    return await db.select().from(assignments).where(eq(assignments.subgroupId, subgroupId));
  }

  async createAssignment(assignment: InsertAssignment): Promise<Assignment> {
    const [newAssignment] = await db.insert(assignments).values(assignment).returning();
    return newAssignment;
  }

  async updateAssignment(id: number, assignmentData: Partial<InsertAssignment>): Promise<Assignment | undefined> {
    const [updatedAssignment] = await db.update(assignments)
      .set(assignmentData)
      .where(eq(assignments.id, id))
      .returning();
    return updatedAssignment;
  }

  async deleteAssignment(id: number): Promise<Assignment | undefined> {
    const [deletedAssignment] = await db.delete(assignments)
      .where(eq(assignments.id, id))
      .returning();
    return deletedAssignment;
  }

  // ===== Cumulative Grade operations =====
  async getCumulativeGrade(id: number): Promise<CumulativeGrade | undefined> {
    const result = await db.select().from(cumulativeGrades).where(eq(cumulativeGrades.id, id)).limit(1);
    return result[0];
  }

  async getCumulativeGradesByAssignment(assignmentId: number): Promise<CumulativeGrade[]> {
    return await db.select().from(cumulativeGrades).where(eq(cumulativeGrades.assignmentId, assignmentId));
  }

  async getCumulativeGradesByStudent(studentId: number): Promise<CumulativeGrade[]> {
    return await db.select().from(cumulativeGrades).where(eq(cumulativeGrades.studentId, studentId));
  }

  async createCumulativeGrade(grade: InsertCumulativeGrade): Promise<CumulativeGrade> {
    const [newGrade] = await db.insert(cumulativeGrades).values(grade).returning();
    return newGrade;
  }

  async updateCumulativeGrade(id: number, gradeData: Partial<InsertCumulativeGrade>): Promise<CumulativeGrade | undefined> {
    const [updatedGrade] = await db.update(cumulativeGrades)
      .set(gradeData)
      .where(eq(cumulativeGrades.id, id))
      .returning();
    return updatedGrade;
  }

  async deleteCumulativeGrade(id: number): Promise<CumulativeGrade | undefined> {
    const [deletedGrade] = await db.delete(cumulativeGrades)
      .where(eq(cumulativeGrades.id, id))
      .returning();
    return deletedGrade;
  }

  async getStudentCumulativeGradesByAssignment(studentId: number, assignmentId: number): Promise<CumulativeGrade | undefined> {
    const result = await db.select().from(cumulativeGrades)
      .where(and(
        eq(cumulativeGrades.studentId, studentId),
        eq(cumulativeGrades.assignmentId, assignmentId)
      ))
      .limit(1);
    return result[0];
  }

  // Helper method to calculate average scores for all assignments in a class
  async calculateClassAverageScores(classId: number): Promise<{ assignmentId: number, averageScore: number }[]> {
    // Get all assignments for this class
    const classAssignments = await this.getAssignmentsByClass(classId);
    
    const results = [];
    
    for (const assignment of classAssignments) {
      // Get all grades for this assignment
      const grades = await this.getCumulativeGradesByAssignment(assignment.id);
      
      if (grades.length > 0) {
        // Calculate average score
        const totalScore = grades.reduce((sum, grade) => sum + Number(grade.score), 0);
        const averageScore = totalScore / grades.length;
        
        results.push({
          assignmentId: assignment.id,
          averageScore
        });
      }
    }
    
    return results;
  }
  
  // ===== TimeSlot operations =====
  async getTimeSlot(id: number): Promise<TimeSlot | undefined> {
    const result = await db.select().from(timeSlots).where(eq(timeSlots.id, id)).limit(1);
    return result[0];
  }

  async getTimeSlotByNumber(slotNumber: number, schoolId?: number): Promise<TimeSlot | undefined> {
    // Если указан schoolId, ищем слот для этой школы
    if (schoolId) {
      const result = await db.select().from(timeSlots)
        .where(and(
          eq(timeSlots.slotNumber, slotNumber),
          eq(timeSlots.schoolId, schoolId)
        ))
        .limit(1);
      if (result.length > 0) return result[0];
    }
    
    // Если слот для школы не найден или schoolId не указан, возвращаем слот по умолчанию
    const result = await db.select().from(timeSlots)
      .where(and(
        eq(timeSlots.slotNumber, slotNumber),
        eq(timeSlots.isDefault, true)
      ))
      .limit(1);
    return result[0];
  }

  async getDefaultTimeSlots(): Promise<TimeSlot[]> {
    return await db.select().from(timeSlots).where(eq(timeSlots.isDefault, true));
  }

  async getSchoolTimeSlots(schoolId: number): Promise<TimeSlot[]> {
    return await db.select().from(timeSlots).where(eq(timeSlots.schoolId, schoolId));
  }

  async createTimeSlot(timeSlot: InsertTimeSlot): Promise<TimeSlot> {
    const [newTimeSlot] = await db.insert(timeSlots).values(timeSlot).returning();
    return newTimeSlot;
  }

  async updateTimeSlot(id: number, timeSlot: Partial<InsertTimeSlot>): Promise<TimeSlot | undefined> {
    const [updatedTimeSlot] = await db.update(timeSlots)
      .set(timeSlot)
      .where(eq(timeSlots.id, id))
      .returning();
    return updatedTimeSlot;
  }

  async deleteTimeSlot(id: number): Promise<TimeSlot | undefined> {
    const [deletedTimeSlot] = await db.delete(timeSlots)
      .where(eq(timeSlots.id, id))
      .returning();
    return deletedTimeSlot;
  }

  // ===== ClassTimeSlot operations =====
  async getClassTimeSlot(id: number): Promise<ClassTimeSlot | undefined> {
    const result = await db.select().from(classTimeSlots).where(eq(classTimeSlots.id, id)).limit(1);
    return result[0];
  }

  async getClassTimeSlotByNumber(classId: number, slotNumber: number): Promise<ClassTimeSlot | undefined> {
    const result = await db.select().from(classTimeSlots)
      .where(and(
        eq(classTimeSlots.classId, classId),
        eq(classTimeSlots.slotNumber, slotNumber)
      ))
      .limit(1);
    return result[0];
  }

  async getClassTimeSlots(classId: number): Promise<ClassTimeSlot[]> {
    return await db.select().from(classTimeSlots).where(eq(classTimeSlots.classId, classId));
  }

  async createClassTimeSlot(classTimeSlot: InsertClassTimeSlot): Promise<ClassTimeSlot> {
    const [newClassTimeSlot] = await db.insert(classTimeSlots).values(classTimeSlot).returning();
    return newClassTimeSlot;
  }

  async updateClassTimeSlot(id: number, classTimeSlot: Partial<InsertClassTimeSlot>): Promise<ClassTimeSlot | undefined> {
    const [updatedClassTimeSlot] = await db.update(classTimeSlots)
      .set(classTimeSlot)
      .where(eq(classTimeSlots.id, id))
      .returning();
    return updatedClassTimeSlot;
  }

  async deleteClassTimeSlot(id: number): Promise<ClassTimeSlot | undefined> {
    const [deletedClassTimeSlot] = await db.delete(classTimeSlots)
      .where(eq(classTimeSlots.id, id))
      .returning();
    return deletedClassTimeSlot;
  }

  async deleteClassTimeSlots(classId: number): Promise<void> {
    await db.delete(classTimeSlots).where(eq(classTimeSlots.classId, classId));
  }
  
  // Получение эффективного временного слота для класса
  // Возвращает настроенный слот для класса или слот по умолчанию, если настройки нет
  async getEffectiveTimeSlot(classId: number, slotNumber: number): Promise<TimeSlot | ClassTimeSlot | undefined> {
    // Попытка получить персонализированный слот для класса
    const classSlot = await this.getClassTimeSlotByNumber(classId, slotNumber);
    if (classSlot) return classSlot;
    
    // Если персонализированный слот не найден, получаем класс для определения школы
    const classEntity = await this.getClass(classId);
    if (!classEntity) return undefined;
    
    // Получаем слот по умолчанию (сначала проверяем школьный слот, потом общий)
    return await this.getTimeSlotByNumber(slotNumber, classEntity.schoolId);
  }
  
  // Инициализация слотов по умолчанию, если они еще не созданы
  async initializeDefaultTimeSlots(): Promise<TimeSlot[]> {
    const defaultSlots = await this.getDefaultTimeSlots();
    if (defaultSlots.length > 0) return defaultSlots;
    
    // Предопределенные слоты по умолчанию
    const defaultTimeSlotsData: InsertTimeSlot[] = [
      { slotNumber: 0, startTime: "8:00", endTime: "8:45", isDefault: true },
      { slotNumber: 1, startTime: "9:00", endTime: "9:45", isDefault: true },
      { slotNumber: 2, startTime: "9:55", endTime: "10:40", isDefault: true },
      { slotNumber: 3, startTime: "11:00", endTime: "11:45", isDefault: true },
      { slotNumber: 4, startTime: "12:00", endTime: "12:45", isDefault: true },
      { slotNumber: 5, startTime: "12:55", endTime: "13:40", isDefault: true },
      { slotNumber: 6, startTime: "14:00", endTime: "14:45", isDefault: true },
      { slotNumber: 7, startTime: "15:15", endTime: "16:00", isDefault: true },
      { slotNumber: 8, startTime: "16:15", endTime: "17:00", isDefault: true },
      { slotNumber: 9, startTime: "17:15", endTime: "18:00", isDefault: true }
    ];
    
    const createdSlots: TimeSlot[] = [];
    for (const slotData of defaultTimeSlotsData) {
      const newSlot = await this.createTimeSlot(slotData);
      createdSlots.push(newSlot);
    }
    
    return createdSlots;
  }
}

// Экспортируем экземпляр хранилища
export const dbStorage = new DatabaseStorage();