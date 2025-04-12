import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/main-layout";
import { ScheduleCarousel } from "@/components/schedule/schedule-carousel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import { Loader2 } from "lucide-react";
import { Schedule, Class, Subject, User, Grade, Homework } from "@shared/schema";

export default function ClassSchedulePage() {
  const params = useParams<{ classId: string }>();
  const classId = parseInt(params.classId);
  const { user } = useAuth();
  const { isSchoolAdmin } = useRoleCheck();
  
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
            </div>
            
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
                showClassNames={false} // В расписании класса не показываем название класса для каждого урока
                onAddSchedule={() => {}} // Пустая функция, т.к. не используем добавление расписания на этой странице
              />
            ) : (
              <Alert>
                <AlertTitle>Расписание отсутствует</AlertTitle>
                <AlertDescription>
                  Для данного класса еще не создано расписание
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}