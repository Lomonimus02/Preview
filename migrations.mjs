import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

async function runMigration() {
  if (!DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const sql = postgres(DATABASE_URL);

  try {
    // Проверяем, существует ли колонка schedule_date в таблице schedules
    const checkScheduleDateColumn = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'schedules' AND column_name = 'schedule_date'
    `;
    
    if (checkScheduleDateColumn.length === 0) {
      console.log('Добавляем колонку schedule_date в таблицу schedules...');
      await sql`ALTER TABLE schedules ADD COLUMN schedule_date DATE`;
      console.log('Колонка schedule_date успешно добавлена');
    } else {
      console.log('Колонка schedule_date уже существует в таблице schedules');
    }
    
    // Проверяем, существует ли колонка schedule_id в таблице grades
    const checkScheduleIdColumn = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'grades' AND column_name = 'schedule_id'
    `;
    
    if (checkScheduleIdColumn.length === 0) {
      console.log('Добавляем колонку schedule_id в таблицу grades...');
      await sql`ALTER TABLE grades ADD COLUMN schedule_id INTEGER`;
      console.log('Колонка schedule_id успешно добавлена');
    } else {
      console.log('Колонка schedule_id уже существует в таблице grades');
    }
    
    // Проверяем, существует ли колонка subgroup_id в таблице schedules
    const checkSubgroupIdColumn = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'schedules' AND column_name = 'subgroup_id'
    `;
    
    if (checkSubgroupIdColumn.length === 0) {
      console.log('Добавляем колонку subgroup_id в таблицу schedules...');
      await sql`ALTER TABLE schedules ADD COLUMN subgroup_id INTEGER`;
      console.log('Колонка subgroup_id успешно добавлена');
    } else {
      console.log('Колонка subgroup_id уже существует в таблице schedules');
    }
    
    // Проверяем, существует ли таблица subgroups
    const checkSubgroupsTable = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'subgroups'
    `;
    
    if (checkSubgroupsTable.length === 0) {
      console.log('Создаем таблицу subgroups...');
      await sql`
        CREATE TABLE subgroups (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          class_id INTEGER NOT NULL,
          school_id INTEGER NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `;
      console.log('Таблица subgroups успешно создана');
    } else {
      console.log('Таблица subgroups уже существует');
    }
    
    // Проверяем, существует ли таблица student_subgroups
    const checkStudentSubgroupsTable = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'student_subgroups'
    `;
    
    if (checkStudentSubgroupsTable.length === 0) {
      console.log('Создаем таблицу student_subgroups...');
      await sql`
        CREATE TABLE student_subgroups (
          id SERIAL PRIMARY KEY,
          student_id INTEGER NOT NULL,
          subgroup_id INTEGER NOT NULL
        )
      `;
      console.log('Таблица student_subgroups успешно создана');
    } else {
      console.log('Таблица student_subgroups уже существует');
    }
    
    console.log('Миграция успешно выполнена');
  } catch (error) {
    console.error('Ошибка миграции:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigration();
