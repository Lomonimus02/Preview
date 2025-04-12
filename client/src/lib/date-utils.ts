/**
 * Форматирует дату в формат DD.MM.YYYY
 */
export function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Форматирует время в формат HH:MM
 */
export function formatTime(time: string): string {
  return time;
}

/**
 * Возвращает название дня недели на русском языке
 */
export function getDayOfWeekName(dayOfWeek: number): string {
  const days = [
    'Воскресенье',
    'Понедельник',
    'Вторник',
    'Среда',
    'Четверг',
    'Пятница',
    'Суббота',
    'Воскресенье' // Дублируем для случая, когда dayOfWeek = 7
  ];
  return days[dayOfWeek];
}

/**
 * Возвращает короткое название дня недели на русском языке
 */
export function getShortDayOfWeekName(dayOfWeek: number): string {
  const days = [
    'ВС',
    'ПН',
    'ВТ',
    'СР',
    'ЧТ',
    'ПТ',
    'СБ',
    'ВС' // Дублируем для случая, когда dayOfWeek = 7
  ];
  return days[dayOfWeek];
}

/**
 * Возвращает день недели для даты (1-7, где 1 - понедельник, 7 - воскресенье)
 */
export function getDayOfWeek(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}