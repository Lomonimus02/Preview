import { useState, useEffect } from "react";
import { Link } from "wouter";
import { MainLayout } from "@/components/layout/main-layout";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import { UserRoleEnum, User, Class } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserIcon, UsersIcon, CalendarIcon, GraduationCapIcon, BookOpenIcon } from "lucide-react";
import { ScheduleCarousel } from "@/components/schedule/schedule-carousel";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";

export default function ClassTeacherDashboard() {
  const { user } = useAuth();
  const { isClassTeacher } = useRoleCheck();
  const { toast } = useToast();
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [classId, setClassId] = useState<number | null>(null);

  // Проверяем, что пользователь является классным руководителем
  useEffect(() => {
    if (user && !isClassTeacher()) {
      toast({
        title: "Ошибка доступа",
        description: "Эта страница доступна только для классных руководителей",
        variant: "destructive",
      });
    }
  }, [user, isClassTeacher, toast]);

  // Получаем роли пользователя, чтобы найти привязанный класс
  const { data: userRoles = [] } = useQuery({
    queryKey: ["/api/user-roles", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/user-roles/${user?.id}`);
      if (!res.ok) throw new Error("Не удалось загрузить роли пользователя");
      return res.json();
    },
    enabled: !!user && isClassTeacher(),
  });

  // Находим роль классного руководителя и получаем ID класса
  useEffect(() => {
    if (userRoles.length > 0) {
      const classTeacherRole = userRoles.find(r => r.role === UserRoleEnum.CLASS_TEACHER && r.classId);
      if (classTeacherRole && classTeacherRole.classId) {
        setClassId(classTeacherRole.classId);
      }
    }
  }, [userRoles]);

  // Получаем информацию о классе
  const { data: classInfo } = useQuery<Class>({
    queryKey: ["/api/classes", classId],
    queryFn: async () => {
      const res = await apiRequest(`/api/classes/${classId}`, "GET");
      if (!res.ok) throw new Error("Не удалось загрузить информацию о классе");
      return res.json();
    },
    enabled: !!classId,
  });

  // Получаем список учеников класса
  const { data: students = [], isLoading: studentsLoading } = useQuery<User[]>({
    queryKey: ["/api/students-by-class", classId],
    queryFn: async () => {
      const res = await apiRequest(`/api/students-by-class/${classId}`, "GET");
      if (!res.ok) throw new Error("Не удалось загрузить список учеников");
      return res.json();
    },
    enabled: !!classId,
  });

  // Получаем расписание выбранного ученика или расписание класса
  const { data: studentSchedule = [], isLoading: scheduleLoading } = useQuery({
    queryKey: ["/api/student-schedules", selectedStudentId],
    queryFn: async () => {
      if (!selectedStudentId) return [];
      const res = await apiRequest(`/api/student-schedules/${selectedStudentId}`, "GET");
      if (!res.ok) throw new Error("Не удалось загрузить расписание ученика");
      return res.json();
    },
    enabled: !!selectedStudentId,
  });

  // Получаем расписание всего класса
  const { data: classSchedule = [] } = useQuery({
    queryKey: ["/api/schedules", { classId }],
    queryFn: async () => {
      const res = await apiRequest(`/api/schedules?classId=${classId}`, "GET");
      if (!res.ok) throw new Error("Не удалось загрузить расписание класса");
      return res.json();
    },
    enabled: !!classId && !selectedStudentId,
  });

  // Получение дополнительных данных для отображения расписания
  const { data: subjects = [] } = useQuery({
    queryKey: ["/api/subjects"],
    enabled: !!user,
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["/api/users", { role: UserRoleEnum.TEACHER }],
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

  // Выбор ученика для просмотра его расписания
  const handleSelectStudent = (studentId: number) => {
    setSelectedStudentId(studentId === selectedStudentId ? null : studentId);
  };

  if (!user || !isClassTeacher()) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-6">
          <Alert>
            <AlertTitle>Ошибка доступа</AlertTitle>
            <AlertDescription>
              Эта страница доступна только для классных руководителей.
            </AlertDescription>
          </Alert>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h2 className="text-2xl font-heading font-bold text-gray-800">Панель классного руководителя</h2>
            {classInfo && (
              <p className="text-muted-foreground">
                Класс: {classInfo.name}
              </p>
            )}
          </div>
          {selectedStudentId && (
            <Button 
              variant="outline" 
              onClick={() => setSelectedStudentId(null)}
            >
              Вернуться к классу
            </Button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex flex-wrap gap-2">
            <Link href="/class-teacher-grades">
              <Button className="w-full sm:w-auto">
                <GraduationCapIcon className="h-4 w-4 mr-2" />
                Журнал оценок
              </Button>
            </Link>
            
            {classId && (
              <Link href={`/class-grade-details/${classId}/1`}>
                <Button className="w-full sm:w-auto" variant="outline">
                  <BookOpenIcon className="h-4 w-4 mr-2" />
                  Оценки по предметам
                </Button>
              </Link>
            )}
          </div>
        </div>

        <Tabs defaultValue="students" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="students">
              <UsersIcon className="h-4 w-4 mr-2" />
              Ученики класса
            </TabsTrigger>
            <TabsTrigger value="schedule">
              <CalendarIcon className="h-4 w-4 mr-2" />
              Расписание класса
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="students">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {studentsLoading ? (
                <p>Загрузка списка учеников...</p>
              ) : students.length > 0 ? (
                students.map(student => (
                  <Card key={student.id} className={`hover:border-primary transition-all ${selectedStudentId === student.id ? 'border-primary' : ''}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">{student.lastName} {student.firstName}</CardTitle>
                      {student.patronymic && (
                        <CardDescription>{student.patronymic}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="pb-2">
                      <div className="grid grid-cols-2 gap-1 text-sm">
                        <div className="text-muted-foreground">Логин:</div>
                        <div>{student.username}</div>
                        {student.email && (
                          <>
                            <div className="text-muted-foreground">Email:</div>
                            <div>{student.email}</div>
                          </>
                        )}
                        {student.phone && (
                          <>
                            <div className="text-muted-foreground">Телефон:</div>
                            <div>{student.phone}</div>
                          </>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button 
                        variant="outline" 
                        className="w-full" 
                        onClick={() => handleSelectStudent(student.id)}
                      >
                        {selectedStudentId === student.id ? "Скрыть расписание" : "Расписание ученика"}
                      </Button>
                    </CardFooter>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Нет учеников</CardTitle>
                    <CardDescription>В этом классе пока нет учеников</CardDescription>
                  </CardHeader>
                </Card>
              )}
            </div>
            
            {selectedStudentId && (
              <>
                <Separator className="my-6" />
                <div className="mb-4">
                  <h3 className="text-xl font-semibold mb-2">
                    Расписание ученика: {students.find(s => s.id === selectedStudentId)?.lastName} {students.find(s => s.id === selectedStudentId)?.firstName}
                  </h3>
                </div>
                
                {scheduleLoading ? (
                  <p>Загрузка расписания ученика...</p>
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
              </>
            )}
          </TabsContent>
          
          <TabsContent value="schedule">
            <div className="mb-4">
              <h3 className="text-xl font-semibold mb-2">
                Расписание класса: {classInfo?.name || ""}
              </h3>
            </div>
            
            {classSchedule.length > 0 ? (
              <ScheduleCarousel
                schedules={classSchedule}
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
                  Для этого класса нет активного расписания
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}