import React, { useState } from "react";
import { Schedule, Class, Subject, User } from "@shared/schema";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { ScheduleItemDetails } from "./schedule-item-details";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScheduleCardProps {
  date: Date;
  dayName: string;
  schedules: Schedule[];
  classes: Class[];
  subjects: Subject[];
  users: User[];
  isCurrentDate?: boolean;
  onEditSchedule?: (schedule: Schedule) => void;
  onDeleteSchedule?: (scheduleId: number) => void;
}

export function ScheduleCard({
  date,
  dayName,
  schedules,
  classes,
  subjects,
  users,
  isCurrentDate = false,
  onEditSchedule,
  onDeleteSchedule,
}: ScheduleCardProps) {
  const { user } = useAuth();
  // Проверяем роль пользователя
  const isAdmin = user?.role === "school_admin" || user?.role === "super_admin";
  
  // State for selected schedule (for details dialog)
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Sort schedules by start time
  const sortedSchedules = [...schedules].sort((a, b) => {
    return a.startTime.localeCompare(b.startTime);
  });
  
  // Get class name for a schedule
  const getClassName = (classId: number): string => {
    const cls = classes.find((c) => c.id === classId);
    return cls ? cls.name : "Unknown";
  };
  
  // Get subject name for a schedule
  const getSubjectName = (subjectId: number): string => {
    const subject = subjects.find((s) => s.id === subjectId);
    return subject ? subject.name : "Unknown";
  };
  
  // Get teacher name for a schedule
  const getTeacherName = (teacherId: number): string => {
    const teacher = users.find((u) => u.id === teacherId);
    if (!teacher) return "Unknown";
    return `Учитель ${teacher.id}`;
  };
  
  // Handle edit schedule
  const handleEditSchedule = (schedule: Schedule) => {
    if (onEditSchedule) {
      onEditSchedule(schedule);
    }
  };
  
  // Show schedule details in dialog
  const showScheduleDetails = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setDialogOpen(true);
  };
  
  // Helper function to check if a time is current
  const isCurrentTime = (start: string, end: string): boolean => {
    if (!isCurrentDate) return false;
    
    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    
    const [startHours, startMinutes] = start.split(":").map(Number);
    const [endHours, endMinutes] = end.split(":").map(Number);
    
    const currentTimeMinutes = currentHours * 60 + currentMinutes;
    const startTimeMinutes = startHours * 60 + startMinutes;
    const endTimeMinutes = endHours * 60 + endMinutes;
    
    return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes;
  };
  
  // Render date in card header
  const renderDate = () => {
    return format(date, "dd.MM", { locale: ru });
  };
  
  // Get class letter for a subject
  const getClassLetter = () => {
    // Произвольная буква, можно изменить на более осмысленную логику
    return isCurrentDate ? "C" : date.getDay() % 2 === 0 ? "В" : "П";
  };
  
  return (
    <Card className={cn(
      "h-full w-full min-w-[270px] overflow-hidden",
      isCurrentDate ? "bg-[#4CAF50] text-white" : "bg-white shadow-sm"
    )}>
      <CardHeader className="py-4 px-4 text-center">
        <CardTitle className="flex flex-col items-center justify-center">
          <span className="text-lg font-medium">{dayName}</span>
          <span className={cn(
            "text-sm", 
            isCurrentDate ? "text-white/80" : "text-muted-foreground"
          )}>
            {format(date, "dd.MM", { locale: ru })}
          </span>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-0 h-full overflow-y-auto max-h-[550px]">
        {sortedSchedules.length === 0 ? (
          <div className={cn(
            "text-center py-8",
            isCurrentDate ? "text-white/80" : "text-muted-foreground"
          )}>
            <p>Нет занятий в этот день</p>
          </div>
        ) : (
          <div>
            <div className={cn(
              "px-4 py-2 text-sm border-t border-b",
              isCurrentDate ? "text-white/80 border-white/20" : "text-muted-foreground border-gray-100"
            )}>
              {sortedSchedules.length} уроков
            </div>
            <div className="space-y-0">
              {sortedSchedules.map((schedule, index) => {
                // Определяем класс фона для полос (чередование)
                const isEvenRow = index % 2 === 0;
                const bgColorClass = isCurrentDate 
                  ? isEvenRow ? "bg-[#4CAF50]" : "bg-[#4CAF50]/90"
                  : isEvenRow ? "bg-white" : "bg-[#f9f9f9]";
                
                // Определяем иконку кнопки (чек или плюс)
                const isCompleted = index % 3 === 1; // Условная логика
                
                return (
                  <div 
                    key={schedule.id}
                    className={cn(
                      bgColorClass,
                      "group py-2 px-3 border-b last:border-b-0 schedule-item hover:bg-opacity-95 transition-colors",
                      isCurrentDate ? "border-white/10" : "border-gray-100"
                    )}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {schedule.startTime} - {schedule.endTime}
                        </div>
                        <div className={cn(
                          "text-base font-semibold mt-0.5",
                          isCurrentDate ? "" : "text-slate-800"
                        )}>
                          {getSubjectName(schedule.subjectId)} {getClassLetter()}
                        </div>
                        <div className={cn(
                          "text-xs mt-1",
                          isCurrentDate ? "text-white/70" : "text-slate-500"
                        )}>
                          Кабинет: {schedule.room || 100} | {getTeacherName(schedule.teacherId)}
                        </div>
                      </div>
                      
                      <Button
                        variant={isCurrentDate ? "ghost" : "outline"}
                        size="icon"
                        className={cn(
                          "h-6 w-6 rounded-full",
                          isCurrentDate 
                            ? isCompleted ? "bg-white text-green-600" : "bg-white/20 hover:bg-white/30 text-white" 
                            : isCompleted ? "bg-[#4CAF50] text-white" : "bg-white border-gray-200"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditSchedule(schedule);
                        }}
                      >
                        {isCompleted ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                    
                    <Dialog open={dialogOpen && selectedSchedule?.id === schedule.id} onOpenChange={setDialogOpen}>
                      <DialogTrigger asChild>
                        <span className="hidden">Детали</span>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[600px]">
                        <ScheduleItemDetails
                          schedule={schedule}
                          className={getClassName(schedule.classId)}
                          subject={getSubjectName(schedule.subjectId)}
                          teacher={getTeacherName(schedule.teacherId)}
                        />
                      </DialogContent>
                    </Dialog>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}