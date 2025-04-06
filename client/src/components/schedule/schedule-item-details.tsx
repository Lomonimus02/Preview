import React from "react";
import { Schedule } from "@shared/schema";
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { 
  Clock, 
  Calendar, 
  GraduationCap, 
  User, 
  MapPin,
  FileText,
  BookOpen
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface ScheduleItemDetailsProps {
  schedule: Schedule;
  className: string;
  subject: string;
  teacher: string;
}

export function ScheduleItemDetails({
  schedule,
  className,
  subject,
  teacher,
}: ScheduleItemDetailsProps) {
  // Format day of week
  const getDayOfWeek = (dayOfWeek: number) => {
    const days = [
      "Воскресенье",
      "Понедельник",
      "Вторник",
      "Среда",
      "Четверг",
      "Пятница",
      "Суббота",
    ];
    // Convert day number (1-7) to index (0-6)
    const index = dayOfWeek % 7;
    return days[index];
  };
  
  // Format specific date if available
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    
    try {
      const date = new Date(dateStr);
      return format(date, "d MMMM yyyy", { locale: ru });
    } catch (error) {
      console.error("Error formatting date:", error);
      return null;
    }
  };
  
  // Set of schedule details
  const details = [
    {
      icon: <BookOpen className="h-4 w-4 text-primary" />,
      label: "Предмет",
      value: subject,
    },
    {
      icon: <GraduationCap className="h-4 w-4 text-primary" />,
      label: "Класс",
      value: className,
    },
    {
      icon: <User className="h-4 w-4 text-primary" />,
      label: "Учитель",
      value: teacher,
    },
    {
      icon: <Clock className="h-4 w-4 text-primary" />,
      label: "Время",
      value: `${schedule.startTime} - ${schedule.endTime}`,
    },
    {
      icon: <Calendar className="h-4 w-4 text-primary" />,
      label: "День недели",
      value: getDayOfWeek(schedule.dayOfWeek),
    },
  ];
  
  // Add specific date if available
  const specificDate = formatDate(schedule.scheduleDate);
  if (specificDate) {
    details.push({
      icon: <Calendar className="h-4 w-4 text-primary" />,
      label: "Дата",
      value: specificDate,
    });
  }
  
  // Add room if available
  if (schedule.room) {
    details.push({
      icon: <MapPin className="h-4 w-4 text-primary" />,
      label: "Кабинет",
      value: schedule.room,
    });
  }
  
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          {subject}
        </DialogTitle>
        <DialogDescription className="flex flex-wrap gap-1 mt-1">
          <Badge variant="outline" className="font-normal">
            {schedule.startTime} - {schedule.endTime}
          </Badge>
          <Badge variant="outline" className="font-normal">
            {getDayOfWeek(schedule.dayOfWeek)}
          </Badge>
          {specificDate && (
            <Badge variant="outline" className="font-normal">
              {specificDate}
            </Badge>
          )}
        </DialogDescription>
      </DialogHeader>
      
      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {details.map((detail, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="mt-0.5">{detail.icon}</div>
              <div>
                <div className="text-sm text-muted-foreground">{detail.label}</div>
                <div className="font-medium">{detail.value}</div>
              </div>
            </div>
          ))}
        </div>
        
        {schedule.notes && (
          <div className="pt-3 border-t">
            <div className="flex items-start gap-2">
              <FileText className="h-4 w-4 text-primary mt-0.5" />
              <div>
                <div className="text-sm text-muted-foreground">Заметки</div>
                <div className="mt-1 text-sm">{schedule.notes}</div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <DialogFooter className="mt-6 text-xs text-muted-foreground">
        ID расписания: {schedule.id}
      </DialogFooter>
    </>
  );
}