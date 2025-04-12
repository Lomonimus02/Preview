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
  if (!time) return '';
  
  // Если время уже в нужном формате, возвращаем его
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(time)) {
    return time.substring(0, 5);
  }
  
  try {
    const date = new Date(time);
    
    if (isNaN(date.getTime())) {
      return time;
    }
    
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${hours}:${minutes}`;
  } catch (e) {
    return time;
  }
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
    'Суббота'
  ];
  
  // Если день недели передан в формате 1-7, где 1 - понедельник, а 7 - воскресенье
  if (dayOfWeek >= 1 && dayOfWeek <= 7) {
    return days[dayOfWeek === 7 ? 0 : dayOfWeek];
  }
  
  // Если день недели передан в формате 0-6, где 0 - воскресенье, а 6 - суббота
  if (dayOfWeek >= 0 && dayOfWeek <= 6) {
    return days[dayOfWeek];
  }
  
  return 'Неизвестный день';
}

/**
 * Возвращает короткое название дня недели на русском языке
 */
export function getShortDayOfWeekName(dayOfWeek: number): string {
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  
  // Если день недели передан в формате 1-7, где 1 - понедельник, а 7 - воскресенье
  if (dayOfWeek >= 1 && dayOfWeek <= 7) {
    return days[dayOfWeek === 7 ? 0 : dayOfWeek];
  }
  
  // Если день недели передан в формате 0-6, где 0 - воскресенье, а 6 - суббота
  if (dayOfWeek >= 0 && dayOfWeek <= 6) {
    return days[dayOfWeek];
  }
  
  return '??';
}

/**
 * Возвращает день недели для даты (1-7, где 1 - понедельник, 7 - воскресенье)
 */
export function getDayOfWeek(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

/**
 * Проверяет, совпадают ли две даты (без учета времени)
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Получает массив дат для текущей недели, начиная с понедельника
 */
export function getWeekDates(currentDate: Date): Date[] {
  const dates: Date[] = [];
  const startOfWeek = new Date(currentDate);
  
  // Определяем день недели (0 - воскресенье, 1 - понедельник, и т.д.)
  const dayOfWeek = startOfWeek.getDay();
  
  // Устанавливаем дату на понедельник текущей недели
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  startOfWeek.setDate(startOfWeek.getDate() + diff);
  
  // Создаем массив дат для недели
  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek);
    date.setDate(date.getDate() + i);
    dates.push(date);
  }
  
  return dates;
}

/**
 * Получает дату понедельника для недели, содержащей указанную дату
 */
export function getMonday(date: Date): Date {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}