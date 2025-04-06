import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../shared/schema';

// Инициализация клиента PostgreSQL
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL environment variable is not set. Please set it in the environment.');
  process.exit(1);
}

// Настройки соединения с более надежной обработкой ошибок для Neon Database
const connectionOptions = {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  // Автоматические повторные попытки подключения при ошибках
  max_lifetime: 60 * 30, // 30 минут
  connection: {
    application_name: "school-management-system",
  },
  // Обработка ошибок подключения
  onnotice: () => {},
  debug: (conn, ...args) => {
    if (args.length && args[0]?.includes?.('terminating connection due to administrator command')) {
      console.log('Neon serverless connection scaled down, reconnecting...');
    }
  }
};

// Для запросов (будет использоваться Drizzle)
const queryClient = postgres(connectionString, connectionOptions);
export const db = drizzle(queryClient, { schema });

// Для тестирования соединения
const testClient = postgres(connectionString, { ...connectionOptions, max: 1 });

export const testConnection = async (): Promise<boolean> => {
  try {
    const result = await testClient`SELECT 1 as test`;
    console.log('Database connection successful');
    
    try {
      // Проверяем существование необходимых таблиц
      await queryClient`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'users'
        )`;
    } catch (tableError) {
      console.warn('Table check failed, but connection is still valid:', tableError.message);
    }
    
    return result[0].test === 1;
  } catch (error) {
    console.error('Failed to connect to the database:', error);
    return false;
  } finally {
    // Не закрываем соединение здесь, так как оно переиспользуется
  }
};