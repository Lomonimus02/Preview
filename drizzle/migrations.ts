import { db, testConnection } from '../server/db';
import { 
  users, schools, classes, subjects, schedules, 
  homework, homeworkSubmissions, grades, attendance, 
  documents, messages, notifications, parentStudents, 
  systemLogs, teacherSubjects, studentClasses, UserRoleEnum
} from '../shared/schema';

async function runMigrations() {
  try {
    console.log('Testing database connection...');
    const connected = await testConnection();
    
    if (!connected) {
      console.error('Failed to connect to database. Aborting migrations.');
      process.exit(1);
    }
    
    console.log('Creating tables...');
    
    // Создание таблиц в правильном порядке (с учетом зависимостей)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS schools (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        city TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        role TEXT NOT NULL,
        active_role TEXT,
        school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS classes (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        grade_level INTEGER NOT NULL,
        academic_year TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS subjects (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE
      );
      
      CREATE TABLE IF NOT EXISTS teacher_subjects (
        id SERIAL PRIMARY KEY,
        teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE
      );
      
      CREATE TABLE IF NOT EXISTS student_classes (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE
      );
      
      CREATE TABLE IF NOT EXISTS schedules (
        id SERIAL PRIMARY KEY,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        room TEXT
      );
      
      CREATE TABLE IF NOT EXISTS homework (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        due_date DATE NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS homework_submissions (
        id SERIAL PRIMARY KEY,
        homework_id INTEGER NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        submission_text TEXT,
        file_url TEXT,
        submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
        grade INTEGER,
        feedback TEXT
      );
      
      CREATE TABLE IF NOT EXISTS grades (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        grade INTEGER NOT NULL,
        grade_type TEXT NOT NULL,
        comment TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        status TEXT NOT NULL,
        comment TEXT
      );
      
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        file_url TEXT NOT NULL,
        uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
        class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
        subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
        uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        sent_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS parent_students (
        id SERIAL PRIMARY KEY,
        parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
      );
      
      CREATE TABLE IF NOT EXISTS user_roles (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL
      );
      
      CREATE TABLE IF NOT EXISTS system_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    console.log('Tables created successfully.');
    
    // Проверяем наличие данных
    const schoolCount = await db.select().from(schools).execute();
    const userCount = await db.select().from(users).execute();
    
    if (schoolCount.length > 0 || userCount.length > 0) {
      console.log('Data already exists, skipping seed.');
      console.log(`Schools: ${schoolCount.length}, Users: ${userCount.length}`);
      return;
    }
    
    console.log('Seeding initial data...');
    
    // Начальные данные - создаем школу
    const [school] = await db.insert(schools).values({
      name: 'Школа №1',
      address: 'ул. Пушкина, 10',
      city: 'Москва',
      status: 'active'
    }).returning();
    
    // Создаем суперадмина
    const [superAdmin] = await db.insert(users).values({
      username: 'admin',
      password: 'admin1234', // В реальном проекте должен быть хеш
      firstName: 'Админ',
      lastName: 'Системы',
      email: 'admin@school.com',
      role: UserRoleEnum.SUPER_ADMIN
    }).returning();
    
    // Создаем директора школы
    const [schoolAdmin] = await db.insert(users).values({
      username: 'director',
      password: 'director1234',
      firstName: 'Директор',
      lastName: 'Школы',
      email: 'director@school.com',
      role: UserRoleEnum.SCHOOL_ADMIN,
      schoolId: school.id
    }).returning();
    
    // Создаем учителя
    const [teacher] = await db.insert(users).values({
      username: 'teacher',
      password: 'teacher1234',
      firstName: 'Иван',
      lastName: 'Петров',
      email: 'teacher@school.com',
      role: UserRoleEnum.TEACHER,
      schoolId: school.id
    }).returning();
    
    // Создаем ученика
    const [student] = await db.insert(users).values({
      username: 'student',
      password: 'student1234',
      firstName: 'Александр',
      lastName: 'Сидоров',
      email: 'student@school.com',
      role: UserRoleEnum.STUDENT,
      schoolId: school.id
    }).returning();
    
    // Создаем родителя
    const [parent] = await db.insert(users).values({
      username: 'parent',
      password: 'parent1234',
      firstName: 'Ольга',
      lastName: 'Сидорова',
      email: 'parent@school.com',
      role: UserRoleEnum.PARENT,
      schoolId: school.id
    }).returning();
    
    // Связываем родителя с учеником
    await db.insert(parentStudents).values({
      parentId: parent.id,
      studentId: student.id
    });
    
    // Создаем класс
    const [classEntity] = await db.insert(classes).values({
      name: '5A',
      schoolId: school.id,
      gradeLevel: 5,
      academicYear: '2023-2024'
    }).returning();
    
    // Добавляем ученика в класс
    await db.insert(studentClasses).values({
      studentId: student.id,
      classId: classEntity.id
    });
    
    // Создаем предметы
    const [mathSubject] = await db.insert(subjects).values({
      name: 'Математика',
      schoolId: school.id,
      description: 'Алгебра и геометрия'
    }).returning();
    
    const [physicsSubject] = await db.insert(subjects).values({
      name: 'Физика',
      schoolId: school.id,
      description: 'Основы физики'
    }).returning();
    
    // Назначаем учителя на предметы
    await db.insert(teacherSubjects).values({
      teacherId: teacher.id,
      subjectId: mathSubject.id
    });
    
    await db.insert(teacherSubjects).values({
      teacherId: teacher.id,
      subjectId: physicsSubject.id
    });
    
    // Создаем расписание
    await db.insert(schedules).values({
      classId: classEntity.id,
      subjectId: mathSubject.id,
      teacherId: teacher.id,
      dayOfWeek: 1, // Понедельник
      startTime: '08:30',
      endTime: '09:15',
      room: '101'
    });
    
    await db.insert(schedules).values({
      classId: classEntity.id,
      subjectId: physicsSubject.id,
      teacherId: teacher.id,
      dayOfWeek: 2, // Вторник
      startTime: '09:30',
      endTime: '10:15',
      room: '102'
    });
    
    console.log('Database seeded successfully.');
    
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

// В ESM модулях нет прямого аналога require.main === module
// Но так как мы импортируем этот файл из server/index.ts, то 
// автоматический запуск миграций здесь не нужен
// runMigrations().then(() => {
//   console.log('Migrations complete');
//   process.exit(0);
// });

export { runMigrations };