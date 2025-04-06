import React, { useState, useEffect, useRef } from "react";
import { Schedule, Class, Subject, User } from "@shared/schema";
import { ScheduleCard } from "./schedule-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Calendar, MoveHorizontal } from "lucide-react";
import { format, addDays, subDays, startOfWeek, addWeeks, isSameDay } from "date-fns";
import { ru } from "date-fns/locale";
import { motion } from "framer-motion";
import { useMediaQuery } from "@/hooks/use-media-query";

interface ScheduleCarouselProps {
  schedules: Schedule[];
  classes: Class[];
  subjects: Subject[];
  users: User[];
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onEditSchedule?: (schedule: Schedule) => void;
  onDeleteSchedule?: (scheduleId: number) => void;
}

export function ScheduleCarousel({
  schedules,
  classes,
  subjects,
  users,
  selectedDate,
  onDateSelect,
  onEditSchedule,
  onDeleteSchedule,
}: ScheduleCarouselProps) {
  // Количество дней для показа в карусели с учетом размера экрана
  const isDesktop = useMediaQuery("(min-width: 1200px)");
  const isTablet = useMediaQuery("(min-width: 768px)");
  const isMobile = useMediaQuery("(min-width: 480px)");
  
  const visibleDays = isDesktop ? 4 : isTablet ? 3 : isMobile ? 2 : 1;
  
  // Текущая дата (сегодня)
  const today = new Date();
  
  // Состояние для дат в карусели
  const [dates, setDates] = useState<Date[]>([]);
  
  // Состояние для индекса карусели
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Отслеживание состояния свайпа
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const dragThreshold = 50; // Минимальное расстояние для свайпа
  
  // Референс для контейнера карусели
  const carouselRef = useRef<HTMLDivElement>(null);
  
  // Инициализация дат для карусели
  useEffect(() => {
    const initDates = [];
    const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Начинаем с понедельника
    
    // Создаем массив из 14 дней (2 недели) для более плавной навигации
    for (let i = 0; i < 14; i++) {
      initDates.push(addDays(weekStart, i));
    }
    
    setDates(initDates);
    
    // Проверяем, есть ли выбранная дата в текущем наборе дат
    const selectedDateIndex = initDates.findIndex(date => 
      isSameDay(date, selectedDate)
    );
    
    if (selectedDateIndex === -1) {
      // Если нет, переходим к неделе, содержащей выбранную дату
      navigateToDate(selectedDate);
    } else {
      // Устанавливаем индекс, чтобы показать выбранную дату по центру
      setCurrentIndex(Math.max(0, selectedDateIndex - Math.floor(visibleDays / 2)));
    }
  }, [selectedDate, visibleDays]);
  
  // Переход на конкретную дату
  const navigateToDate = (date: Date) => {
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const newDates = [];
    
    // Создаем массив из 14 дней (2 недели) для более плавной навигации
    for (let i = -7; i < 7; i++) {
      newDates.push(addDays(weekStart, i));
    }
    
    setDates(newDates);
    
    // Находим индекс выбранной даты в новом наборе
    const selectedDateIndex = newDates.findIndex(d => 
      isSameDay(d, date)
    );
    
    if (selectedDateIndex !== -1) {
      // Устанавливаем индекс, чтобы показать выбранную дату по центру
      setCurrentIndex(Math.max(0, selectedDateIndex - Math.floor(visibleDays / 2)));
    } else {
      setCurrentIndex(7); // По умолчанию показываем начало текущей недели (индекс 7 в массиве из 14 дней)
    }
  };
  
  // Переход к следующему или предыдущему набору дней (неделе)
  const navigate = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      const newDates = dates.map(date => subDays(date, 7));
      setDates(newDates);
      setCurrentIndex(Math.max(0, currentIndex - 2)); // Сдвигаем индекс для более плавного перехода
    } else {
      const newDates = dates.map(date => addDays(date, 7));
      setDates(newDates);
      setCurrentIndex(Math.min(currentIndex + 2, Math.max(0, dates.length - visibleDays))); // Сдвигаем индекс для более плавного перехода
    }
  };
  
  // Навигация по карусели вперед и назад
  const navigateCarousel = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      if (currentIndex > 0) {
        setCurrentIndex(prevIndex => prevIndex - 1);
      } else {
        // Если в начале массива, переходим к предыдущей неделе
        navigate('prev');
      }
    } else {
      const maxIndex = Math.max(0, dates.length - visibleDays);
      if (currentIndex < maxIndex) {
        setCurrentIndex(prevIndex => prevIndex + 1);
      } else {
        // Если в конце массива, переходим к следующей неделе
        navigate('next');
      }
    }
  };
  
  // Обработка выбора даты
  const handleDateSelect = (date: Date) => {
    onDateSelect(date);
  };
  
  // Получение названия дня с заглавной буквы
  const getDayName = (date: Date) => {
    return format(date, 'EEEE', { locale: ru });
  };
  
  // Получение видимых дат на основе текущего индекса
  const getVisibleDates = () => {
    // Возвращаем все даты для возможности горизонтальной прокрутки
    return dates;
  };
  
  // Фильтрация расписаний для конкретной даты
  const getSchedulesForDate = (date: Date) => {
    const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay(); // Воскресенье (0) преобразуем в 7
    
    return schedules.filter(schedule => {
      // Проверяем, является ли это расписанием для конкретной даты
      if (schedule.scheduleDate) {
        const scheduleDate = new Date(schedule.scheduleDate);
        return isSameDay(scheduleDate, date);
      }
      
      // Иначе проверяем день недели
      return schedule.dayOfWeek === dayOfWeek;
    });
  };
  
  // Обработка колесика мыши для прокрутки
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault(); // Предотвращаем стандартную прокрутку страницы
      
      // Реагируем как на вертикальную, так и на горизонтальную прокрутку
      if (e.deltaY > 20 || e.deltaX > 20) {
        navigateCarousel('next');
      } else if (e.deltaY < -20 || e.deltaX < -20) {
        navigateCarousel('prev');
      }
    };
    
    const carousel = carouselRef.current;
    if (carousel) {
      carousel.addEventListener('wheel', handleWheel, { passive: false });
    }
    
    return () => {
      if (carousel) {
        carousel.removeEventListener('wheel', handleWheel);
      }
    };
  }, [currentIndex, dates.length, visibleDays]);
  
  // Обработка событий касания для мобильного свайпа
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    setDragStartX(e.touches[0].clientX);
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    
    const currentX = e.touches[0].clientX;
    const diff = dragStartX - currentX;
    
    if (Math.abs(diff) > dragThreshold) {
      if (diff > 0) {
        navigateCarousel('next');
      } else {
        navigateCarousel('prev');
      }
      setIsDragging(false);
    }
  };
  
  const handleTouchEnd = () => {
    setIsDragging(false);
  };
  
  // Обработка событий мыши для перетаскивания на десктопе
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const currentX = e.clientX;
    const diff = dragStartX - currentX;
    
    if (Math.abs(diff) > dragThreshold) {
      if (diff > 0) {
        navigateCarousel('next');
      } else {
        navigateCarousel('prev');
      }
      setIsDragging(false);
    }
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  // Навигация к текущей неделе
  const goToCurrentWeek = () => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const newDates = [];
    
    // Создаем массив из 14 дней (2 недели)
    for (let i = -3; i < 11; i++) {
      newDates.push(addDays(weekStart, i));
    }
    
    setDates(newDates);
    // Устанавливаем индекс, чтобы показать сегодняшнюю дату
    const todayIndex = newDates.findIndex(date => isSameDay(date, new Date()));
    if (todayIndex !== -1) {
      setCurrentIndex(Math.max(0, todayIndex - Math.floor(visibleDays / 2)));
    } else {
      setCurrentIndex(4); // Позиция понедельника текущей недели
    }
    
    // Выбираем сегодняшнюю дату
    onDateSelect(new Date());
  };
  
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('prev')}>
            <ChevronLeft className="h-4 w-4" />
            Пред. неделя
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToCurrentWeek}
            className="font-medium"
          >
            <Calendar className="h-4 w-4 mr-1" />
            Сегодня
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('next')}>
            След. неделя
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex items-center gap-1 text-muted-foreground text-sm">
          <MoveHorizontal className="h-3.5 w-3.5" />
          <span>Прокрутите для навигации</span>
        </div>
      </div>

      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          className="absolute -left-10 top-1/2 transform -translate-y-1/2 h-8 w-8 hidden md:flex z-10"
          onClick={() => navigateCarousel('prev')}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div
          className="relative overflow-x-auto pb-4 schedule-carousel"
          ref={carouselRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            scrollbarWidth: 'none', // Firefox
            msOverflowStyle: 'none', // IE
          }}
        >
          {/* Стили для скрытия полосы прокрутки добавлены в основные стили компонента */}
          <div
            className="flex gap-4 snap-x snap-mandatory"
            style={{
              width: `${dates.length * 100}%`,
              transform: `translateX(-${(currentIndex / dates.length) * 100}%)`,
              transition: 'transform 0.3s ease-in-out',
            }}
          >
            {getVisibleDates().map((date, index) => {
              const dateSchedules = getSchedulesForDate(date);
              const isCurrentDate = isSameDay(date, today);
              const isSelected = isSameDay(date, selectedDate);
              
              return (
                <div
                  key={date.toISOString()}
                  className={`snap-start flex-shrink-0`}
                  style={{ width: `calc(100% / ${visibleDays})` }}
                  onClick={() => handleDateSelect(date)}
                >
                  <div 
                    className={`
                      h-full cursor-pointer transition-all mx-1
                      ${isSelected ? 'ring-2 ring-primary rounded-lg ring-offset-2' : ''}
                    `}
                  >
                    <ScheduleCard
                      date={date}
                      dayName={getDayName(date)}
                      schedules={dateSchedules}
                      classes={classes}
                      subjects={subjects}
                      users={users}
                      isCurrentDate={isCurrentDate}
                      onEditSchedule={onEditSchedule}
                      onDeleteSchedule={onDeleteSchedule}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="absolute -right-10 top-1/2 transform -translate-y-1/2 h-8 w-8 hidden md:flex z-10"
          onClick={() => navigateCarousel('next')}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex justify-center flex-wrap gap-1 mt-2">
        {dates.slice(0, 14).map((date, index) => (
          <button
            key={index}
            className={`h-2 rounded-full transition-all ${
              index >= currentIndex && index < currentIndex + visibleDays
                ? isSameDay(date, selectedDate)
                  ? "w-6 bg-primary"
                  : "w-3 bg-primary/60"
                : "w-3 bg-muted"
            }`}
            onClick={() => {
              setCurrentIndex(Math.min(Math.max(0, index - Math.floor(visibleDays / 2)), Math.max(0, dates.length - visibleDays)));
              handleDateSelect(date);
            }}
            title={format(date, "d MMMM", { locale: ru })}
          />
        ))}
      </div>
    </div>
  );
}