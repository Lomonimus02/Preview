import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { testConnection } from "./db";
import dotenv from "dotenv";
import { Server } from "http";
import path from "path";

// Загружаем переменные окружения
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Настраиваем статические файлы для загрузок
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Флаг для отслеживания статуса БД
let isDbHealthy = false;
// Интервал проверки соединения с БД (в миллисекундах)
const DB_HEALTH_CHECK_INTERVAL = 30000; // 30 секунд
// Таймер для периодической проверки соединения с БД
let dbHealthCheckTimer: NodeJS.Timeout | null = null;

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Маршрут для проверки статуса соединения с БД
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: isDbHealthy ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Функция для периодической проверки соединения с БД
async function checkDatabaseHealth() {
  try {
    const connected = await testConnection();
    if (connected !== isDbHealthy) {
      if (connected) {
        console.log('Database connection restored');
        isDbHealthy = true;
      } else {
        console.warn('Database connection lost');
        isDbHealthy = false;
      }
    }
  } catch (err: unknown) {
    const error = err as Error;
    if (isDbHealthy) {
      console.warn('Database health check failed:', error.message);
      isDbHealthy = false;
    }
  }
  
  // Перезапуск таймера для следующей проверки
  if (dbHealthCheckTimer) {
    clearTimeout(dbHealthCheckTimer);
  }
  dbHealthCheckTimer = setTimeout(checkDatabaseHealth, DB_HEALTH_CHECK_INTERVAL);
}

// Функция для очистки ресурсов при завершении работы сервера
function setupGracefulShutdown(server: Server) {
  const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
  
  signals.forEach(signal => {
    process.on(signal, () => {
      console.log(`Received ${signal}, gracefully shutting down...`);
      
      // Очистка таймера проверки соединения с БД
      if (dbHealthCheckTimer) {
        clearTimeout(dbHealthCheckTimer);
      }
      
      // Закрытие сервера
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
      
      // Если сервер не закрывается в течение 10 секунд, принудительно завершаем процесс
      setTimeout(() => {
        console.error('Server close timeout, forcing exit');
        process.exit(1);
      }, 10000);
    });
  });
}

(async () => {
  // Функция для повторной попытки подключения к базе данных
  const tryConnectToDatabase = async (maxRetries = 5, retryInterval = 5000) => {
    let currentRetry = 0;
    
    while (currentRetry < maxRetries) {
      try {
        console.log(`Attempt ${currentRetry + 1}/${maxRetries} to connect to database...`);
        const isConnected = await testConnection();
        
        if (isConnected) {
          console.log('Database connection successful.');
          // Устанавливаем PostgreSQL как основное хранилище данных
          process.env.USE_DATABASE = "true";
          isDbHealthy = true;
          return true;
        }
      } catch (error) {
        console.error(`Database connection error (attempt ${currentRetry + 1}/${maxRetries}):`, error);
        
        // Для Neon Database это обычная ошибка при использовании serverless
        if (error instanceof Error && 
            (error.message.includes('terminating connection due to administrator command') || 
             error.message.includes('57P01'))) {
          console.log('Neon serverless database connection scaled down. Will retry...');
        }
      }
      
      currentRetry++;
      
      if (currentRetry < maxRetries) {
        console.log(`Waiting ${retryInterval/1000} seconds before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      }
    }
    
    console.warn('Could not connect to database after maximum attempts. Starting with limited functionality.');
    isDbHealthy = false;
    return false;
  };
  
  try {
    await tryConnectToDatabase();
    
    // Запускаем периодическую проверку соединения с БД
    dbHealthCheckTimer = setTimeout(checkDatabaseHealth, DB_HEALTH_CHECK_INTERVAL);
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Fatal error during database connection attempts:', error);
    console.log('Starting app with limited functionality...');
    isDbHealthy = false;
  }
  
  const server = await registerRoutes(app);

  // Настраиваем корректное завершение работы сервера
  setupGracefulShutdown(server);

  // Создаем интерфейс для ошибок PostgreSQL
  interface PostgresError extends Error {
    code?: string;
  }

  // Обработчик для перехвата необработанных исключений
  process.on('uncaughtException', (err: Error) => {
    console.error('Uncaught exception:', err);
    
    // Проверяем, является ли ошибка ошибкой PostgreSQL
    const pgError = err as PostgresError;
    
    // Если ошибка связана с БД и содержит код 57P01, это ожидаемая ошибка для Neon Database
    if (pgError.code === '57P01' || 
        (err instanceof Error && err.message.includes('terminating connection due to administrator command'))) {
      console.log('Neon database connection was terminated. This is normal with serverless databases.');
      // Принудительно запускаем проверку здоровья БД
      checkDatabaseHealth();
    } else {
      // Для других серьезных ошибок перезапускаем процесс
      console.error('Critical error, process will exit');
      setTimeout(() => process.exit(1), 1000);
    }
  });

  // Обработчик для перехвата необработанных отклонений промисов
  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    
    // Если ошибка связана с БД
    if (reason instanceof Error) {
      const pgError = reason as PostgresError;
      if (reason.message.includes('terminating connection due to administrator command') || 
          pgError.code === '57P01') {
        console.log('Neon database connection was terminated. This is normal with serverless databases.');
        // Принудительно запускаем проверку здоровья БД
        checkDatabaseHealth();
      }
    }
  });

  // Глобальный обработчик ошибок Express
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    console.error('Server error:', err);
    
    // Проверка на ошибки десериализации пользователя
    if (err?.message?.includes('Failed to deserialize user') || 
        (err?.message?.includes('User with id') && err?.message?.includes('not found'))) {
      console.log('User deserialization error, destroying session');
      req.session?.destroy((destroyErr) => {
        if (destroyErr) {
          console.error("Error destroying session:", destroyErr);
        }
        // Отправляем статус 401 для перенаправления на страницу логина
        if (!res.headersSent) {
          return res.status(401).json({ 
            message: "Session expired or user no longer exists. Please login again."
          });
        }
      });
    }
    // Проверка на ошибки соединения с базой данных Neon
    else if (err?.message?.includes('terminating connection due to administrator command') || 
             err?.code === '57P01') {
      console.log('Neon database connection was terminated. This is normal for serverless databases.');
      isDbHealthy = false;
      
      // Запускаем проверку подключения к БД через 5 секунд
      setTimeout(checkDatabaseHealth, 5000);
      
      // Возвращаем ответ клиенту о временной недоступности
      if (!res.headersSent) {
        return res.status(503).json({ 
          message: "Database temporarily unavailable. Please try again in a few moments."
        });
      }
    }
    
    // Отправляем ответ об ошибке клиенту
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  
  // Обработчик ошибок при запуске сервера
  function startServer() {
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      log(`serving on port ${port}`);
    }).on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Waiting 3 seconds to retry...`);
        setTimeout(() => {
          console.log('Attempting to restart server...');
          server.close();
          startServer();
        }, 3000);
      } else {
        console.error('Error starting server:', err);
      }
    });
  }
  
  startServer();
})();
