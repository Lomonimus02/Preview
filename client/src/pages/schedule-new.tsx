import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Schedule } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { ScheduleCard } from "@/components/schedule/schedule-card";
import { AdminScheduleForm } from "@/components/schedule/admin-schedule-form";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addDays, isSameDay, startOfWeek } from "date-fns";
import { ru } from "date-fns/locale";

export default function ScheduleNew() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Current date
  const today = new Date();
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    // Устанавливаем начало недели на понедельник
    return startOfWeek(today, { weekStartsOn: 1 });
  });
  
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
  
  const { data: classes = [] } = useQuery({
    queryKey: ["/api/classes"],
  });
  
  const { data: subjects = [] } = useQuery({
    queryKey: ["/api/subjects"],
  });
  
  const { data: users = [] } = useQuery({
    queryKey: ["/api/users"],
    enabled: isAdmin, // Only fetch users if admin
  });
  
  // Navigate to previous week
  const navigateToPreviousWeek = () => {
    setCurrentWeekStart(prevWeekStart => {
      // Вычитаем 7 дней из текущего начала недели
      return addDays(prevWeekStart, -7);
    });
  };
  
  // Navigate to next week
  const navigateToNextWeek = () => {
    setCurrentWeekStart(prevWeekStart => {
      // Добавляем 7 дней к текущему началу недели
      return addDays(prevWeekStart, 7);
    });
  };
  
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
    ? users.filter(u => u.role === "teacher" || u.activeRole === "teacher")
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
  
  // Получение дней недели (Пн, Вт, Ср) для отображения
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
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {weekDays.map((weekDay) => {
          const daySchedules = getSchedulesForDate(weekDay.date);
          
          return (
            <div key={weekDay.day} className="h-full">
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