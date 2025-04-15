import { useState, useEffect } from 'react';

/**
 * Hook для отслеживания медиа-запросов
 * @param query - CSS медиа-запрос, например "(max-width: 768px)"
 * @returns boolean результат проверки медиа-запроса
 */
export const useMediaQuery = (query: string): boolean => {
  // Состояние, отслеживающее соответствие медиа-запросу
  const [matches, setMatches] = useState<boolean>(false);
  
  useEffect(() => {
    // Создаем медиа-запрос
    const mediaQuery = window.matchMedia(query);
    
    // Устанавливаем начальное состояние
    setMatches(mediaQuery.matches);
    
    // Функция для обновления состояния при изменении условий медиа-запроса
    const handleChange = (event: MediaQueryListEvent): void => {
      setMatches(event.matches);
    };
    
    // Добавляем слушатель событий
    mediaQuery.addEventListener('change', handleChange);
    
    // Удаляем слушатель событий при размонтировании компонента
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [query]); // Пересоздаем эффект только при изменении запроса
  
  return matches;
};

export default useMediaQuery;