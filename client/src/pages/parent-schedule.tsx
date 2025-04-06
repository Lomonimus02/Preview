import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { useAuth } from "@/hooks/use-auth";
import { UserRoleEnum, Schedule, Class, Subject, User } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CalendarIcon, BookOpenIcon, Filter, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ru } from "date-fns/locale";
import { format, addDays } from "date-fns";

export default function ParentSchedule() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const isParent = user?.role === UserRoleEnum.PARENT;
  
  // Для родителя загружаем связи с детьми
  const { data: children = [], isLoading: isChildrenLoading } = useQuery<User[]>({
    queryKey: ["/api/parent-children"],
    enabled: !!user && isParent
  });
  
  // Загружаем классы для определения к какому классу принадлежит ребенок
  const { data: classes = [], isLoading: isClassesLoading } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
    enabled: !!user
  });
  
  // Загружаем предметы
  const { data: subjects = [], isLoading: isSubjectsLoading } = useQuery<Subject[]>({
    queryKey: ["/api/subjects"],
    enabled: !!user
  });
  
  // Загружаем расписание для всех детей
  const { data: schedules = [], isLoading: isSchedulesLoading } = useQuery<Schedule[]>({
    queryKey: ["/api/schedules"],
    enabled: !!user
  });
  
  // Автоматически выбираем первого ребенка, если он не выбран
  useEffect(() => {
    if (children.length > 0 && !selectedChildId) {
      setSelectedChildId(children[0].id);
    }
  }, [children, selectedChildId]);
  
  // Определяем класс выбранного ребенка
  const getChildClass = (childId: number | null) => {
    if (!childId) return null;
    
    // Используем API для получения классов ученика
    // В данном случае мы упрощаем и просто смотрим, какие расписания относятся к ученику
    const childSchedules = schedules.filter(schedule => {
      const studentClass = schedule.classId;
      // Проверяем, есть ли в этом классе этот ученик
      // Для простоты предполагаем, что ученик принадлежит к первому найденному классу
      return true; // В реальности здесь должна быть проверка принадлежности ученика к классу
    });
    
    if (childSchedules.length === 0) return null;
    
    const classId = childSchedules[0].classId;
    return classes.find(c => c.id === classId) || null;
  };
  
  // Получаем расписание для выбранного ребенка и даты
  const getChildScheduleForDay = (childId: number | null, date: Date) => {
    if (!childId) return [];
    
    const childClass = getChildClass(childId);
    if (!childClass) return [];
    
    // Фильтруем расписание по классу ребенка и дню недели
    const dayOfWeek = (date.getDay() === 0) ? 7 : date.getDay(); // Преобразуем День недели (0-6, где 0 - воскресенье) в формат (1-7, где 7 - воскресенье)
    
    return schedules.filter(schedule => 
      schedule.classId === childClass.id && 
      schedule.dayOfWeek === dayOfWeek
    ).sort((a, b) => a.lessonNumber - b.lessonNumber);
  };
  
  // Получаем имя предмета
  const getSubjectName = (id: number) => {
    const subject = subjects.find(s => s.id === id);
    return subject ? subject.name : `Предмет ${id}`;
  };
  
  // Проверяем загрузку данных
  const isLoading = isChildrenLoading || isClassesLoading || isSubjectsLoading || isSchedulesLoading;
  
  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <h3 className="text-lg font-medium">Загрузка данных...</h3>
          </div>
        </div>
      </MainLayout>
    );
  }
  
  // Если пользователь не родитель
  if (!isParent) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-6">
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Доступ запрещен</CardTitle>
              <CardDescription>
                У вас нет доступа к просмотру расписания детей. Только родители могут просматривать расписание своих детей.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </MainLayout>
    );
  }
  
  // Если у родителя нет детей
  if (children.length === 0) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-6">
          <Card>
            <CardHeader>
              <CardTitle>Нет данных о детях</CardTitle>
              <CardDescription>
                У вас нет привязанных детей в системе. Обратитесь к администратору школы для настройки связи с вашими детьми.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </MainLayout>
    );
  }
  
  // Получаем расписание для выбранного ребенка
  const selectedChildSchedule = selectedChildId 
    ? getChildScheduleForDay(selectedChildId, selectedDate) 
    : [];
  
  const childClass = selectedChildId ? getChildClass(selectedChildId) : null;
  
  // Создаем массив дат на неделю для выбора
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - date.getDay() + 1 + i); // Начиная с понедельника текущей недели
    return date;
  });
  
  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Расписание занятий</h1>
            <p className="text-gray-500">
              Просмотр расписания занятий для ваших детей
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
          <div className="md:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Выберите ребенка</CardTitle>
              </CardHeader>
              <CardContent>
                <Select
                  value={selectedChildId?.toString() || ""}
                  onValueChange={(value) => setSelectedChildId(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите ребенка" />
                  </SelectTrigger>
                  <SelectContent>
                    {children.map((child) => (
                      <SelectItem key={child.id} value={child.id.toString()}>
                        {child.lastName} {child.firstName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {childClass && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-gray-500">Класс:</p>
                    <p className="font-semibold">{childClass.name}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          
          <div className="md:col-span-4">
            <Card>
              <CardHeader>
                <CardTitle>Выберите дату</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {weekDates.map((date) => (
                    <Button
                      key={date.toISOString()}
                      variant={date.toDateString() === selectedDate.toDateString() ? "default" : "outline"}
                      onClick={() => setSelectedDate(date)}
                      className="flex-grow"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(date, "EEE, d MMM", { locale: ru })}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        
        {selectedChildId ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CalendarIcon className="h-5 w-5 mr-2" />
                Расписание на {format(selectedDate, "d MMMM yyyy", { locale: ru })}
              </CardTitle>
              <CardDescription>
                {children.find(c => c.id === selectedChildId)?.lastName} {children.find(c => c.id === selectedChildId)?.firstName} - {childClass?.name || ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedChildSchedule.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">На выбранную дату нет занятий</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">№</TableHead>
                        <TableHead>Предмет</TableHead>
                        <TableHead>Время</TableHead>
                        <TableHead>Кабинет</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedChildSchedule.map((lesson) => (
                        <TableRow key={lesson.id}>
                          <TableCell>
                            <div className="font-bold">{lesson.lessonNumber}</div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{getSubjectName(lesson.subjectId)}</div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              <Clock className="h-4 w-4 mr-1 text-gray-400" />
                              {lesson.startTime} - {lesson.endTime}
                            </div>
                          </TableCell>
                          <TableCell>
                            {lesson.classroom || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Выберите ребенка</CardTitle>
              <CardDescription>
                Для просмотра расписания необходимо выбрать ребенка
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}