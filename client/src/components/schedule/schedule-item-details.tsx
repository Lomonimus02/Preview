import React from "react";
import { Schedule } from "@shared/schema";
import { Clock, BookOpen, UserCircle, CalendarDays, Home } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
  // Get day of week name
  const getDayOfWeekName = (dayOfWeek: number) => {
    const days = [
      "Понедельник",
      "Вторник",
      "Среда",
      "Четверг",
      "Пятница",
      "Суббота",
      "Воскресенье",
    ];
    return days[dayOfWeek - 1];
  };

  // Format date
  const formatDate = (date: string) => {
    return format(new Date(date), "d MMMM yyyy", { locale: ru });
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Предмет</span>
              </div>
              <p>{subject}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <UserCircle className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Учитель</span>
              </div>
              <p>{teacher}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Класс</span>
              </div>
              <p>{className}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Время</span>
              </div>
              <p>
                {schedule.startTime} - {schedule.endTime}
              </p>
            </div>
          </CardContent>
        </Card>

        {schedule.room && (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Home className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Кабинет</span>
                </div>
                <p>{schedule.room}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">День недели</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {getDayOfWeekName(schedule.dayOfWeek)}
                </Badge>
                {schedule.scheduleDate && (
                  <Badge variant="secondary">
                    {formatDate(schedule.scheduleDate)}
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {schedule.notes && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Заметки</span>
              </div>
              <p className="text-sm text-muted-foreground">{schedule.notes}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}