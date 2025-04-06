import { useState, useEffect, useCallback, useMemo } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { DayCard } from "./day-card";
import { Schedule as ScheduleType, Subject, Class, User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, startOfWeek, format, endOfWeek, isSameDay, getDay } from "date-fns";
import { ru } from "date-fns/locale";

interface ScheduleCarouselProps {
  schedules: ScheduleType[];
  subjects: Subject[];
  classes: Class[];
  users: User[];
  selectedDate: Date | null;
  onDateChange: (date: Date | null) => void;
}

export function ScheduleCarousel({
  schedules,
  subjects,
  classes,
  users,
  selectedDate,
  onDateChange,
}: ScheduleCarouselProps) {
  // Настройки карусели для плавной прокрутки без резких прыжков
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: "center",
    containScroll: "trimSnaps",
    dragFree: false,         // Отключаем dragFree для более контролируемой прокрутки
    skipSnaps: false,        // Запрещаем пропуск промежуточных снимков
    duration: 30,            // Уменьшаем длительность анимации для более быстрого отклика
    startIndex: 0,           // Устанавливаем начальный индекс
    inViewThreshold: 0.6,    // Элемент считается видимым при показе 60% его ширины
    slidesToScroll: 1,       // Устанавливаем прокрутку по одному слайду для предотвращения скачков
  });
  
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  
  // Если selectedDate не задан, используем текущую дату
  const currentDate = useMemo(() => selectedDate || new Date(), [selectedDate]);
  
  // Получаем начало текущей недели
  const weekStart = useMemo(() => {
    const start = startOfWeek(currentDate, { locale: ru, weekStartsOn: 1 });
    return addDays(start, 7 * weekOffset);
  }, [currentDate, weekOffset]);
  
  // Создаем массив дат для всех дней недели
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      return addDays(weekStart, i);
    });
  }, [weekStart]);
  
  // Преобразуем день недели из Date в формат 1-7 (пн-вс)
  const getWeekDayIndex = (date: Date) => {
    // getDay() возвращает 0 для воскресенья, 1-6 для пн-сб
    const dayOfWeek = getDay(date);
    // Преобразуем в формат 1-7 (пн-вс)
    return dayOfWeek === 0 ? 7 : dayOfWeek;
  };
  
  // Определяем индекс для текущего дня
  const currentDayIndex = useMemo(() => {
    if (!selectedDate) return getWeekDayIndex(new Date()) - 1;
    
    // Ищем индекс выбранной даты в массиве weekDays
    const index = weekDays.findIndex(day => isSameDay(day, selectedDate));
    return index !== -1 ? index : getWeekDayIndex(selectedDate) - 1;
  }, [selectedDate, weekDays]);
  
  // Улучшенная инициализация и прокрутка к текущему дню
  useEffect(() => {
    if (!emblaApi) return;
    
    // Используем setTimeout для гарантии что контент полностью загружен
    const timer = setTimeout(() => {
      // Сначала инициализируем слайдер, чтобы он правильно рассчитал размеры и позиции
      emblaApi.reInit();
      
      // Затем используем requestAnimationFrame для плавного перехода с небольшой задержкой
      requestAnimationFrame(() => {
        // Скроллим к нужному индексу без анимации для предотвращения рывков
        emblaApi.scrollTo(currentDayIndex, false);
        
        // После позиционирования обновляем состояние
        setSelectedIndex(currentDayIndex);
      });
    }, 10); // Небольшая задержка для полной загрузки DOM
    
    return () => clearTimeout(timer);
  }, [emblaApi, currentDayIndex, weekOffset]);
  
  // Предварительно загружаем данные для всех дней недели
  useEffect(() => {
    // Принудительно инициализируем все дни и их содержимое
    if (emblaApi) {
      emblaApi.reInit();
    }
  }, [emblaApi, weekDays, weekOffset]);
  
  // Добавляем улучшенный обработчик колесика мыши для плавной прокрутки карусели
  useEffect(() => {
    if (!emblaApi) return;
    
    // Использование времени для предотвращения слишком частых прокруток
    let lastWheelEventTime = 0;
    const wheelEventIntervalMs = 100; // Минимальный интервал между событиями прокрутки
    
    const handleWheel = (event: WheelEvent) => {
      // Предотвращаем стандартную прокрутку страницы
      event.preventDefault();
      
      // Текущее время
      const now = Date.now();
      
      // Проверяем, прошло ли достаточно времени с последнего события
      if (now - lastWheelEventTime < wheelEventIntervalMs) {
        return; // Игнорируем слишком частые события
      }
      
      // Обновляем время последнего события
      lastWheelEventTime = now;
      
      // Определяем направление прокрутки с учетом величины прокрутки
      // для более плавной работы на трекпадах и сенсорных устройствах
      const scrollMultiplier = Math.min(Math.abs(event.deltaY) / 100, 1);
      
      if (event.deltaY < 0) {
        // Прокрутка вверх - двигаемся влево
        // Используем scrollTo для более контролируемой прокрутки
        const currentIndex = emblaApi.selectedScrollSnap();
        emblaApi.scrollTo(Math.max(0, currentIndex - 1));
      } else {
        // Прокрутка вниз - двигаемся вправо
        const currentIndex = emblaApi.selectedScrollSnap();
        const maxIndex = emblaApi.scrollSnapList().length - 1;
        emblaApi.scrollTo(Math.min(maxIndex, currentIndex + 1));
      }
    };
    
    // Получаем ROOT DOM-элемент карусели напрямую через emblaApi
    const emblaRoot = emblaApi.rootNode();
    
    if (emblaRoot) {
      // Добавляем слушатель события колеса мыши
      emblaRoot.addEventListener('wheel', handleWheel, { passive: false });
      
      // Функция очистки при размонтировании компонента
      return () => {
        emblaRoot.removeEventListener('wheel', handleWheel);
      };
    }
  }, [emblaApi]);
  
  // Обработчики переключения недель
  const goToPrevWeek = () => {
    setWeekOffset(prev => prev - 1);
  };
  
  const goToNextWeek = () => {
    setWeekOffset(prev => prev + 1);
  };
  
  // Обработчик клика по дню с предотвращением резких скачков
  const handleDayClick = (date: Date, index: number) => {
    // Обновляем выбранную дату в родительском компоненте
    // без запроса новых данных (данные уже загружены для всей недели)
    onDateChange(date);
    setSelectedIndex(index);
    
    // Плавно скроллим карусель к выбранной карточке без анимации
    // чтобы предотвратить визуальный скачок
    if (emblaApi) {
      // Отложенное выполнение для предотвращения конфликтов с другими обработчиками
      setTimeout(() => {
        emblaApi.scrollTo(index, false);
      }, 10);
    }
  };
  
  // Форматируем даты для отображения диапазона недели
  const weekRange = useMemo(() => {
    const start = format(weekStart, "d MMMM", { locale: ru });
    const end = format(endOfWeek(weekStart, { locale: ru, weekStartsOn: 1 }), "d MMMM", { locale: ru });
    return `${start} - ${end}`;
  }, [weekStart]);
  
  // Фильтрация расписаний по дню
  const getSchedulesByDay = (day: number, date: Date) => {
    // Проверяем что день в диапазоне 1-7
    const validDay = day >= 1 && day <= 7 ? day : 1;
    
    return schedules.filter(schedule => {
      // Проверяем совпадение по дню недели
      if (schedule.dayOfWeek !== validDay) return false;
      
      // Если есть конкретная дата в расписании, проверяем её
      if (schedule.scheduleDate) {
        const scheduleDate = new Date(schedule.scheduleDate);
        return isSameDay(scheduleDate, date);
      }
      
      return true;
    });
  };
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={goToPrevWeek}
          className="flex items-center"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Предыдущая неделя
        </Button>
        
        <div className="text-center font-medium">
          {weekRange}
        </div>
        
        <Button 
          variant="outline" 
          size="sm" 
          onClick={goToNextWeek}
          className="flex items-center"
        >
          Следующая неделя
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
      
      <div className="overflow-hidden" ref={emblaRef} data-embla-container>
        <div className="flex gap-4">
          {weekDays.map((date, index) => {
            const day = getWeekDayIndex(date);
            const daySchedules = getSchedulesByDay(day, date);
            
            return (
              <div 
                key={index} 
                className="min-w-[300px] flex-[0_0_300px] md:min-w-[350px] md:flex-[0_0_350px] h-[580px] cursor-pointer"
                onClick={() => handleDayClick(date, index)}
              >
                <DayCard
                  day={day}
                  date={date}
                  schedules={daySchedules}
                  subjects={subjects}
                  classes={classes}
                  users={users}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}