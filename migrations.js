import { db } from './server/db';
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

async function addGradeDateColumn() {
  try {
    console.log('Проверяем наличие колонки grade_date в таблице grades...');
    const checkColumnExistsQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'grades' AND column_name = 'grade_date'
    `;
    
    const result = await db.execute(sql.raw(checkColumnExistsQuery));
    
    if (result.length === 0) {
      console.log('Колонка grade_date не найдена, добавляем...');
      const addColumnQuery = `
        ALTER TABLE grades 
        ADD COLUMN grade_date DATE
      `;
      await db.execute(sql.raw(addColumnQuery));
      console.log('Колонка grade_date успешно добавлена');
    } else {
      console.log('Колонка grade_date уже существует');
    }
  } catch (error) {
    console.error('Ошибка при добавлении колонки grade_date:', error);
    throw error;
  }
}

async function runMigrations() {
  try {
    console.log('Запуск миграций...');
    await addScheduleDateColumn();
    await addGradeDateColumn();
    console.log('Миграции успешно выполнены');
  } catch (error) {
    console.error('Ошибка при выполнении миграций:', error);
  }
}

// Запускаем миграции
runMigrations();