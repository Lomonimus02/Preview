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
    
    console.log('Миграция успешно выполнена');
  } catch (error) {
    console.error('Ошибка миграции:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigration();
