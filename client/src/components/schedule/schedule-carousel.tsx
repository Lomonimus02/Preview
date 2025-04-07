import React, { useState, useCallback, useEffect, useRef } from "react";
import useEmblaCarousel from "embla-carousel-react";
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
  
  // Опции для Embla Carousel
  const options = {
    loop: false,
    align: "start",
    dragFree: true,
    containScroll: "trimSnaps"
  };
  
  const [emblaRef, emblaApi] = useEmblaCarousel(options);
  const scrollListenerRef = useRef<((event: WheelEvent) => void) | null>(null);

  // Создаем массив дат для текущей недели
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  
  // Обработчики переключения недель
  const goToPreviousWeek = useCallback(() => {
    const newWeekStart = subWeeks(currentWeekStart, 1);
    setCurrentWeekStart(newWeekStart);
  }, [currentWeekStart]);

  const goToNextWeek = useCallback(() => {
    const newWeekStart = addWeeks(currentWeekStart, 1);
    setCurrentWeekStart(newWeekStart);
  }, [currentWeekStart]);
  
  // Обработчики прокрутки карточек внутри недели
  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);
  
  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);
  
  // Состояние для отслеживания возможности прокрутки
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(true);
  
  // Обновляем состояние кнопок навигации при прокрутке
  useEffect(() => {
    if (!emblaApi) return;
    
    const onSelect = () => {
      setCanScrollPrev(emblaApi.canScrollPrev());
      setCanScrollNext(emblaApi.canScrollNext());
    };
    
    // Инициализация состояния кнопок
    onSelect();
    
    // Подписка на события прокрутки
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi]);

  // Добавляем прокрутку колесиком мыши
  useEffect(() => {
    if (!emblaApi) return;
    
    const handleWheel = (event: WheelEvent) => {
      // Предотвращаем стандартное поведение прокрутки страницы
      event.preventDefault();
      
      // Определяем направление прокрутки
      if (event.deltaY < 0) {
        emblaApi.scrollPrev();
      } else {
        emblaApi.scrollNext();
      }
    };
    
    // Удаляем предыдущий обработчик, если он был
    if (scrollListenerRef.current) {
      emblaRef.current?.removeEventListener('wheel', scrollListenerRef.current);
    }
    
    // Сохраняем ссылку на текущий обработчик
    scrollListenerRef.current = handleWheel;
    
    // Добавляем новый обработчик
    emblaRef.current?.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      if (scrollListenerRef.current) {
        emblaRef.current?.removeEventListener('wheel', scrollListenerRef.current);
      }
    };
  }, [emblaApi, emblaRef]);

  // Скролл к текущему дню, когда меняется неделя
  useEffect(() => {
    if (emblaApi) {
      // Находим индекс сегодняшнего дня в массиве дат недели
      const today = new Date();
      const todayIndex = weekDates.findIndex(date => isSameDay(date, today));
      
      // Если сегодняшний день в текущей неделе, скроллим к нему
      if (todayIndex >= 0) {
        emblaApi.scrollTo(todayIndex);
      } else {
        // Иначе скроллим к началу недели
        emblaApi.scrollTo(0);
      }
    }
  }, [emblaApi, weekDates, currentWeekStart]);

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
      
      {/* Кнопки навигации внутри недели */}
      <div className="flex justify-between absolute w-full top-1/2 transform -translate-y-1/2 px-2 z-10 pointer-events-none">
        <Button 
          variant="outline" 
          size="icon"
          className="rounded-full shadow-md bg-background/90 pointer-events-auto"
          onClick={scrollPrev}
          disabled={!canScrollPrev}
        >
          <FiArrowLeft className="h-5 w-5" />
        </Button>
        
        <Button 
          variant="outline" 
          size="icon"
          className="rounded-full shadow-md bg-background/90 pointer-events-auto"
          onClick={scrollNext}
          disabled={!canScrollNext}
        >
          <FiArrowRight className="h-5 w-5" />
        </Button>
      </div>
      
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-4">
          {weekDates.map((date) => (
            <div className="flex-shrink-0" key={format(date, "yyyy-MM-dd")}>
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
      
      {/* Добавляем небольшую подсказку о прокрутке колесиком мыши */}
      <div className="text-center mt-2 text-sm text-muted-foreground">
        <span>Используйте колесико мыши или стрелки для навигации по дням недели</span>
      </div>
    </div>
  );
};