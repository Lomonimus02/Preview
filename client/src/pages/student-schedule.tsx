import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { MainLayout } from "@/components/layout/main-layout";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import { Button } from "@/components/ui/button";
import { ChevronLeftIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ScheduleCarousel } from "@/components/schedule/schedule-carousel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export default function StudentSchedulePage() {
  const { user } = useAuth();
  const { isClassTeacher, isTeacher, isAdmin } = useRoleCheck();
  const [, params] = useRoute<{ studentId: string }>("/student-schedule/:studentId");
  const [, setLocation] = useLocation();
  
  const studentId = params ? parseInt(params.studentId) : null;
  
  // Получение информации о студенте
  const { data: student, isLoading: studentLoading } = useQuery({
    queryKey: ["/api/users", studentId],
    queryFn: async () => {
      if (!studentId) return null;
      const res = await apiRequest(`/api/users/${studentId}`, "GET");
      if (!res.ok) throw new Error("Не удалось загрузить информацию о студенте");
      return res.json();
    },
    enabled: !!studentId,
  });

  // Получаем расписание студента
  const { data: studentSchedule = [], isLoading: scheduleLoading } = useQuery({
    queryKey: ["/api/student-schedules", studentId],
    queryFn: async () => {
      if (!studentId) return [];
      const res = await apiRequest(`/api/student-schedules/${studentId}`, "GET");
      if (!res.ok) throw new Error("Не удалось загрузить расписание ученика");
      return res.json();
    },
    enabled: !!studentId,
  });

  // Получение дополнительных данных для отображения расписания
  const { data: subjects = [] } = useQuery({
    queryKey: ["/api/subjects"],
    enabled: !!user,
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["/api/users"],
    enabled: !!user,
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["/api/classes"],
    enabled: !!user,
  });

  const { data: grades = [] } = useQuery({
    queryKey: ["/api/grades"],
    enabled: !!user,
  });

  const { data: homework = [] } = useQuery({
    queryKey: ["/api/homework"],
    enabled: !!user,
  });

  // Проверка доступа
  const canViewStudentSchedule = () => {
    if (!user || !student) return false;
    
    // Классный руководитель и администратор могут просматривать любое расписание
    if (isClassTeacher() || isTeacher() || isAdmin()) return true;
    
    // Ученик может просматривать только свое расписание
    if (user.id === student.id) return true;
    
    return false;
  };

  // Возврат к предыдущей странице
  const handleGoBack = () => {
    if (isClassTeacher()) {
      setLocation('/class-teacher-dashboard');
    } else {
      setLocation('/');
    }
  };

  return (
    <MainLayout className="overflow-hidden">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleGoBack} 
              className="mr-2"
            >
              <ChevronLeftIcon className="h-4 w-4 mr-1" />
              Назад
            </Button>
            
            {studentLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-[250px]" />
                <Skeleton className="h-4 w-[200px]" />
              </div>
            ) : student ? (
              <div>
                <h1 className="text-2xl font-bold">
                  Расписание ученика
                </h1>
                <p className="text-muted-foreground">
                  {student.lastName} {student.firstName} 
                  {student.patronymic && ` ${student.patronymic}`}
                </p>
              </div>
            ) : (
              <h1 className="text-2xl font-bold">Ученик не найден</h1>
            )}
          </div>

          {!canViewStudentSchedule() ? (
            <Alert variant="destructive">
              <AlertTitle>Ошибка доступа</AlertTitle>
              <AlertDescription>
                У вас нет прав для просмотра расписания этого ученика.
              </AlertDescription>
            </Alert>
          ) : scheduleLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-[500px] w-full" />
            </div>
          ) : studentSchedule.length > 0 ? (
            <ScheduleCarousel
              schedules={studentSchedule}
              subjects={subjects}
              teachers={teachers}
              classes={classes}
              grades={grades}
              homework={homework}
              currentUser={user}
              isAdmin={false}
            />
          ) : (
            <Alert>
              <AlertTitle>Расписание отсутствует</AlertTitle>
              <AlertDescription>
                Для этого ученика нет активного расписания
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </MainLayout>
  );
}