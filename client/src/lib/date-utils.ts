/**
 * Получает понедельник текущей или указанной недели
 */
export function getMonday(date: Date): Date {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // коррекция для воскресенья
  const monday = new Date(date);
  monday.setDate(diff);
  return monday;
}

/**
 * Форматирует дату в читаемый вид (день.месяц.год)
 */
export function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Получает массив дат для всей недели, начиная с понедельника
 */
export function getWeekDates(startDate: Date): Date[] {
  const monday = getMonday(startDate);
  const dates: Date[] = [];
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    dates.push(date);
  }
  
  return dates;
}

/**
 * Получает день недели (1-7) для даты, где 1 - понедельник, 7 - воскресенье
 */
export function getDayOfWeek(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day; // преобразуем воскресенье (0) в 7
}

/**
 * Получает название дня недели на русском языке
 */
export function getDayOfWeekName(dayNumber: number): string {
  const days = [
    'Понедельник',
    'Вторник',
    'Среда',
    'Четверг',
    'Пятница',
    'Суббота',
    'Воскресенье'
  ];
  
  // Сдвигаем индекс, т.к. dayNumber начинается с 1 (понедельник)
  return days[dayNumber - 1] || '';
}

/**
 * Форматирует время в строке "ЧЧ:ММ"
 */
export function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Проверяет, является ли первая дата раньше второй
 */
export function isDateBefore(date1: Date, date2: Date): boolean {
  return date1.getTime() < date2.getTime();
}

/**
 * Сравнивает две даты без учета времени (только год, месяц, день)
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Добавляет указанное количество дней к дате
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}