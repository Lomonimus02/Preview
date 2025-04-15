import React, { useState, useCallback, useEffect } from "react";
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
import { FiChevronLeft, FiChevronRight, FiCalendar } from "react-icons/fi";

interface ScheduleCarouselProps {
  schedules: Schedule[];
  subjects: Subject[];
  teachers: User[];
  classes: Class[];
  grades?: Grade[];
  homework?: Homework[];
  currentUser?: User | null;
  isAdmin?: boolean;
  canView?: boolean; // Флаг для разрешения просмотра (для директора)
  subgroups?: any[]; // Добавляем подгруппы
  showClassNames?: boolean; // Флаг для отображения имен классов (для общего расписания)
  onAddSchedule?: (date: Date) => void;
  onEditSchedule?: (schedule: Schedule) => void;
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
  canView = false,
  subgroups = [],
  showClassNames = false,
  onAddSchedule,
  onEditSchedule,
  onDeleteSchedule
}) => {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    // Начало текущей недели (понедельник)
    return startOfWeek(new Date(), { weekStartsOn: 1 });
  });
  
  const [emblaRef, emblaApi] = useEmblaCarousel({ 
    loop: false,
    align: "start",
    dragFree: true
  });

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
    
    const filteredSchedules = schedules.filter(schedule => {
      // Фильтрация по дате, если установлена конкретная дата
      if (schedule.scheduleDate) {
        // Используем сравнение дат без времени (только год, месяц, день)
        const scheduleDate = new Date(schedule.scheduleDate);
        return format(scheduleDate, "yyyy-MM-dd") === format(date, "yyyy-MM-dd");
      }
      
      // Фильтрация по дню недели
      // JS: 0 - воскресенье, 1 - понедельник, ..., 6 - суббота
      // API: 1 - понедельник, 2 - вторник, ..., 7 - воскресенье
      const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();
      return schedule.dayOfWeek === dayOfWeek;
    });
    
    // Отладочный вывод
    console.log(`Расписание на ${formattedDate}:`, filteredSchedules);
    if (filteredSchedules.length > 0) {
      filteredSchedules.forEach(schedule => {
        if (schedule.assignments && schedule.assignments.length > 0) {
          console.log(`Найдены задания для расписания ${schedule.id}:`, schedule.assignments);
        }
      });
    }
    
    return filteredSchedules;
  };

  const currentWeekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
  const weekRangeText = `${format(currentWeekStart, "d MMM", { locale: ru })} - ${format(currentWeekEnd, "d MMM yyyy", { locale: ru })}`;

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col mb-0">
      <div className="flex justify-between items-center mb-1 px-1 gap-1">
        <Button 
          variant="outline" 
          onClick={goToPreviousWeek}
          className="p-1 h-8 w-10 xs:h-auto xs:w-auto xs:p-2 gap-0.5 text-xs xs:text-sm"
          size="sm"
        >
          <FiChevronLeft className="shrink-0" /> 
          <span className="hidden xs:inline">Пред.</span>
        </Button>
        
        <div className="flex items-center text-xs xs:text-sm sm:text-base font-medium">
          <FiCalendar className="mr-1 shrink-0" />
          <span>{weekRangeText}</span>
        </div>
        
        <Button 
          variant="outline" 
          onClick={goToNextWeek}
          className="p-1 h-8 w-10 xs:h-auto xs:w-auto xs:p-2 gap-0.5 text-xs xs:text-sm"
          size="sm"
        >
          <span className="hidden xs:inline">След.</span>
          <FiChevronRight className="shrink-0" />
        </Button>
      </div>
      
      <div className="overflow-hidden touch-pan-y overscroll-x-none flex-grow" ref={emblaRef}>
        <div className="flex h-full gap-0.5 xs:gap-1 md:gap-3 pb-0">
          {weekDates.map((date) => (
            <div className="flex-shrink-0 h-full" key={format(date, "yyyy-MM-dd")}>
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
                canView={canView}
                subgroups={subgroups}
                showClassNames={showClassNames}
                onAddSchedule={onAddSchedule}
                onEditSchedule={onEditSchedule}
                onDeleteSchedule={onDeleteSchedule}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};