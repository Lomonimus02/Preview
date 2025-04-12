import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/main-layout";
import { ScheduleCarousel } from "@/components/schedule/schedule-carousel";
import { ScheduleGrid } from "@/components/schedule/schedule-grid";
import { TimeSlotsManager } from "@/components/schedule/time-slots-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Schedule, Class, Subject, User, Grade, Homework } from "@shared/schema";
import { ScheduleForm } from "@/components/schedule/schedule-form";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ClassSchedulePage() {
  const params = useParams<{ classId: string }>();
  const classId = parseInt(params.classId);
  const { user } = useAuth();
  const { isSchoolAdmin } = useRoleCheck();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Состояния для управления формой расписания
  const [isScheduleFormOpen, setIsScheduleFormOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [scheduleToEdit, setScheduleToEdit] = useState<Schedule | null>(null);
  
  // Проверка доступа (только администраторы школы должны иметь доступ)
  if (!isSchoolAdmin()) {
    return (
      <MainLayout>
        <div className="container mx-auto py-8">
          <Alert variant="destructive">
            <AlertTitle>Доступ запрещен</AlertTitle>
            <AlertDescription>
              У вас нет прав для просмотра этой страницы
            </AlertDescription>
          </Alert>
        </div>
      </MainLayout>
    );
  }
  
  // Проверка валидности ID класса
  if (isNaN(classId)) {
    return (
      <MainLayout>
        <div className="container mx-auto py-8">
          <Alert variant="destructive">
            <AlertTitle>Ошибка</AlertTitle>
            <AlertDescription>
              Некорректный идентификатор класса
            </AlertDescription>
          </Alert>
        </div>
      </MainLayout>
    );
  }
  
  // Загрузка данных класса
  const { data: classData, isLoading: classLoading } = useQuery<Class>({
    queryKey: ["/api/classes", classId],
    queryFn: async () => {
      const response = await fetch(`/api/classes/${classId}`);
      if (!response.ok) throw new Error("Не удалось загрузить данные класса");
      return response.json();
    },
    enabled: !isNaN(classId)
  });
  
  // Загрузка расписания для указанного класса
  const { data: schedules = [], isLoading: schedulesLoading } = useQuery<Schedule[]>({
    queryKey: ["/api/schedules", { classId }],
    queryFn: async () => {
      const response = await fetch(`/api/schedules?classId=${classId}`);
      if (!response.ok) throw new Error("Не удалось загрузить расписание");
      return response.json();
    },
    enabled: !isNaN(classId)
  });
  
  // Загрузка предметов
  const { data: subjects = [], isLoading: subjectsLoading } = useQuery<Subject[]>({
    queryKey: ["/api/subjects"],
    enabled: !!user
  });
  
  // Загрузка учителей
  const { data: teachers = [], isLoading: teachersLoading } = useQuery<User[]>({
    queryKey: ["/api/users", { role: "teacher" }],
    enabled: !!user
  });
  
  // Загрузка классов
  const { data: classes = [], isLoading: classesLoading } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
    enabled: !!user
  });
  
  // Загрузка домашних заданий
  const { data: homework = [], isLoading: homeworkLoading } = useQuery<Homework[]>({
    queryKey: ["/api/homework", { classId }],
    enabled: !!user && !isNaN(classId)
  });
  
  // Загрузка оценок (если необходимо)
  const { data: grades = [], isLoading: gradesLoading } = useQuery<Grade[]>({
    queryKey: ["/api/grades", { classId }],
    enabled: !!user && !isNaN(classId)
  });
  
  // Загрузка подгрупп для класса
  const { data: subgroups = [], isLoading: subgroupsLoading } = useQuery<any[]>({
    queryKey: ["/api/subgroups", { classId }],
    enabled: !!user && !isNaN(classId)
  });
  
  // Мутация для создания расписания
  const createScheduleMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest({
        url: '/api/schedules',
        method: 'POST',
        data
      });
    },
    onSuccess: () => {
      // Инвалидируем кэш расписаний для перезагрузки данных
      queryClient.invalidateQueries({ queryKey: ['/api/schedules', { classId }] });
      setIsScheduleFormOpen(false);
      toast({
        title: 'Урок добавлен',
        description: 'Урок успешно добавлен в расписание',
        variant: 'default'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Ошибка',
        description: error.message || 'Не удалось добавить урок в расписание',
        variant: 'destructive'
      });
    }
  });
  
  // Мутация для обновления расписания
  const updateScheduleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: any }) => {
      return await apiRequest({
        url: `/api/schedules/${id}`,
        method: 'PATCH',
        data
      });
    },
    onSuccess: () => {
      // Инвалидируем кэш расписаний для перезагрузки данных
      queryClient.invalidateQueries({ queryKey: ['/api/schedules', { classId }] });
      setIsScheduleFormOpen(false);
      setScheduleToEdit(null);
      toast({
        title: 'Урок обновлен',
        description: 'Урок успешно обновлен в расписании',
        variant: 'default'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Ошибка',
        description: error.message || 'Не удалось обновить урок в расписании',
        variant: 'destructive'
      });
    }
  });
  
  // Мутация для удаления расписания
  const deleteScheduleMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest({
        url: `/api/schedules/${id}`,
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      // Инвалидируем кэш расписаний для перезагрузки данных
      queryClient.invalidateQueries({ queryKey: ['/api/schedules', { classId }] });
      toast({
        title: 'Урок удален',
        description: 'Урок успешно удален из расписания',
        variant: 'default'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Ошибка',
        description: error.message || 'Не удалось удалить урок из расписания',
        variant: 'destructive'
      });
    }
  });
  
  // Обработчик отправки формы расписания
  const handleScheduleFormSubmit = (data: any) => {
    if (scheduleToEdit) {
      // Редактирование существующего расписания
      updateScheduleMutation.mutate({ id: scheduleToEdit.id, data: { ...data, classId } });
    } else {
      // Создание нового расписания
      createScheduleMutation.mutate({ ...data, classId });
    }
  };
  
  // Обработчик открытия формы создания расписания
  const handleAddSchedule = (date: Date) => {
    setSelectedDate(date);
    setScheduleToEdit(null);
    setIsScheduleFormOpen(true);
  };
  
  // Обработчик открытия формы редактирования расписания
  const handleEditSchedule = (schedule: Schedule) => {
    setScheduleToEdit(schedule);
    setIsScheduleFormOpen(true);
  };
  
  // Обработчик удаления расписания
  const handleDeleteSchedule = (schedule: Schedule) => {
    if (confirm('Вы уверены, что хотите удалить этот урок из расписания?')) {
      deleteScheduleMutation.mutate(schedule.id);
    }
  };
  
  const isLoading = classLoading || schedulesLoading || subjectsLoading || 
                    teachersLoading || classesLoading || homeworkLoading || 
                    gradesLoading || subgroupsLoading;
  
  return (
    <MainLayout>
      <div className="container mx-auto py-8">
        {isLoading ? (
          <div className="flex justify-center items-center min-h-[50vh]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-lg">Загрузка расписания...</span>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-3xl font-bold">
                Расписание класса: {classData?.name || `#${classId}`}
              </h1>
              <Button 
                onClick={() => {
                  setSelectedDate(new Date());
                  setScheduleToEdit(null);
                  setIsScheduleFormOpen(true);
                }}
                className="flex items-center gap-2"
              >
                <Plus size={16} />
                Добавить урок
              </Button>
            </div>
            
            <Tabs defaultValue="schedule" className="w-full mb-8">
              <TabsList className="grid w-[400px] grid-cols-2">
                <TabsTrigger value="schedule">Расписание</TabsTrigger>
                <TabsTrigger value="time-slots">Настройка временных слотов</TabsTrigger>
              </TabsList>
              
              <TabsContent value="schedule" className="mt-4">
                <Tabs defaultValue="grid" className="w-full mb-4">
                  <TabsList className="grid w-[350px] grid-cols-2">
                    <TabsTrigger value="grid">Сетка</TabsTrigger>
                    <TabsTrigger value="carousel">Карусель</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="grid" className="mt-4">
                    {schedules.length > 0 ? (
                      <ScheduleGrid 
                        classId={classId}
                        schedules={schedules}
                        subjects={subjects}
                        teachers={teachers}
                        subgroups={subgroups}
                        isAdmin={isSchoolAdmin()}
                        onAddSchedule={(slotNumber) => {
                          setSelectedDate(new Date());
                          setScheduleToEdit(null);
                          setIsScheduleFormOpen(true);
                        }}
                        onEditSchedule={handleEditSchedule}
                        onDeleteSchedule={handleDeleteSchedule}
                      />
                    ) : (
                      <Alert>
                        <AlertTitle>Расписание отсутствует</AlertTitle>
                        <AlertDescription>
                          Для данного класса еще не создано расписание
                        </AlertDescription>
                      </Alert>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="carousel" className="mt-4">
                    {schedules.length > 0 ? (
                      <ScheduleCarousel
                        schedules={schedules}
                        subjects={subjects}
                        teachers={teachers}
                        classes={classes}
                        grades={grades}
                        homework={homework}
                        currentUser={user}
                        isAdmin={isSchoolAdmin()}
                        subgroups={subgroups}
                        showClassNames={false}
                        onAddSchedule={handleAddSchedule}
                        onEditSchedule={handleEditSchedule}
                        onDeleteSchedule={handleDeleteSchedule}
                      />
                    ) : (
                      <Alert>
                        <AlertTitle>Расписание отсутствует</AlertTitle>
                        <AlertDescription>
                          Для данного класса еще не создано расписание
                        </AlertDescription>
                      </Alert>
                    )}
                  </TabsContent>
                </Tabs>
              </TabsContent>
              
              <TabsContent value="time-slots" className="mt-4">
                <TimeSlotsManager classId={classId} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
      
      {/* Модальное окно формы расписания */}
      <ScheduleForm
        isOpen={isScheduleFormOpen}
        onClose={() => {
          setIsScheduleFormOpen(false);
          setScheduleToEdit(null);
        }}
        onSubmit={handleScheduleFormSubmit}
        classId={classId}
        initialValues={scheduleToEdit}
        selectedDate={selectedDate}
        loading={createScheduleMutation.isPending || updateScheduleMutation.isPending}
      />
    </MainLayout>
  );
}