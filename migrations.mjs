import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import 'dotenv/config';

// Настройка соединения с базой данных
const connectionString = process.env.DATABASE_URL;
const queryClient = postgres(connectionString);
const db = drizzle(queryClient);

async function addClassGradingSystemColumn() {
  try {
    console.log('Проверяем наличие колонки grading_system в таблице classes...');
    const checkColumnExistsQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'classes' AND column_name = 'grading_system'
    `;
    
    const result = await db.execute(sql.raw(checkColumnExistsQuery));
    
    if (result.length === 0) {
      console.log('Колонка grading_system не найдена, добавляем...');
      const addColumnQuery = `
        ALTER TABLE classes 
        ADD COLUMN grading_system TEXT NOT NULL DEFAULT 'five_point'
      `;
      await db.execute(sql.raw(addColumnQuery));
      console.log('Колонка grading_system успешно добавлена');
    } else {
      console.log('Колонка grading_system уже существует');
    }
  } catch (error) {
    console.error('Ошибка при добавлении колонки grading_system:', error);
    throw error;
  }
}

async function runMigrations() {
  try {
    console.log('Запуск миграций...');
    await addClassGradingSystemColumn();
    console.log('Миграции успешно выполнены');
  } catch (error) {
    console.error('Ошибка при выполнении миграций:', error);
  } finally {
    // Закрытие соединения
    await queryClient.end();
  }
}

// Запускаем миграции
runMigrations();