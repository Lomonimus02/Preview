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
  const isDesktop = useMediaQuery("(min-width: 1200px)");
  const isTablet = useMediaQuery("(min-width: 768px)");
  const isMobile = useMediaQuery("(min-width: 480px)");
  
  // Количество видимых дней
  const visibleDays = isDesktop ? 5 : isTablet ? 3 : 1;
  
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Расписание</h1>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={navigateToPreviousWeek}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Предыдущая неделя
          </Button>
          <Button variant="outline" onClick={navigateToNextWeek}>
            Следующая неделя
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
      
      <div className="relative mb-8">
        {/* Кнопки навигации влево/вправо */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute -left-4 top-1/2 transform -translate-y-1/2 h-8 w-8 hidden md:flex z-10"
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
              
              return (
                <div 
                  key={weekDay.day} 
                  className="flex-shrink-0 schedule-slide"
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
          variant="ghost"
          size="icon"
          className="absolute -right-4 top-1/2 transform -translate-y-1/2 h-8 w-8 hidden md:flex z-10"
          onClick={() => navigateDays('next')}
          disabled={currentIndex >= weekDays.length - visibleDays}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Индикаторы текущей позиции */}
      <div className="flex justify-center gap-1 mt-2 mb-8">
        {weekDays.map((weekDay, index) => (
          <button
            key={index}
            className={`h-2 rounded-full transition-all ${
              index >= currentIndex && index < currentIndex + visibleDays
                ? weekDay.isCurrentDay
                  ? "w-6 bg-primary"
                  : "w-3 bg-primary/60"
                : "w-3 bg-muted"
            }`}
            onClick={() => setCurrentIndex(Math.min(index, weekDays.length - visibleDays))}
            title={format(weekDay.date, "d MMMM", { locale: ru })}
          />
        ))}
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