import { useEffect, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function GeneralSchedulePage() {
  const { user } = useAuth();
  const { isSchoolAdmin } = useRoleCheck();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedClass, setSelectedClass] = useState<string>("all");
  
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

  // Получаем информацию о школе администратора
  const { data: userInfo } = useQuery({
    queryKey: ["/api/user"],
    enabled: !!user && isSchoolAdmin()
  });

  // Загружаем список классов школы
  const { data: classes = [], isLoading: classesLoading } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
    queryFn: async () => {
      // Определяем schoolId
      let schoolId: number | null = null;
      
      // Пытаемся получить schoolId из профиля пользователя или из его ролей
      if (user?.schoolId) {
        schoolId = user.schoolId;
      } else if (user?.activeRole?.schoolId) {
        schoolId = user.activeRole.schoolId;
      }
      
      // Если ID школы не найден, пытаемся получить первую доступную школу для админа
      if (!schoolId) {
        const schoolsResponse = await apiRequest("/api/schools", "GET");
        if (schoolsResponse.ok) {
          const schools = await schoolsResponse.json();
          if (schools && schools.length > 0) {
            schoolId = schools[0].id;
          }
        }
      }
      
      if (!schoolId) {
        console.error("Не удалось определить ID школы для администратора");
        return [];
      }
      
      // Загружаем классы для конкретной школы
      const res = await apiRequest(`/api/classes?schoolId=${schoolId}`, "GET");
      if (!res.ok) throw new Error("Не удалось загрузить классы");
      return res.json();
    },
    enabled: !!user && isSchoolAdmin()
  });

  // Загружаем расписание для всех классов школы
  const { data: schedules = [], isLoading: schedulesLoading } = useQuery<Schedule[]>({
    queryKey: ["/api/schedules"],
    queryFn: async () => {
      // Определяем schoolId
      let schoolId: number | null = null;
      
      // Пытаемся получить schoolId из профиля пользователя или из его ролей
      if (user?.schoolId) {
        schoolId = user.schoolId;
      } else if (user?.activeRole?.schoolId) {
        schoolId = user.activeRole.schoolId;
      }
      
      // Если ID школы не найден, пытаемся получить первую доступную школу для админа
      if (!schoolId) {
        const schoolsResponse = await apiRequest("/api/schools", "GET");
        if (schoolsResponse.ok) {
          const schools = await schoolsResponse.json();
          if (schools && schools.length > 0) {
            schoolId = schools[0].id;
          }
        }
      }
      
      if (!schoolId) {
        return [];
      }
      
      // Загружаем расписания для всех классов школы
      const res = await apiRequest(`/api/schedules?schoolId=${schoolId}`, "GET");
      if (!res.ok) throw new Error("Не удалось загрузить расписание");
      return res.json();
    },
    enabled: !!user && isSchoolAdmin(),
    refetchInterval: 60000 // Обновляем каждую минуту
  });

  // Создаем массив дат для текущей недели
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(currentDate);
    date.setDate(date.getDate() + i);
    return date;
  });

  // Фильтруем расписание в соответствии с выбранным классом
  const filteredSchedules = selectedClass === "all" 
    ? schedules 
    : schedules.filter(schedule => schedule.classId === parseInt(selectedClass));

  // Группируем расписание по дням недели
  const scheduleByDay = weekDates.map(date => {
    const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay(); // Преобразуем 0 (воскресенье) в 7
    const formattedDate = formatDate(date);
    
    // Фильтруем занятия для этого дня недели
    const daySchedules = filteredSchedules.filter(schedule => {
      const scheduleDayOfWeek = schedule.dayOfWeek;
      return scheduleDayOfWeek === dayOfWeek;
    });
    
    // Сортируем занятия по времени начала и имени класса
    daySchedules.sort((a, b) => {
      if (a.startTime !== b.startTime) {
        return a.startTime.localeCompare(b.startTime);
      }
      
      // Получаем информацию о классе
      const classA = classes.find(c => c.id === a.classId);
      const classB = classes.find(c => c.id === b.classId);
      
      if (classA && classB) {
        return classA.name.localeCompare(classB.name);
      }
      
      return 0;
    });
    
    return {
      date,
      formattedDate,
      dayName: getDayOfWeekName(dayOfWeek),
      schedules: daySchedules
    };
  });

  const isLoading = classesLoading || schedulesLoading;

  // Сортируем классы по имени
  const sortedClasses = [...classes].sort((a, b) => a.name.localeCompare(b.name));

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
          
          {/* Фильтр по классам */}
          <div className="flex justify-start">
            <Tabs 
              value={selectedClass} 
              onValueChange={setSelectedClass}
              className="w-full sm:w-auto overflow-x-auto"
            >
              <TabsList className="grid-flow-col inline-grid auto-cols-max gap-1 p-1">
                <TabsTrigger value="all">Все классы</TabsTrigger>
                {sortedClasses.map(classItem => (
                  <TabsTrigger key={classItem.id} value={classItem.id.toString()}>
                    {classItem.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
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
                            showClassInfo={selectedClass === "all"}
                            classes={classes}
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