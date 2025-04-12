import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Schedule, Class } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScheduleDayCard } from "@/components/schedule/schedule-day-card";
import { MainLayout } from "@/components/layout/main-layout";
import { formatDate, getDayOfWeekName } from "@/lib/date-utils";
import { Spinner } from "@/components/ui/spinner";

export default function ClassSchedulePage() {
  const { classId } = useParams();
  const { user } = useAuth();
  const { isSchoolAdmin } = useRoleCheck();
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Устанавливаем начало недели на понедельник
  useEffect(() => {
    const date = new Date();
    
    // Определяем день недели (0 - воскресенье, 1 - понедельник, и т.д.)
    const dayOfWeek = date.getDay();
    
    // Если сегодня не понедельник, находим ближайший прошедший понедельник
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Для воскресенья (0) нужно вернуться на 6 дней назад
    
    date.setDate(date.getDate() + diff);
    setCurrentDate(date);
  }, []);

  // Функции для навигации по неделям
  const goToPrevWeek = () => {
    const prevWeek = new Date(currentDate);
    prevWeek.setDate(prevWeek.getDate() - 7);
    setCurrentDate(prevWeek);
  };

  const goToNextWeek = () => {
    const nextWeek = new Date(currentDate);
    nextWeek.setDate(nextWeek.getDate() + 7);
    setCurrentDate(nextWeek);
  };

  const goToCurrentWeek = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    today.setDate(today.getDate() + diff);
    setCurrentDate(today);
  };

  // Загружаем информацию о классе
  const { data: classInfo, isLoading: classLoading } = useQuery<Class>({
    queryKey: ["/api/classes", classId],
    queryFn: async () => {
      const res = await apiRequest(`/api/classes/${classId}`, "GET");
      if (!res.ok) throw new Error("Не удалось загрузить информацию о классе");
      return res.json();
    },
    enabled: !!classId && isSchoolAdmin()
  });

  // Загружаем расписание для конкретного класса
  const { data: schedules = [], isLoading: schedulesLoading } = useQuery<Schedule[]>({
    queryKey: ["/api/schedules", { classId }],
    queryFn: async () => {
      const res = await apiRequest(`/api/schedules?classId=${classId}`, "GET");
      if (!res.ok) throw new Error("Не удалось загрузить расписание класса");
      return res.json();
    },
    enabled: !!classId && isSchoolAdmin(),
    refetchInterval: 60000 // Обновляем каждую минуту
  });

  // Создаем массив дат для текущей недели
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + i);
    return date;
  });

  // Группируем расписание по дням недели
  const scheduleByDay = weekDates.map(date => {
    const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay(); // Преобразуем 0 (воскресенье) в 7
    const formattedDate = formatDate(date);
    
    // Фильтруем занятия для этого дня недели
    const daySchedules = schedules.filter(schedule => {
      const scheduleDayOfWeek = schedule.dayOfWeek;
      return scheduleDayOfWeek === dayOfWeek;
    });
    
    // Сортируем занятия по времени начала
    daySchedules.sort((a, b) => {
      return a.startTime.localeCompare(b.startTime);
    });
    
    return {
      date,
      formattedDate,
      dayName: getDayOfWeekName(dayOfWeek),
      schedules: daySchedules
    };
  });

  const isLoading = classLoading || schedulesLoading;

  return (
    <MainLayout>
      <div className="container px-4 py-8 mx-auto">
        <div className="flex flex-col space-y-6">
          {/* Заголовок и навигация */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold mb-1">
                Расписание {classLoading ? "класса" : `класса ${classInfo?.name}`}
              </h1>
              <p className="text-muted-foreground">
                Неделя: {formatDate(weekDates[0])} - {formatDate(weekDates[6])}
              </p>
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPrevWeek}
                className="h-8 px-2"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={goToCurrentWeek}
                className="h-8"
              >
                Текущая неделя
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={goToNextWeek}
                className="h-8 px-2"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Spinner size="lg" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {scheduleByDay.map(day => (
                <Card key={day.formattedDate} className="overflow-hidden">
                  <CardHeader className="pb-2 pt-4 bg-muted">
                    <CardTitle className="text-center text-base">
                      <div className="font-medium">{day.dayName}</div>
                      <div className="text-sm text-muted-foreground mt-1">{day.formattedDate}</div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3">
                    {day.schedules.length === 0 ? (
                      <div className="text-center text-muted-foreground py-3">
                        <CalendarIcon className="w-6 h-6 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Нет занятий</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {day.schedules.map(schedule => (
                          <ScheduleDayCard
                            key={schedule.id}
                            schedule={schedule}
                            isTeacher={false}
                            variant="vertical"
                          />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}