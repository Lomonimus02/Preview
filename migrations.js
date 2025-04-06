import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function addScheduleDateColumn() {
  try {
    console.log('Проверяем наличие колонки schedule_date в таблице schedules...');
    const checkColumnExistsQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'schedules' AND column_name = 'schedule_date'
    `;
    
    const result = await db.execute(sql.raw(checkColumnExistsQuery));
    
    if (result.length === 0) {
      console.log('Колонка schedule_date не найдена, добавляем...');
      const addColumnQuery = `
        ALTER TABLE schedules 
        ADD COLUMN schedule_date DATE
      `;
      await db.execute(sql.raw(addColumnQuery));
      console.log('Колонка schedule_date успешно добавлена');
    } else {
      console.log('Колонка schedule_date уже существует');
    }
  } catch (error) {
    console.error('Ошибка при добавлении колонки schedule_date:', error);
    throw error;
  }
}

async function addGradeScheduleIdColumn() {
  try {
    console.log('Проверяем наличие колонки schedule_id в таблице grades...');
    const checkColumnExistsQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'grades' AND column_name = 'schedule_id'
    `;
    
    const result = await db.execute(sql.raw(checkColumnExistsQuery));
    
    if (result.length === 0) {
      console.log('Колонка schedule_id не найдена, добавляем...');
      const addColumnQuery = `
        ALTER TABLE grades 
        ADD COLUMN schedule_id INTEGER
      `;
      await db.execute(sql.raw(addColumnQuery));
      console.log('Колонка schedule_id успешно добавлена');
    } else {
      console.log('Колонка schedule_id уже существует');
    }
  } catch (error) {
    console.error('Ошибка при добавлении колонки schedule_id:', error);
    throw error;
  }
}

async function runMigrations() {
  try {
    console.log('Запуск миграций...');
    await addScheduleDateColumn();
    await addGradeScheduleIdColumn();
    console.log('Миграции успешно выполнены');
  } catch (error) {
    console.error('Ошибка при выполнении миграций:', error);
  }
}

// Запускаем миграции
runMigrations();