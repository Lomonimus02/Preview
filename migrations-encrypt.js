import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function addUserKeysColumns() {
  console.log('Добавление колонок для ключей пользователей...');
  
  try {
    // Проверка наличия колонки public_key
    const publicKeyExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'public_key'
      );
    `);
    
    if (!publicKeyExists.rows[0].exists) {
      await db.execute(sql`ALTER TABLE users ADD COLUMN public_key TEXT;`);
      console.log('Колонка public_key добавлена');
    } else {
      console.log('Колонка public_key уже существует');
    }
    
    // Проверка наличия колонки private_key
    const privateKeyExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'private_key'
      );
    `);
    
    if (!privateKeyExists.rows[0].exists) {
      await db.execute(sql`ALTER TABLE users ADD COLUMN private_key TEXT;`);
      console.log('Колонка private_key добавлена');
    } else {
      console.log('Колонка private_key уже существует');
    }
    
    console.log('Миграция успешно завершена');
  } catch (error) {
    console.error('Ошибка при добавлении колонок для ключей пользователей:', error);
  }
}

async function addEncryptedFileColumn() {
  console.log('Добавление колонки для хранения зашифрованных файлов...');
  
  try {
    // Проверка наличия колонки is_encrypted в таблице documents
    const isEncryptedExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'documents' AND column_name = 'is_encrypted'
      );
    `);
    
    if (!isEncryptedExists.rows[0].exists) {
      await db.execute(sql`ALTER TABLE documents ADD COLUMN is_encrypted BOOLEAN DEFAULT false;`);
      console.log('Колонка is_encrypted добавлена в таблицу documents');
    } else {
      console.log('Колонка is_encrypted уже существует в таблице documents');
    }
    
    // Добавим таблицу для отслеживания статуса шифрования сообщений
    const isE2EExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'messages' AND column_name = 'is_e2e_encrypted'
      );
    `);
    
    if (!isE2EExists.rows[0].exists) {
      await db.execute(sql`ALTER TABLE messages ADD COLUMN is_e2e_encrypted BOOLEAN DEFAULT false;`);
      console.log('Колонка is_e2e_encrypted добавлена в таблицу messages');
    } else {
      console.log('Колонка is_e2e_encrypted уже существует в таблице messages');
    }
    
    console.log('Миграция успешно завершена');
  } catch (error) {
    console.error('Ошибка при добавлении колонок для шифрованных файлов:', error);
  }
}

async function runMigrations() {
  try {
    await addUserKeysColumns();
    await addEncryptedFileColumn();
    
    console.log('Все миграции успешно выполнены');
    process.exit(0);
  } catch (error) {
    console.error('Ошибка при выполнении миграций:', error);
    process.exit(1);
  }
}

runMigrations();