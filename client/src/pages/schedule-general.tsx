import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Schedule, Class, Subject, User } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarIcon, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScheduleDayCard } from "@/components/schedule/schedule-day-card";
import { MainLayout } from "@/components/layout/main-layout";
import { formatDate, getDayOfWeekName } from "@/lib/date-utils";
import { Spinner } from "@/components/ui/spinner";
import { AddScheduleDialog } from "@/components/schedule/add-schedule-dialog";

export default function GeneralSchedulePage() {
  const { user } = useAuth();
  const { isSchoolAdmin } = useRoleCheck();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedClass, setSelectedClass] = useState<number | null>(null);
  const [isAddScheduleDialogOpen, setIsAddScheduleDialogOpen] = useState(false);
  
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

  // Загружаем список школ
  const { data: schools = [], isLoading: schoolsLoading } = useQuery({
    queryKey: ["/api/schools"],
    enabled: isSchoolAdmin()
  });

  // Находим ID школы для текущего пользователя
  const getSchoolId = () => {
    if (user?.schoolId) {
      return user.schoolId;
    }
    
    // Если ID школы не найден в профиле и есть доступные школы,
    // используем первую доступную школу
    if (schools && schools.length > 0) {
      console.log("Используем первую доступную школу:", schools[0].id, schools[0].name);
      return schools[0].id;
    }
    
    return null;
  };

  const schoolId = getSchoolId();

  // Загружаем расписание для всех классов школы
  const { data: schedules = [], isLoading: schedulesLoading } = useQuery<Schedule[]>({
    queryKey: ["/api/schedules"],
    enabled: isSchoolAdmin() && !!schoolId,
    refetchInterval: 60000 // Обновляем каждую минуту
  });

  // Загружаем классы для отображения информации
  const { data: classes = [], isLoading: classesLoading } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
    enabled: isSchoolAdmin() && !!schoolId
  });
  
  // Загружаем учителей
  const { data: teachers = [], isLoading: teachersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isSchoolAdmin() && !!schoolId
  });
  
  // Загружаем предметы
  const { data: subjects = [], isLoading: subjectsLoading } = useQuery<Subject[]>({
    queryKey: ["/api/subjects"],
    enabled: isSchoolAdmin() && !!schoolId
  });
  
  // Обработчик открытия диалога добавления занятия
  const handleAddSchedule = (date: Date, classId?: number) => {
    setSelectedDate(date);
    setSelectedClass(classId || null);
    setIsAddScheduleDialogOpen(true);
  };
  
  // Обработчик успешного добавления расписания
  const handleScheduleSuccess = () => {
    setIsAddScheduleDialogOpen(false);
  };

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

  const isLoading = schoolsLoading || schedulesLoading || classesLoading || teachersLoading || subjectsLoading;

  // Вспомогательная функция для получения информации о классе
  const getClassInfo = (classId: number) => {
    return classes.find(c => c.id === classId);
  };

  return (
    <MainLayout>
      <div className="container px-4 py-8 mx-auto">
        <div className="flex flex-col space-y-6">
          {/* Заголовок и навигация */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold mb-1">
                Общее расписание
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
                  <CardHeader className="pb-2 pt-4 bg-muted flex flex-row justify-between items-center">
                    <CardTitle className="text-center text-base">
                      <div className="font-medium">{day.dayName}</div>
                      <div className="text-sm text-muted-foreground mt-1">{day.formattedDate}</div>
                    </CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="px-1.5 h-7"
                      onClick={() => handleAddSchedule(day.date)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent className="p-3">
                    {day.schedules.length === 0 ? (
                      <div className="text-center text-muted-foreground py-3">
                        <CalendarIcon className="w-6 h-6 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Нет занятий</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {day.schedules.map(schedule => {
                          const classInfo = getClassInfo(schedule.classId);
                          return (
                            <ScheduleDayCard
                              key={schedule.id}
                              schedule={schedule}
                              isTeacher={false}
                              variant="vertical"
                              showClassInfo={true}
                              classInfo={classInfo}
                              teachers={teachers}
                              subjects={subjects}
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
      {/* Диалог добавления расписания */}
      {isAddScheduleDialogOpen && selectedDate && (
        <AddScheduleDialog
          isOpen={isAddScheduleDialogOpen}
          onClose={() => setIsAddScheduleDialogOpen(false)}
          selectedDate={selectedDate}
          classId={selectedClass || (classes.length > 0 ? classes[0].id : 0)}
          subjects={subjects}
          teachers={teachers}
          onSuccess={handleScheduleSuccess}
        />
      )}
    </MainLayout>
  );
}