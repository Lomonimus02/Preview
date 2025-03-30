import { pgTable, text, serial, integer, boolean, date, timestamp, primaryKey, foreignKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enum for user roles
export enum UserRoleEnum {
  SUPER_ADMIN = "super_admin",
  SCHOOL_ADMIN = "school_admin",
  TEACHER = "teacher",
  STUDENT = "student",
  PARENT = "parent",
  PRINCIPAL = "principal",
  VICE_PRINCIPAL = "vice_principal"
}

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  // Основная роль пользователя (для обратной совместимости)
  role: text("role").$type<UserRoleEnum>().notNull(),
  // Текущая активная роль, выбранная пользователем
  activeRole: text("active_role").$type<UserRoleEnum>(),
  schoolId: integer("school_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Schools table
export const schools = pgTable("schools", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Classes table
export const classes = pgTable("classes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  schoolId: integer("school_id").notNull(),
  gradeLevel: integer("grade_level").notNull(),
  academicYear: text("academic_year").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Student-Class relation
export const studentClasses = pgTable("student_classes", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  classId: integer("class_id").notNull(),
});

// Subjects table
export const subjects = pgTable("subjects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  schoolId: integer("school_id").notNull(),
});

// Teacher-Subject relation
export const teacherSubjects = pgTable("teacher_subjects", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id").notNull(),
  subjectId: integer("subject_id").notNull(),
});

// Schedule table
export const schedules = pgTable("schedules", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull(),
  subjectId: integer("subject_id").notNull(),
  teacherId: integer("teacher_id").notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 1-7 for Monday-Sunday
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  room: text("room"),
});

// Homework table
export const homework = pgTable("homework", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  subjectId: integer("subject_id").notNull(),
  classId: integer("class_id").notNull(),
  teacherId: integer("teacher_id").notNull(),
  dueDate: date("due_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Homework submissions
export const homeworkSubmissions = pgTable("homework_submissions", {
  id: serial("id").primaryKey(),
  homeworkId: integer("homework_id").notNull(),
  studentId: integer("student_id").notNull(),
  submissionText: text("submission_text"),
  fileUrl: text("file_url"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  grade: integer("grade"),
  feedback: text("feedback"),
});

// Grades table
export const grades = pgTable("grades", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  subjectId: integer("subject_id").notNull(),
  classId: integer("class_id").notNull(),
  teacherId: integer("teacher_id").notNull(),
  grade: integer("grade").notNull(),
  comment: text("comment"),
  gradeType: text("grade_type").notNull(), // e.g., "homework", "test", "exam"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Attendance table
export const attendance = pgTable("attendance", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  classId: integer("class_id").notNull(),
  date: date("date").notNull(),
  status: text("status").notNull(), // "present", "absent", "late"
  comment: text("comment"),
});

// Documents table
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  fileUrl: text("file_url").notNull(),
  uploaderId: integer("uploader_id").notNull(),
  schoolId: integer("school_id"),
  classId: integer("class_id"),
  subjectId: integer("subject_id"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

// Messages table
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(),
  receiverId: integer("receiver_id").notNull(),
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

// Notifications table
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Parent-Student relation
export const parentStudents = pgTable("parent_students", {
  id: serial("id").primaryKey(),
  parentId: integer("parent_id").notNull(),
  studentId: integer("student_id").notNull(),
});

// User-Role relation для хранения нескольких ролей пользователя
export const userRoles = pgTable("user_roles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  role: text("role").$type<UserRoleEnum>().notNull(),
  schoolId: integer("school_id"), // школа, связанная с этой ролью (например, для учителя, работающего в нескольких школах)
});

// System logs
export const systemLogs = pgTable("system_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  action: text("action").notNull(),
  details: text("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Zod schemas for inserting data
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true
});

export const insertSchoolSchema = createInsertSchema(schools).omit({
  id: true,
  createdAt: true
});

export const insertClassSchema = createInsertSchema(classes).omit({
  id: true,
  createdAt: true
});

export const insertSubjectSchema = createInsertSchema(subjects).omit({
  id: true
});

export const insertScheduleSchema = createInsertSchema(schedules).omit({
  id: true
});

export const insertHomeworkSchema = createInsertSchema(homework).omit({
  id: true,
  createdAt: true
});

export const insertHomeworkSubmissionSchema = createInsertSchema(homeworkSubmissions).omit({
  id: true,
  submittedAt: true
});

export const insertGradeSchema = createInsertSchema(grades).omit({
  id: true,
  createdAt: true
});

export const insertAttendanceSchema = createInsertSchema(attendance).omit({
  id: true
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  uploadedAt: true
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  isRead: true,
  sentAt: true
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  isRead: true,
  createdAt: true
});

export const insertParentStudentSchema = createInsertSchema(parentStudents).omit({
  id: true
});

export const insertUserRoleSchema = createInsertSchema(userRoles).omit({
  id: true
});

export const insertSystemLogSchema = createInsertSchema(systemLogs).omit({
  id: true,
  createdAt: true
});

// Export types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertSchool = z.infer<typeof insertSchoolSchema>;
export type School = typeof schools.$inferSelect;

export type InsertClass = z.infer<typeof insertClassSchema>;
export type Class = typeof classes.$inferSelect;

export type InsertSubject = z.infer<typeof insertSubjectSchema>;
export type Subject = typeof subjects.$inferSelect;

export type InsertSchedule = z.infer<typeof insertScheduleSchema>;
export type Schedule = typeof schedules.$inferSelect;

export type InsertHomework = z.infer<typeof insertHomeworkSchema>;
export type Homework = typeof homework.$inferSelect;

export type InsertHomeworkSubmission = z.infer<typeof insertHomeworkSubmissionSchema>;
export type HomeworkSubmission = typeof homeworkSubmissions.$inferSelect;

export type InsertGrade = z.infer<typeof insertGradeSchema>;
export type Grade = typeof grades.$inferSelect;

export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Attendance = typeof attendance.$inferSelect;

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export type InsertParentStudent = z.infer<typeof insertParentStudentSchema>;
export type ParentStudent = typeof parentStudents.$inferSelect;

export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type UserRoleModel = typeof userRoles.$inferSelect;

export type InsertSystemLog = z.infer<typeof insertSystemLogSchema>;
export type SystemLog = typeof systemLogs.$inferSelect;
