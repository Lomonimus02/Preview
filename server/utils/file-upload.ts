import * as path from 'path';
import * as fs from 'fs';
import * as multer from 'multer';
import { Request } from 'express';

// Создаем директорию для загрузок, если она не существует
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Настройка хранилища
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Получаем расширение файла из оригинального имени
    const fileExt = path.extname(file.originalname);
    // Создаем уникальное имя файла с текущей временной меткой
    const fileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${fileExt}`;
    cb(null, fileName);
  }
});

// Функция для определения типа файла
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Разрешенные типы файлов
  const allowedFileTypes = [
    // Изображения
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    // Документы
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    // Видео
    'video/mp4', 'video/webm', 'video/ogg',
    // Аудио
    'audio/mpeg', 'audio/ogg', 'audio/wav'
  ];
  
  if (allowedFileTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Неподдерживаемый тип файла'));
  }
};

// Создаем middleware для загрузки
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  }
});

// Функция для определения типа файла на основе MIME
export function getFileType(mimetype: string): 'image' | 'video' | 'document' {
  if (mimetype.startsWith('image/')) {
    return 'image';
  } else if (mimetype.startsWith('video/')) {
    return 'video';
  } else {
    return 'document';
  }
}

// Функция для получения URL файла
export function getFileUrl(filename: string): string {
  return `/uploads/${filename}`;
}