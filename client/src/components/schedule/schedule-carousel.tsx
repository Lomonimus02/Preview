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
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: "center",
    containScroll: "trimSnaps",
    dragFree: true,          // Включаем режим свободного перетаскивания
    duration: 40,            // Увеличиваем длительность анимации для плавности (в мс)
    inViewThreshold: 0.7,    // Элемент считается видимым при показе 70% его ширины
    slidesToScroll: 3,       // Количество слайдов для пролистывания кнопками или событиями
  });
  
  const [activeIndex, setActiveIndex] = useState(0);
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
  
  // Обработчик прокрутки карусели
  const onScroll = useCallback(() => {
    if (!emblaApi) return;
    setActiveIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);
  
  // Подписка на события прокрутки
  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onScroll);
    return () => {
      emblaApi.off("select", onScroll);
    };
  }, [emblaApi, onScroll]);
  
  // Устанавливаем начальный индекс при изменении currentDayIndex
  useEffect(() => {
    if (!emblaApi) return;
    
    // Используем requestAnimationFrame для плавного перехода
    requestAnimationFrame(() => {
      emblaApi.scrollTo(currentDayIndex);
    });
  }, [emblaApi, currentDayIndex, weekOffset]);
  
  // Предварительно загружаем данные для всех дней недели
  useEffect(() => {
    // Принудительно инициализируем все дни и их содержимое
    if (emblaApi) {
      emblaApi.reInit();
    }
  }, [emblaApi, weekDays, weekOffset]);
  
  // Добавляем обработчик колесика мыши для прокрутки карусели
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (!emblaApi) return;
      
      // Предотвращаем стандартную прокрутку страницы
      event.preventDefault();
      
      // Определяем направление прокрутки
      if (event.deltaY < 0) {
        // Прокрутка вверх - двигаемся влево
        emblaApi.scrollPrev();
      } else {
        // Прокрутка вниз - двигаемся вправо
        emblaApi.scrollNext();
      }
    };
    
    // Получаем DOM-элемент карусели
    const emblaNode = emblaRef.current as HTMLElement | null;
    
    if (emblaNode) {
      // Добавляем слушатель события колеса мыши
      emblaNode.addEventListener('wheel', handleWheel, { passive: false });
      
      // Функция очистки при размонтировании компонента
      return () => {
        emblaNode.removeEventListener('wheel', handleWheel);
      };
    }
  }, [emblaApi, emblaRef]);
  
  // Обработчики переключения недель
  const goToPrevWeek = () => {
    setWeekOffset(prev => prev - 1);
  };
  
  const goToNextWeek = () => {
    setWeekOffset(prev => prev + 1);
  };
  
  // Обработчик клика по дню - обновляет выбранную дату и активный индекс
  const handleDayClick = (date: Date, index: number) => {
    // Устанавливаем индекс текущего дня при клике
    if (emblaApi) {
      // Используем scrollTo вместо запроса новых данных
      emblaApi.scrollTo(index);
      setActiveIndex(index);
    }
    
    // Обновляем выбранную дату в родительском компоненте
    // без запроса новых данных (данные уже загружены для всей недели)
    onDateChange(date);
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
      
      <div className="overflow-hidden" ref={emblaRef}>
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
                  isActive={index === activeIndex}
                  activeCardIndex={activeIndex}
                  cardIndex={index}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}