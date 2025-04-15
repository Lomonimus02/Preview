import { useState, useEffect } from "react";

/**
 * Хук для отслеживания медиа-запросов
 * @param query Медиа-запрос для отслеживания (например, "(max-width: 768px)")
 * @returns Булево значение, указывающее, соответствует ли текущее состояние экрана медиа-запросу
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(false);

  useEffect(() => {
    // Проверяем, находимся ли мы в окружении браузера
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    
    const mediaQuery = window.matchMedia(query);
    
    // Устанавливаем начальное состояние
    setMatches(mediaQuery.matches);
    
    // Функция обработчик изменений медиа-запроса
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };
    
    // Подписываемся на изменения (используем правильный API в зависимости от браузера)
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleChange);
    } else {
      // Обратная совместимость для старых браузеров
      mediaQuery.addListener(handleChange);
    }
    
    // Отписываемся при размонтировании компонента
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", handleChange);
      } else {
        // Обратная совместимость для старых браузеров
        mediaQuery.removeListener(handleChange);
      }
    };
  }, [query]);
  
  return matches;
}