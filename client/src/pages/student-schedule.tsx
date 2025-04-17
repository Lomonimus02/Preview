import { useState, useEffect } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { MainLayout } from "@/components/layout/main-layout";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import { UserRoleEnum, User } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ScheduleCarousel } from "@/components/schedule/schedule-carousel";
import { apiRequest } from "@/lib/queryClient";

export default function StudentSchedulePage() {
  const { user } = useAuth();
  const { isClassTeacher, isTeacher, isPrincipal, isSchoolAdmin } = useRoleCheck();
  const { toast } = useToast();
  const [, params] = useRoute<{ studentId: string }>("/student-schedule/:studentId");
  const [, setLocation] = useLocation();
  
  const studentId = params ? parseInt(params.studentId) : null;
  
  // Проверяем права доступа пользователя
  const hasAccess = () => {
    return isClassTeacher() || isTeacher() || isPrincipal() || isSchoolAdmin();
  };

  useEffect(() => {
    if (user && !hasAccess()) {
      toast({
        title: "Ошибка доступа",
        description: "У вас нет прав для просмотра этой страницы",
        variant: "destructive",
      });
      
      // Перенаправляем на главную страницу
      setLocation("/");
    }
  }, [user, hasAccess, toast, setLocation]);

  // Получаем информацию о выбранном ученике
  const { data: studentInfo, isLoading: studentLoading } = useQuery<User>({
    queryKey: ["/api/users", studentId],
    queryFn: async () => {
      if (!studentId) throw new Error("ID ученика не указан");
      const res = await apiRequest(`/api/users/${studentId}`, "GET");
      if (!res.ok) throw new Error("Не удалось загрузить информацию об ученике");
      return res.json();
    },
    enabled: !!studentId && hasAccess(),
  });

  // Получаем расписание выбранного ученика
  const { data: studentSchedule = [], isLoading: scheduleLoading } = useQuery({
    queryKey: ["/api/student-schedules", studentId],
    queryFn: async () => {
      if (!studentId) return [];
      const res = await apiRequest(`/api/student-schedules/${studentId}`, "GET");
      if (!res.ok) throw new Error("Не удалось загрузить расписание ученика");
      return res.json();
    },
    enabled: !!studentId && hasAccess(),
  });

  // Получение дополнительных данных для отображения расписания
  const { data: subjects = [] } = useQuery({
    queryKey: ["/api/subjects"],
    enabled: !!user && hasAccess(),
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["/api/users", { role: UserRoleEnum.TEACHER }],
    enabled: !!user && hasAccess(),
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["/api/classes"],
    enabled: !!user && hasAccess(),
  });

  const { data: grades = [] } = useQuery({
    queryKey: ["/api/grades"],
    enabled: !!user && hasAccess(),
  });

  const { data: homework = [] } = useQuery({
    queryKey: ["/api/homework"],
    enabled: !!user && hasAccess(),
  });

  if (!user || !hasAccess()) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-6">
          <Alert variant="destructive">
            <AlertTitle>Ошибка доступа</AlertTitle>
            <AlertDescription>
              У вас нет прав для просмотра этой страницы
            </AlertDescription>
          </Alert>
        </div>
      </MainLayout>
    );
  }

  if (studentLoading || scheduleLoading) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
            <span>Загрузка данных...</span>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!studentInfo) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-6">
          <Alert variant="destructive">
            <AlertTitle>Ошибка</AlertTitle>
            <AlertDescription>
              Информация об ученике не найдена
            </AlertDescription>
          </Alert>
          <Button className="mt-4" onClick={() => setLocation("/class-teacher-dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Вернуться к панели классного руководителя
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout className="overflow-hidden">
      <div className="container mx-auto px-4 py-6 h-full flex flex-col overflow-hidden">
        <div className="flex justify-between items-center mb-6 flex-shrink-0">
          <div>
            <Button variant="outline" onClick={() => setLocation("/class-teacher-dashboard")} className="mb-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Вернуться к панели классного руководителя
            </Button>
            <h2 className="text-2xl font-heading font-bold text-gray-800">
              Расписание ученика
            </h2>
            <p className="text-muted-foreground">
              {studentInfo.lastName} {studentInfo.firstName} {studentInfo.patronymic || ""}
            </p>
          </div>
        </div>

        <Separator className="mb-4 flex-shrink-0" />
        
        <div className="flex-grow overflow-hidden">
          {studentSchedule.length > 0 ? (
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