import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Schedule, UserRoleEnum } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { ScheduleCarousel } from "@/components/schedule/schedule-carousel";
import { AdminScheduleForm } from "@/components/schedule/admin-schedule-form";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Plus, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

export default function ScheduleNew() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Current date
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // State for admin schedule form
  const [isAdminFormOpen, setIsAdminFormOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [formMode, setFormMode] = useState<"add" | "edit">("add");
  
  // Check if user is admin
  const isAdmin = user?.role === UserRoleEnum.ADMIN || user?.role === UserRoleEnum.SUPER_ADMIN;
  
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
  
  // Handle date selection
  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
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
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Расписание</h1>
          <p className="text-muted-foreground">
            Просматривайте и управляйте расписанием занятий
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center rounded-lg bg-muted px-3 py-1 text-sm">
            <CalendarDays className="mr-2 h-4 w-4 text-primary" />
            <span>
              Выбрано: {format(selectedDate, "d MMMM yyyy", { locale: ru })}
            </span>
          </div>
          
          {isAdmin && (
            <Button onClick={handleAddSchedule}>
              <Plus className="mr-2 h-4 w-4" />
              Добавить урок
            </Button>
          )}
        </div>
      </div>
      
      <div className="bg-card rounded-lg border shadow-sm p-4 mb-8">
        <ScheduleCarousel
          schedules={schedules}
          classes={classes}
          subjects={subjects}
          users={users}
          selectedDate={selectedDate}
          onDateSelect={handleDateSelect}
          onEditSchedule={isAdmin ? handleEditSchedule : undefined}
          onDeleteSchedule={isAdmin ? handleDeleteSchedule : undefined}
        />
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