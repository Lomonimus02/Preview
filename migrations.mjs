import pkg from 'pg';
const { Pool } = pkg;

// Создаем подключение к базе данных PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Добавляет поле status в таблицу schedules
 */
async function addStatusToSchedules() {
  const client = await pool.connect();
  try {
    // Проверяем, существует ли уже колонка status
    const checkResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'schedules' AND column_name = 'status'
    `);

    if (checkResult.rows.length === 0) {
      console.log('Добавление колонки status в таблицу schedules...');
      
      // Создаем тип enum для статуса урока
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lesson_status_enum') THEN
            CREATE TYPE lesson_status_enum AS ENUM ('not_conducted', 'conducted');
          END IF;
        END
        $$;
      `);
      
      // Добавляем колонку с дефолтным значением 'not_conducted'
      await client.query(`
        ALTER TABLE schedules 
        ADD COLUMN status lesson_status_enum DEFAULT 'not_conducted'
      `);
      
      console.log('Колонка status успешно добавлена в таблицу schedules');
    } else {
      console.log('Колонка status уже существует в таблице schedules');
    }
  } catch (error) {
    console.error('Ошибка при добавлении колонки status:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Выполняет все необходимые миграции
 */
async function runMigrations() {
  try {
    await addStatusToSchedules();
    console.log('Все миграции успешно выполнены');
  } catch (error) {
    console.error('Ошибка при выполнении миграций:', error);
  } finally {
    // Закрываем пул подключений
    await pool.end();
  }
}

// Запускаем миграции
runMigrations();