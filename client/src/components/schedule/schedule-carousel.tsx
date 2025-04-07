import React, { useState, useCallback, useEffect, useRef } from "react";
import { 
  startOfWeek, 
  endOfWeek, 
  addDays, 
  format, 
  addWeeks, 
  subWeeks,
  isSameDay 
} from "date-fns";
import { ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ScheduleDayCard } from "./schedule-day-card";
import { Schedule, User, Subject, Class, Grade, UserRoleEnum, Homework } from "@shared/schema";
import { FiChevronLeft, FiChevronRight, FiCalendar, FiArrowLeft, FiArrowRight } from "react-icons/fi";

interface ScheduleCarouselProps {
  schedules: Schedule[];
  subjects: Subject[];
  teachers: User[];
  classes: Class[];
  grades?: Grade[];
  homework?: Homework[];
  currentUser?: User | null;
  isAdmin?: boolean;
  onAddSchedule: (date: Date) => void;
  onDeleteSchedule?: (scheduleId: number) => void;
}

export const ScheduleCarousel: React.FC<ScheduleCarouselProps> = ({
  schedules,
  subjects,
  teachers,
  classes,
  grades = [],
  homework = [],
  currentUser = null,
  isAdmin = false,
  onAddSchedule,
  onDeleteSchedule
}) => {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    // Начало текущей недели (понедельник)
    return startOfWeek(new Date(), { weekStartsOn: 1 });
  });
  
  // Создаем массив дат для текущей недели
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  
  // Состояние для текущего отображаемого индекса
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cardsVisible, setCardsVisible] = useState(1);
  
  // Получаем дни недели на русском
  const getDayName = (date: Date) => {
    return format(date, "EEEE", { locale: ru });
  };

  // Фильтруем расписание для конкретного дня
  const getSchedulesForDate = (date: Date) => {
    const formattedDate = format(date, "yyyy-MM-dd");
    
    return schedules.filter(schedule => {
      // Фильтрация по дате, если установлена конкретная дата
      if (schedule.scheduleDate) {
        const scheduleDate = new Date(schedule.scheduleDate);
        return isSameDay(scheduleDate, date);
      }
      
      // Фильтрация по дню недели
      const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();
      return schedule.dayOfWeek === dayOfWeek;
    });
  };

  // Обработчики переключения недель
  const goToPreviousWeek = useCallback(() => {
    const newWeekStart = subWeeks(currentWeekStart, 1);
    setCurrentWeekStart(newWeekStart);
    setCurrentIndex(0); // Сбрасываем на первый день недели
  }, [currentWeekStart]);

  const goToNextWeek = useCallback(() => {
    const newWeekStart = addWeeks(currentWeekStart, 1);
    setCurrentWeekStart(newWeekStart);
    setCurrentIndex(0); // Сбрасываем на первый день недели
  }, [currentWeekStart]);
  
  // Обработчики прокрутки карточек внутри недели
  const scrollPrev = useCallback(() => {
    console.log("Scrolling to previous card");
    if (currentIndex > 0) {
      setCurrentIndex(prevIndex => prevIndex - 1);
    }
  }, [currentIndex]);
  
  const scrollNext = useCallback(() => {
    console.log("Scrolling to next card");
    if (currentIndex < weekDates.length - cardsVisible) {
      setCurrentIndex(prevIndex => prevIndex + 1);
    }
  }, [currentIndex, weekDates.length, cardsVisible]);
  
  // Состояние для отслеживания возможности прокрутки
  const canScrollPrev = currentIndex > 0;
  const canScrollNext = currentIndex < weekDates.length - cardsVisible;
  
  // Контейнер для обработки колесика мыши
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Обновляем видимость карточек в зависимости от размера экрана
  useEffect(() => {
    const updateVisibleCards = () => {
      const width = window.innerWidth;
      if (width < 640) {
        setCardsVisible(1);
      } else if (width < 1024) {
        setCardsVisible(2);
      } else {
        setCardsVisible(3);
      }
    };
    
    updateVisibleCards();
    window.addEventListener('resize', updateVisibleCards);
    
    return () => {
      window.removeEventListener('resize', updateVisibleCards);
    };
  }, []);
  
  // Обработчик колесика мыши
  useEffect(() => {
    const containerElement = containerRef.current;
    if (!containerElement) return;
    
    const handleWheel = (event: WheelEvent) => {
      // Предотвращаем стандартное поведение прокрутки страницы
      event.preventDefault();
      
      // Определяем направление прокрутки
      if (event.deltaY < 0) {
        scrollPrev();
      } else {
        scrollNext();
      }
    };
    
    // Используем capture phase для гарантированного перехвата события
    containerElement.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    
    return () => {
      containerElement.removeEventListener('wheel', handleWheel, { capture: true });
    };
  }, [scrollPrev, scrollNext]);

  // При изменении недели, проверяем, есть ли текущий день в видимых днях
  useEffect(() => {
    const today = new Date();
    const todayIndex = weekDates.findIndex(date => isSameDay(date, today));
    
    if (todayIndex >= 0) {
      // Если сегодняшний день в текущей неделе, показываем его
      setCurrentIndex(Math.max(0, Math.min(todayIndex, weekDates.length - cardsVisible)));
    } else {
      // Иначе показываем начало недели
      setCurrentIndex(0);
    }
  }, [weekDates, cardsVisible]);

  const currentWeekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
  const weekRangeText = `${format(currentWeekStart, "d MMM", { locale: ru })} - ${format(currentWeekEnd, "d MMM yyyy", { locale: ru })}`;

  return (
    <div className="mb-8 relative">
      <div className="flex justify-between items-center mb-4">
        <Button 
          variant="outline" 
          onClick={goToPreviousWeek}
          className="gap-1"
        >
          <FiChevronLeft /> Предыдущая неделя
        </Button>
        
        <div className="flex items-center text-lg font-medium">
          <FiCalendar className="mr-2" />
          <span>{weekRangeText}</span>
        </div>
        
        <Button 
          variant="outline" 
          onClick={goToNextWeek}
          className="gap-1"
        >
          Следующая неделя <FiChevronRight />
        </Button>
      </div>
      
      {/* Кнопки навигации внутри недели - делаем их крупнее и заметнее */}
      <div className="flex justify-between absolute w-full top-1/2 transform -translate-y-1/2 px-2 z-10 pointer-events-none">
        <Button 
          variant="secondary" 
          size="icon"
          className="rounded-full shadow-md bg-background/80 pointer-events-auto w-10 h-10"
          onClick={scrollPrev}
          disabled={!canScrollPrev}
        >
          <FiArrowLeft className="h-5 w-5" />
        </Button>
        
        <Button 
          variant="secondary" 
          size="icon"
          className="rounded-full shadow-md bg-background/80 pointer-events-auto w-10 h-10"
          onClick={scrollNext}
          disabled={!canScrollNext}
        >
          <FiArrowRight className="h-5 w-5" />
        </Button>
      </div>
      
      {/* Контейнер с прокруткой */}
      <div 
        className="overflow-hidden relative border rounded-lg p-1 bg-card" 
        ref={containerRef}
        style={{ touchAction: 'none' }} // Предотвращаем стандартное поведение тач-устройств
      >
        {/* Обертка для всех карточек с днями */}
        <div 
          className="flex transition-transform duration-300 ease-in-out" 
          style={{ 
            transform: `translateX(-${currentIndex * (100 / cardsVisible)}%)`,
            width: `${weekDates.length * (100 / cardsVisible)}%` // Устанавливаем явную ширину
          }}
        >
          {weekDates.map((date) => (
            <div 
              className="px-2" 
              style={{ 
                width: `${100 / weekDates.length}%`, // Равномерно распределяем карточки
                flexShrink: 0, // Запрещаем сжатие
                flexGrow: 0 // Запрещаем расширение
              }}
              key={format(date, "yyyy-MM-dd")}
            >
              <ScheduleDayCard
                date={date}
                dayName={getDayName(date)}
                schedules={getSchedulesForDate(date)}
                subjects={subjects}
                teachers={teachers}
                classes={classes}
                grades={grades}
                homework={homework}
                currentUser={currentUser}
                isAdmin={isAdmin}
                onAddSchedule={onAddSchedule}
                onDeleteSchedule={onDeleteSchedule}
              />
            </div>
          ))}
        </div>
      </div>
      
      {/* Индикатор текущей позиции - делаем более заметным */}
      <div className="flex justify-center gap-2 mt-4">
        {weekDates.map((date, index) => (
          <button
            key={format(date, "yyyy-MM-dd")}
            className={`w-3 h-3 rounded-full transition-all ${
              index >= currentIndex && index < currentIndex + cardsVisible
                ? 'bg-primary'
                : 'bg-muted-foreground/30'
            }`}
            onClick={() => setCurrentIndex(Math.min(index, weekDates.length - cardsVisible))}
            title={format(date, "EEEE, d MMMM", { locale: ru })}
          />
        ))}
      </div>
      
      {/* Подсказка для пользователя */}
      <div className="text-center mt-3 text-sm text-muted-foreground">
        <span>Используйте колесико мыши или стрелки для навигации по дням недели</span>
      </div>
    </div>
  );
};