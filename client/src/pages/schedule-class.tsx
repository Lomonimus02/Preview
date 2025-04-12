import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Schedule, Class, Subject, User } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarIcon, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScheduleDayCard } from "@/components/schedule/schedule-day-card";
import { MainLayout } from "@/components/layout/main-layout";
import { formatDate, getDayOfWeekName, getMonday, getWeekDates } from "@/lib/date-utils";
import { Spinner } from "@/components/ui/spinner";
import { AddScheduleDialog } from "@/components/schedule/add-schedule-dialog";

export default function ClassSchedulePage() {
  const { classId } = useParams<{ classId: string }>();
  const { user } = useAuth();
  const { isSchoolAdmin } = useRoleCheck();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  
  // Устанавливаем начало недели на понедельник при первой загрузке
  useEffect(() => {
    const monday = getMonday(new Date());
    setCurrentDate(monday);
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
    const monday = getMonday(new Date());
    setCurrentDate(monday);
  };

  // Загружаем информацию о классе
  const { data: classInfo, isLoading: classLoading } = useQuery<Class>({
    queryKey: [`/api/classes/${classId}`],
    enabled: !!classId
  });

  // Загружаем расписание для класса
  const { data: schedules = [], isLoading: schedulesLoading, refetch: refetchSchedules } = useQuery<Schedule[]>({
    queryKey: ["/api/schedules", { classId: parseInt(classId as string) }],
    enabled: !!classId,
    refetchInterval: 60000 // Обновляем каждую минуту
  });

  // Загружаем предметы
  const { data: subjects = [], isLoading: subjectsLoading } = useQuery<Subject[]>({
    queryKey: ["/api/subjects"],
    enabled: !!classId
  });

  // Загружаем учителей
  const { data: teachers = [], isLoading: teachersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: !!classId
  });
  
  // Загружаем подгруппы класса
  const { data: subgroups = [], isLoading: subgroupsLoading } = useQuery({
    queryKey: ["/api/subgroups", { classId: parseInt(classId as string) }],
    enabled: !!classId
  });

  // Создаем массив дат для текущей недели
  const weekDates = getWeekDates(currentDate);

  // Группируем расписание по дням недели
  const scheduleByDay = weekDates.map((date) => {
    const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay(); // Преобразуем 0 (воскресенье) в 7
    const formattedDate = formatDate(date);
    
    // Фильтруем занятия для этого дня недели и класса
    const daySchedules = schedules.filter(schedule => {
      const scheduleDayOfWeek = schedule.dayOfWeek;
      return scheduleDayOfWeek === dayOfWeek && schedule.classId === parseInt(classId as string);
    });
    
    // Сортируем занятия по времени начала
    daySchedules.sort((a, b) => a.startTime.localeCompare(b.startTime));
    
    return {
      date,
      formattedDate,
      dayName: getDayOfWeekName(dayOfWeek),
      schedules: daySchedules
    };
  });

  const isLoading = classLoading || schedulesLoading || subjectsLoading || teachersLoading || subgroupsLoading;

  const handleAddSchedule = (date: Date) => {
    setSelectedDate(date);
    setIsScheduleDialogOpen(true);
  };

  const onScheduleSuccess = () => {
    refetchSchedules();
    setIsScheduleDialogOpen(false);
  };

  return (
    <MainLayout>
      <div className="container px-4 py-8 mx-auto">
        <div className="flex flex-col space-y-6">
          {/* Заголовок и навигация */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold mb-1">
                Расписание: {classInfo?.name || ''}
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
              {scheduleByDay.map((day) => (
                <Card key={day.formattedDate} className="overflow-hidden">
                  <CardHeader className="pb-2 pt-4 bg-muted flex flex-row justify-between items-center">
                    <CardTitle className="text-center text-base">
                      <div className="font-medium">{day.dayName}</div>
                      <div className="text-sm text-muted-foreground mt-1">{day.formattedDate}</div>
                    </CardTitle>
                    {isSchoolAdmin() && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="px-1.5 h-7"
                        onClick={() => handleAddSchedule(day.date)}
                      >
                        <CalendarIcon className="h-4 w-4" />
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="p-3">
                    {day.schedules.length === 0 ? (
                      <div className="text-center text-muted-foreground py-3">
                        <CalendarIcon className="w-6 h-6 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Нет занятий</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {day.schedules.map((schedule) => {
                          // Добавляем подгруппы к каждому расписанию для отображения названий подгрупп
                          const scheduleWithSubgroups = {
                            ...schedule,
                            subgroups
                          };
                          
                          return (
                            <ScheduleDayCard
                              key={schedule.id}
                              schedule={scheduleWithSubgroups}
                              isTeacher={false}
                              variant="vertical"
                              subjects={subjects}
                              teachers={teachers}
                            />
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Диалог добавления урока */}
      {isScheduleDialogOpen && selectedDate && (
        <AddScheduleDialog
          isOpen={isScheduleDialogOpen}
          onClose={() => setIsScheduleDialogOpen(false)}
          selectedDate={selectedDate}
          classId={parseInt(classId as string)}
          subjects={subjects}
          teachers={teachers}
          onSuccess={onScheduleSuccess}
        />
      )}
    </MainLayout>
  );
}