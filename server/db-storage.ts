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
  users, schools, classes, subjects, schedules,
  homework, homeworkSubmissions, grades, attendance,
  documents, messages, notifications, parentStudents,
  systemLogs, teacherSubjects, studentClasses, userRoles
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
    return await db.select().from(users).where(eq(users.schoolId, schoolId));
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
}

// Экспортируем экземпляр хранилища
export const dbStorage = new DatabaseStorage();