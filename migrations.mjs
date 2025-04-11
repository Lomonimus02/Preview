import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

// Функция для добавления колонки subgroup_id в таблицу grades
async function addSubgroupIdColumn() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Проверка наличия колонки subgroup_id в таблице grades...');
    
    // Проверяем, существует ли уже колонка
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'grades' AND column_name = 'subgroup_id'
    `;
    
    const res = await client.query(checkQuery);
    
    if (res.rows.length === 0) {
      console.log('Колонка subgroup_id не найдена. Добавляем...');
      
      // Добавляем колонку
      await client.query(`
        ALTER TABLE grades 
        ADD COLUMN subgroup_id INTEGER
      `);
      
      console.log('Колонка subgroup_id успешно добавлена в таблицу grades');
    } else {
      console.log('Колонка subgroup_id уже существует в таблице grades');
    }
  } catch (err) {
    console.error('Ошибка при выполнении миграции:', err);
  } finally {
    await client.end();
  }
}

// Основная функция для запуска миграций
async function runMigrations() {
  console.log('Запуск миграций...');
  await addSubgroupIdColumn();
  console.log('Миграции успешно выполнены');
}

runMigrations()
  .then(() => {
    console.log('Все миграции успешно завершены');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Ошибка при выполнении миграций:', err);
    process.exit(1);
  });