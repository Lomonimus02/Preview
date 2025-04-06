import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Schedule, Class, Subject, User, UserRoleEnum } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { ScheduleCard } from "@/components/schedule/schedule-card";
import { AdminScheduleForm } from "@/components/schedule/admin-schedule-form";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addDays, isSameDay, startOfWeek } from "date-fns";
import { ru } from "date-fns/locale";
import { useMediaQuery } from "@/hooks/use-media-query";

export default function ScheduleNew() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Адаптивное количество отображаемых дней в зависимости от размера экрана
  const isLargeDesktop = useMediaQuery("(min-width: 1536px)");
  const isDesktop = useMediaQuery("(min-width: 1280px)");
  const isTablet = useMediaQuery("(min-width: 768px)");
  const isMobile = useMediaQuery("(min-width: 480px)");
  
  // Количество видимых дней
  const visibleDays = isLargeDesktop ? 4 : isDesktop ? 3 : isTablet ? 2 : 1;
  
  // Current date
  const today = new Date();
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    // Устанавливаем начало недели на понедельник
    return startOfWeek(today, { weekStartsOn: 1 });
  });
  
  // State для отслеживания скролла
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [startX, setStartX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const dragThreshold = 50; // Минимальное расстояние для свайпа
  
  // State for admin schedule form
  const [isAdminFormOpen, setIsAdminFormOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  
  // Check if user is admin
  const isAdmin = user?.role === "school_admin" || user?.role === "super_admin";
  
  // Get schedules, classes, subjects, and users data
  const { data: schedules = [], isLoading: isLoadingSchedules } = useQuery<Schedule[]>({
    queryKey: ["/api/schedules"],
  });
  
  const { data: classes = [] } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
  });
  
  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ["/api/subjects"],
  });
  
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isAdmin, // Only fetch users if admin
  });
  
  // Navigate to previous week
  const navigateToPreviousWeek = () => {
    setCurrentWeekStart(prevWeekStart => {
      // Вычитаем 7 дней из текущего начала недели
      return addDays(prevWeekStart, -7);
    });
    // Сбрасываем индекс для корректного отображения
    setCurrentIndex(0);
  };
  
  // Navigate to next week
  const navigateToNextWeek = () => {
    setCurrentWeekStart(prevWeekStart => {
      // Добавляем 7 дней к текущему началу недели
      return addDays(prevWeekStart, 7);
    });
    // Сбрасываем индекс для корректного отображения
    setCurrentIndex(0);
  };
  
  // Навигация влево/вправо по дням
  const navigateDays = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    } else if (direction === 'next' && currentIndex < weekDays.length - visibleDays) {
      setCurrentIndex(prev => prev + 1);
    } else if (direction === 'prev' && currentIndex === 0) {
      // Если мы в начале и двигаемся назад, переходим на предыдущую неделю
      navigateToPreviousWeek();
    } else if (direction === 'next' && currentIndex >= weekDays.length - visibleDays) {
      // Если мы в конце и двигаемся вперед, переходим на следующую неделю
      navigateToNextWeek();
    }
  };
  
  // Обработчики событий для мультискролла
  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setIsDragging(true);
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    
    const currentX = e.touches[0].clientX;
    const diff = startX - currentX;
    
    if (Math.abs(diff) > dragThreshold) {
      if (diff > 0) {
        navigateDays('next');
      } else {
        navigateDays('prev');
      }
      setIsDragging(false);
    }
  };
  
  const handleTouchEnd = () => {
    setIsDragging(false);
  };
  
  const handleMouseDown = (e: React.MouseEvent) => {
    setStartX(e.clientX);
    setIsDragging(true);
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const currentX = e.clientX;
    const diff = startX - currentX;
    
    if (Math.abs(diff) > dragThreshold) {
      if (diff > 0) {
        navigateDays('next');
      } else {
        navigateDays('prev');
      }
      setIsDragging(false);
    }
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  // Обработчик колесика мыши для прокрутки
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        // Вертикальная прокрутка - позволим странице обрабатывать её обычным образом
        return;
      }
      
      e.preventDefault();
      if (e.deltaX > 50) {
        navigateDays('next');
      } else if (e.deltaX < -50) {
        navigateDays('prev');
      }
    };
    
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }
    
    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, [currentIndex]);
  
  // Handle add schedule
  const handleAddSchedule = () => {
    setSelectedSchedule(null);
    setFormMode("add");
    setIsAdminFormOpen(true);
  };
  
  // Handle edit schedule
  const handleEditSchedule = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setFormMode("edit");
    setIsAdminFormOpen(true);
  };
  
  // Delete schedule mutation
  const deleteMutation = useMutation({
    mutationFn: async (scheduleId: number) => {
      const res = await apiRequest("DELETE", `/api/schedules/${scheduleId}`);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Расписание удалено",
        description: "Урок был успешно удален из расписания",
      });
      
      // Invalidate schedules query to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
    },
    onError: (error) => {
      console.error("Error deleting schedule:", error);
      toast({
        title: "Ошибка",
        description: "Произошла ошибка при удалении урока. Пожалуйста, попробуйте еще раз.",
        variant: "destructive",
      });
    },
  });
  
  // Handle delete schedule
  const handleDeleteSchedule = (scheduleId: number) => {
    if (window.confirm("Вы уверены, что хотите удалить этот урок из расписания?")) {
      deleteMutation.mutate(scheduleId);
    }
  };
  
  // Filter teachers for admin form
  const teachers = isAdmin 
    ? users.filter((u: User) => u.role === "teacher" || u.activeRole === "teacher")
    : [];
    
  // Get user's classes based on role
  const userClasses = isAdmin 
    ? classes 
    : schedules.filter(schedule => schedule.teacherId === user?.id).map(schedule => schedule.classId);
  
  // Генерируем мок-данные для дней, где нет расписания
  const generateDemoSchedulesForDay = (dayOfWeek: number): Schedule[] => {
    // Базовые предметы из изображения с их временем
    const subjectTemplates = [
      { name: "Математика", startTime: "08:30", endTime: "09:15", room: "100", teacherId: 1 },
      { name: "Русский язык", startTime: "09:25", endTime: "10:10", room: "101", teacherId: 2 },
      { name: "Физика", startTime: "10:20", endTime: "11:05", room: "102", teacherId: 3 },
      { name: "Химия", startTime: "11:15", endTime: "12:00", room: "103", teacherId: 4 },
      { name: "Биология", startTime: "12:10", endTime: "12:55", room: "104", teacherId: 5 },
      { name: "История", startTime: "13:05", endTime: "13:50", room: "105", teacherId: 6 },
      { name: "География", startTime: "14:00", endTime: "14:45", room: "106", teacherId: 7 },
      { name: "Английский язык", startTime: "14:55", endTime: "15:40", room: "107", teacherId: 8 },
      { name: "Литература", startTime: "15:50", endTime: "16:35", room: "108", teacherId: 9 }
    ];
    
    // Получаем идентификаторы предметов из базы данных или используем запасные значения
    const getSubjectIdByName = (name: string): number => {
      const subject = subjects.find(s => s.name === name);
      return subject ? subject.id : 1;
    };
    
    // Получаем класс (используем первый доступный, если есть)
    const classId = classes.length > 0 ? classes[0].id : 1;
    
    // Генерируем расписание для указанного дня недели
    // Адаптируем количество уроков: будем использовать от 7 до 9 уроков в зависимости от дня
    const lessonsCount = 9 - ((dayOfWeek % 3) % 2); // 9, 8 или 7 уроков
    
    // Создаем уроки для дня
    return subjectTemplates.slice(0, lessonsCount).map((template, index) => {
      // Добавляем уникальные суффиксы для разных дней
      const daySuffix = String.fromCharCode(65 + ((dayOfWeek - 1) % 3));
      
      return {
        id: 1000 + dayOfWeek * 100 + index, // Генерируем уникальные ID для мок-данных
        classId: classId,
        subjectId: getSubjectIdByName(template.name),
        teacherId: template.teacherId,
        dayOfWeek: dayOfWeek,
        startTime: template.startTime,
        endTime: template.endTime,
        room: template.room,
        notes: "", // Пустые заметки
        scheduleDate: null // Нет конкретной даты, только день недели
      };
    });
  };
  
  // Фильтрация расписаний для конкретной даты
  const getSchedulesForDate = (date: Date) => {
    const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay(); // Воскресенье (0) преобразуем в 7
    
    // Сначала ищем реальные расписания для этой даты
    const realSchedules = schedules.filter(schedule => {
      // Проверяем, является ли это расписанием для конкретной даты
      if (schedule.scheduleDate) {
        const scheduleDate = new Date(schedule.scheduleDate);
        return isSameDay(scheduleDate, date);
      }
      
      // Иначе проверяем день недели
      return schedule.dayOfWeek === dayOfWeek;
    });
    
    // Если нет реальных данных, генерируем демо-данные для примера
    if (realSchedules.length === 0) {
      return generateDemoSchedulesForDay(dayOfWeek);
    }
    
    return realSchedules;
  };
  
  // Получение всех дней недели для отображения
  const weekDays = [
    {
      day: "Понедельник",
      date: addDays(currentWeekStart, 0),
      isCurrentDay: isSameDay(addDays(currentWeekStart, 0), today)
    },
    {
      day: "Вторник",
      date: addDays(currentWeekStart, 1),
      isCurrentDay: isSameDay(addDays(currentWeekStart, 1), today)
    },
    {
      day: "Среда",
      date: addDays(currentWeekStart, 2),
      isCurrentDay: isSameDay(addDays(currentWeekStart, 2), today)
    },
    {
      day: "Четверг",
      date: addDays(currentWeekStart, 3),
      isCurrentDay: isSameDay(addDays(currentWeekStart, 3), today)
    },
    {
      day: "Пятница",
      date: addDays(currentWeekStart, 4),
      isCurrentDay: isSameDay(addDays(currentWeekStart, 4), today)
    },
    {
      day: "Суббота",
      date: addDays(currentWeekStart, 5),
      isCurrentDay: isSameDay(addDays(currentWeekStart, 5), today)
    },
    {
      day: "Воскресенье",
      date: addDays(currentWeekStart, 6),
      isCurrentDay: isSameDay(addDays(currentWeekStart, 6), today)
    }
  ];
  
  // Render loading state
  if (isLoadingSchedules) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-12 w-12 rounded-full bg-muted"></div>
          <div className="mt-4 h-4 w-32 bg-muted rounded"></div>
          <div className="mt-2 h-3 w-24 bg-muted rounded"></div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container max-w-7xl mx-auto py-6">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-4 md:mb-0">Расписание</h1>
        
        <div className="flex items-center gap-2 self-end">
          <Button 
            variant="outline" 
            className="text-sm px-3 h-9"
            onClick={navigateToPreviousWeek}
          >
            Предыдущая неделя
          </Button>
          <Button 
            variant="outline" 
            className="text-sm px-3 h-9"
            onClick={navigateToNextWeek}
          >
            Следующая неделя
          </Button>
        </div>
      </div>
      
      <div className="relative mb-4">
        {/* Кнопки навигации влево/вправо */}
        <Button
          variant="outline"
          size="icon"
          className="absolute -left-3 md:-left-5 top-1/2 transform -translate-y-1/2 h-8 w-8 hidden md:flex z-10 rounded-full bg-white/80 backdrop-blur-sm border-gray-200 shadow-sm"
          onClick={() => navigateDays('prev')}
          disabled={currentIndex === 0 && currentWeekStart <= today}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        {/* Контейнер для мультискролла */}
        <div
          ref={scrollContainerRef}
          className="overflow-hidden pb-4 schedule-container"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div 
            className="flex transition-transform duration-300 ease-in-out gap-4"
            style={{
              transform: `translateX(-${currentIndex * (100 / visibleDays)}%)`,
              width: `${100 * (weekDays.length / visibleDays)}%`
            }}
          >
            {weekDays.map((weekDay) => {
              const daySchedules = getSchedulesForDate(weekDay.date);
              const formattedDate = format(weekDay.date, "dd.MM", { locale: ru });
              
              return (
                <div 
                  key={weekDay.day} 
                  className="flex-shrink-0 schedule-slide px-1"
                  style={{ width: `${100 / weekDays.length * visibleDays}%` }}
                >
                  <ScheduleCard
                    date={weekDay.date}
                    dayName={weekDay.day}
                    schedules={daySchedules}
                    classes={classes}
                    subjects={subjects}
                    users={users}
                    isCurrentDate={weekDay.isCurrentDay}
                    onEditSchedule={isAdmin ? handleEditSchedule : undefined}
                    onDeleteSchedule={isAdmin ? handleDeleteSchedule : undefined}
                  />
                </div>
              );
            })}
          </div>
        </div>
        
        <Button
          variant="outline"
          size="icon"
          className="absolute -right-3 md:-right-5 top-1/2 transform -translate-y-1/2 h-8 w-8 hidden md:flex z-10 rounded-full bg-white/80 backdrop-blur-sm border-gray-200 shadow-sm"
          onClick={() => navigateDays('next')}
          disabled={currentIndex >= weekDays.length - visibleDays}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Индикаторы текущей позиции */}
      <div className="flex justify-center gap-1 mt-2 mb-6">
        {weekDays.map((weekDay, index) => (
          <button
            key={index}
            className={`h-1.5 rounded-full transition-all ${
              index >= currentIndex && index < currentIndex + visibleDays
                ? weekDay.isCurrentDay
                  ? "w-5 bg-[#4CAF50]"
                  : "w-2.5 bg-[#4CAF50]/60"
                : "w-2.5 bg-gray-200"
            }`}
            onClick={() => setCurrentIndex(Math.min(index, weekDays.length - visibleDays))}
            title={format(weekDay.date, "d MMMM", { locale: ru })}
          />
        ))}
      </div>
      
      {/* Мобильные кнопки навигации */}
      <div className="flex justify-between md:hidden px-2 mb-8">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 rounded-full"
          onClick={() => navigateDays('prev')}
          disabled={currentIndex === 0 && currentWeekStart <= today}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 rounded-full"
          onClick={() => navigateDays('next')}
          disabled={currentIndex >= weekDays.length - visibleDays}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      
      {isAdmin && (
        <AdminScheduleForm
          isOpen={isAdminFormOpen}
          onClose={() => setIsAdminFormOpen(false)}
          classes={classes}
          subjects={subjects}
          teachers={teachers}
          selectedSchedule={selectedSchedule}
          mode={formMode}
        />
      )}
    </div>
  );
}