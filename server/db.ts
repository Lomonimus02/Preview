import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../shared/schema';

// Инициализация клиента PostgreSQL
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL environment variable is not set. Please set it in the environment.');
  process.exit(1);
}

// Для запросов (будет использоваться Drizzle)
const queryClient = postgres(connectionString);
export const db = drizzle(queryClient, { schema });

// Для тестирования соединения
const testClient = postgres(connectionString, { max: 1 });

export const testConnection = async (): Promise<boolean> => {
  try {
    const result = await testClient`SELECT 1 as test`;
    console.log('Database connection successful');
    return result[0].test === 1;
  } catch (error) {
    console.error('Failed to connect to the database:', error);
    return false;
  }
};