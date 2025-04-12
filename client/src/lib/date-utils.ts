import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

// Преобразует JavaScript Date в строку формата "дд.мм.гггг"
export function formatDate(date: Date): string {
  return format(date, 'dd.MM.yyyy', { locale: ru });
}

// Преобразует JavaScript Date в строку формата "дд.мм.гггг ЧЧ:мм"
export function formatDateTime(date: Date): string {
  return format(date, 'dd.MM.yyyy HH:mm', { locale: ru });
}

// Возвращает название дня недели на русском языке
export function getDayOfWeekName(dayOfWeek: number): string {
  const days = [
    'Воскресенье', // 0 или 7
    'Понедельник', // 1
    'Вторник',    // 2
    'Среда',      // 3
    'Четверг',    // 4
    'Пятница',    // 5
    'Суббота'     // 6
  ];
  
  // Если dayOfWeek = 7, это означает воскресенье в нашем API (где 1 = понедельник, 7 = воскресенье)
  return days[dayOfWeek === 7 ? 0 : dayOfWeek];
}

// Возвращает короткое название дня недели на русском языке (Пн, Вт, и т.д.)
export function getShortDayOfWeekName(dayOfWeek: number): string {
  const days = [
    'Вс', // 0 или 7
    'Пн', // 1
    'Вт', // 2
    'Ср', // 3
    'Чт', // 4
    'Пт', // 5
    'Сб'  // 6
  ];
  
  return days[dayOfWeek === 7 ? 0 : dayOfWeek];
}

// Функция для получения номера дня недели (1-7) из объекта Date
export function getDayOfWeekNumber(date: Date): number {
  const day = date.getDay(); // 0 = воскресенье, 1 = понедельник, ..., 6 = суббота
  return day === 0 ? 7 : day; // Преобразуем воскресенье (0) в 7
}

// Функция для проверки, является ли дата текущей
export function isToday(date: Date): boolean {
  const today = new Date();
  return date.getDate() === today.getDate() &&
         date.getMonth() === today.getMonth() &&
         date.getFullYear() === today.getFullYear();
}

// Функция для проверки, является ли дата выходным днем (суббота или воскресенье)
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = воскресенье, 6 = суббота
}