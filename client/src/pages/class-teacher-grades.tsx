import { useState, useEffect, useMemo } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import { useQuery } from "@tanstack/react-query";
import { UserRoleEnum, Grade, Subject, User, Class } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpenIcon, GraduationCapIcon, Calculator } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { apiRequest } from "@/lib/queryClient";

export default function ClassTeacherGradesPage() {
  const { user } = useAuth();
  const { isClassTeacher } = useRoleCheck();
  const { toast } = useToast();
  const [classId, setClassId] = useState<number | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);

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
      const res = await fetch(`/api/classes/${classId}`);
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

  // Получаем список предметов
  const { data: subjects = [], isLoading: subjectsLoading } = useQuery<Subject[]>({
    queryKey: ["/api/subjects"],
    enabled: !!user,
  });

  // Получаем оценки для выбранного класса и предмета (если выбран)
  const { data: allGrades = [], isLoading: gradesLoading } = useQuery<Grade[]>({
    queryKey: ["/api/grades", { classId }],
    queryFn: async () => {
      const res = await apiRequest(`/api/grades?classId=${classId}`, "GET");
      return res.json();
    },
    enabled: !!classId,
  });

  // Фильтруем оценки по выбранному предмету
  const filteredGrades = useMemo(() => {
    if (!selectedSubjectId) return allGrades;
    return allGrades.filter(grade => grade.subjectId === selectedSubjectId);
  }, [allGrades, selectedSubjectId]);

  // Рассчитываем средний балл ученика по выбранному предмету
  const calculateSubjectAverage = (studentId: number, subjectId: number) => {
    const studentSubjectGrades = allGrades.filter(
      g => g.studentId === studentId && g.subjectId === subjectId
    );
    
    if (studentSubjectGrades.length === 0) return "-";
    
    const sum = studentSubjectGrades.reduce((total, grade) => total + grade.grade, 0);
    const average = sum / studentSubjectGrades.length;
    
    return average.toFixed(1);
  };

  // Рассчитываем общий средний балл ученика по всем предметам
  const calculateStudentOverallAverage = (studentId: number) => {
    const studentGrades = allGrades.filter(g => g.studentId === studentId);
    
    if (studentGrades.length === 0) return "-";
    
    const sum = studentGrades.reduce((total, grade) => total + grade.grade, 0);
    const average = sum / studentGrades.length;
    
    return average.toFixed(1);
  };

  // Получаем уникальные предметы, по которым есть оценки
  const subjectsWithGrades = useMemo(() => {
    const subjectIds = [...new Set(allGrades.map(g => g.subjectId))];
    return subjects.filter(subject => subjectIds.includes(subject.id));
  }, [allGrades, subjects]);

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
            <h2 className="text-2xl font-heading font-bold text-gray-800">Журнал оценок</h2>
            {classInfo && (
              <p className="text-muted-foreground">
                Класс: {classInfo.name}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={selectedSubjectId?.toString() || ""}
              onValueChange={(value) => setSelectedSubjectId(value ? parseInt(value) : null)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Выберите предмет" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Все предметы</SelectItem>
                {subjects.map((subject) => (
                  <SelectItem key={subject.id} value={subject.id.toString()}>
                    {subject.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs defaultValue="by-subject">
          <TabsList className="mb-4">
            <TabsTrigger value="by-subject">
              <BookOpenIcon className="h-4 w-4 mr-2" />
              По предметам
            </TabsTrigger>
            <TabsTrigger value="overall">
              <Calculator className="h-4 w-4 mr-2" />
              Общая успеваемость
            </TabsTrigger>
          </TabsList>

          <TabsContent value="by-subject">
            {selectedSubjectId ? (
              // Отображение оценок для выбранного предмета
              <Card>
                <CardHeader>
                  <CardTitle>
                    Оценки по предмету: {subjects.find(s => s.id === selectedSubjectId)?.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {studentsLoading || gradesLoading ? (
                    <div className="flex justify-center py-8">Загрузка оценок...</div>
                  ) : students.length === 0 ? (
                    <Alert>
                      <AlertTitle>Нет данных</AlertTitle>
                      <AlertDescription>В классе нет учеников</AlertDescription>
                    </Alert>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="border">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="bg-muted/50 w-60 sticky left-0">
                              Ученик
                            </TableHead>
                            {/* Здесь можно добавить колонки для дат уроков, если необходимо */}
                            <TableHead className="text-center font-bold">
                              Средний балл
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {students.map(student => (
                            <TableRow key={student.id}>
                              <TableCell className="bg-muted/50 font-medium sticky left-0">
                                {student.lastName} {student.firstName}
                              </TableCell>
                              <TableCell className="text-center">
                                {calculateSubjectAverage(student.id, selectedSubjectId)}
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
              // Отображение таблицы предметов и средних оценок по каждому предмету
              <Card>
                <CardHeader>
                  <CardTitle>
                    Оценки учеников по всем предметам
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {studentsLoading || gradesLoading || subjectsLoading ? (
                    <div className="flex justify-center py-8">Загрузка оценок...</div>
                  ) : students.length === 0 ? (
                    <Alert>
                      <AlertTitle>Нет данных</AlertTitle>
                      <AlertDescription>В классе нет учеников</AlertDescription>
                    </Alert>
                  ) : subjectsWithGrades.length === 0 ? (
                    <Alert>
                      <AlertTitle>Нет данных</AlertTitle>
                      <AlertDescription>Нет предметов с оценками</AlertDescription>
                    </Alert>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="border">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="bg-muted/50 w-60 sticky left-0">
                              Ученик
                            </TableHead>
                            {subjectsWithGrades.map(subject => (
                              <TableHead key={subject.id} className="text-center min-w-[100px]" title={subject.description || ""}>
                                {subject.name}
                              </TableHead>
                            ))}
                            <TableHead className="text-center font-bold bg-primary/10">
                              Общий средний балл
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {students.map(student => (
                            <TableRow key={student.id}>
                              <TableCell className="bg-muted/50 font-medium sticky left-0">
                                {student.lastName} {student.firstName}
                              </TableCell>
                              {subjectsWithGrades.map(subject => (
                                <TableCell key={subject.id} className="text-center">
                                  {calculateSubjectAverage(student.id, subject.id)}
                                </TableCell>
                              ))}
                              <TableCell className="text-center font-bold bg-primary/10">
                                {calculateStudentOverallAverage(student.id)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="overall">
            <Card>
              <CardHeader>
                <CardTitle>
                  Общая успеваемость класса
                </CardTitle>
              </CardHeader>
              <CardContent>
                {studentsLoading || gradesLoading ? (
                  <div className="flex justify-center py-8">Загрузка данных...</div>
                ) : students.length === 0 ? (
                  <Alert>
                    <AlertTitle>Нет данных</AlertTitle>
                    <AlertDescription>В классе нет учеников</AlertDescription>
                  </Alert>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="border">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="bg-muted/50 w-60 sticky left-0">
                            Ученик
                          </TableHead>
                          <TableHead className="text-center">
                            Средний балл
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {students
                          .slice()
                          .sort((a, b) => {
                            const aAvg = calculateStudentOverallAverage(a.id);
                            const bAvg = calculateStudentOverallAverage(b.id);
                            
                            // Сначала сортируем по оценкам (исключая "-")
                            if (aAvg !== "-" && bAvg !== "-") {
                              return parseFloat(bAvg) - parseFloat(aAvg);
                            }
                            
                            // Затем по фамилии
                            if (aAvg === "-" && bAvg === "-") {
                              return a.lastName.localeCompare(b.lastName);
                            }
                            
                            // Ученики с оценками идут выше учеников без оценок
                            return aAvg === "-" ? 1 : -1;
                          })
                          .map(student => (
                            <TableRow key={student.id}>
                              <TableCell className="bg-muted/50 font-medium sticky left-0">
                                {student.lastName} {student.firstName}
                              </TableCell>
                              <TableCell className="text-center">
                                {calculateStudentOverallAverage(student.id)}
                              </TableCell>
                            </TableRow>
                          ))
                        }
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}