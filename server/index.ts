import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { testConnection } from "./db";
import dotenv from "dotenv";

// Загружаем переменные окружения
dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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
    
    console.warn('Could not connect to database after multiple attempts. Starting without database connection.');
    return false;
  };
  
  try {
    await tryConnectToDatabase();
  } catch (error) {
    console.error('Fatal error during database connection attempts:', error);
    console.log('Starting app with limited functionality...');
  }
  
  const server = await registerRoutes(app);

  // Глобальный обработчик ошибок
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    console.error('Server error:', err);
    
    // Проверка на ошибки соединения с базой данных Neon
    if (err?.message?.includes('terminating connection due to administrator command') || 
        err?.code === '57P01') {
      console.log('Neon database connection was terminated. This is normal with serverless databases.');
      // Не бросаем ошибку в случае, если это просто разрыв соединения с Neon
    }
    
    // Отправляем ответ об ошибке клиенту
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
    
    // Не выбрасываем ошибку, чтобы не прерывать работу сервера
    // throw err; - убрано
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
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
