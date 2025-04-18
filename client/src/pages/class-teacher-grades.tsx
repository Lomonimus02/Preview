import { useState, useEffect, useMemo } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import { useQuery } from "@tanstack/react-query";
import { UserRoleEnum, Grade, Subject, User, Class, GradingSystemEnum } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpenIcon, GraduationCapIcon, Calculator, CalendarRange } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { apiRequest } from "@/lib/queryClient";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Label } from "@/components/ui/label";
import { DateRange } from "react-day-picker";

export default function ClassTeacherGradesPage() {
  const { user } = useAuth();
  const { isClassTeacher, isTeacher } = useRoleCheck();
  const { toast } = useToast();
  const [classId, setClassId] = useState<number | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | string | null>(null);
  
  // Добавляем выбор периода для фильтрации оценок
  const currentDate = new Date();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subMonths(startOfMonth(currentDate), 1), // С 1-го числа предыдущего месяца
    to: endOfMonth(currentDate), // До конца текущего месяца
  });

  // Проверяем права доступа пользователя (не обязательно активная роль должна быть class_teacher)
  const hasClassTeacherAccess = () => {
    // Достаточно, чтобы пользователь имел роль учителя, а роль class_teacher будет проверена через /api/user-roles
    return isTeacher() || isClassTeacher();
  };

  // Проверяем, что пользователь имеет доступ к странице
  useEffect(() => {
    if (user && !hasClassTeacherAccess()) {
      toast({
        title: "Ошибка доступа",
        description: "Эта страница доступна только для классных руководителей",
        variant: "destructive",
      });
    }
  }, [user, hasClassTeacherAccess, toast]);

  // Получаем роли пользователя, чтобы найти привязанный класс
  const { data: userRoles = [] } = useQuery({
    queryKey: ["/api/user-roles", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/user-roles/${user?.id}`);
      if (!res.ok) throw new Error("Не удалось загрузить роли пользователя");
      return res.json();
    },
    enabled: !!user && hasClassTeacherAccess(),
  });

  // Находим роль классного руководителя и получаем ID класса
  useEffect(() => {
    if (userRoles.length > 0) {
      console.log("Полученные роли:", userRoles);
      const classTeacherRole = userRoles.find((r: any) => r.role === UserRoleEnum.CLASS_TEACHER);
      console.log("Найдена роль классного руководителя:", classTeacherRole);
      
      if (classTeacherRole) {
        // Проверяем разные варианты поля с ID класса
        if (classTeacherRole.classId) {
          console.log("Найден classId:", classTeacherRole.classId);
          setClassId(classTeacherRole.classId);
        } else if (classTeacherRole.class_id) {
          console.log("Найден class_id:", classTeacherRole.class_id);
          setClassId(classTeacherRole.class_id);
        } else if (classTeacherRole.classIds && classTeacherRole.classIds.length > 0) {
          console.log("Найден classIds[0]:", classTeacherRole.classIds[0]);
          setClassId(classTeacherRole.classIds[0]);
        }
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
      try {
        // Для роли CLASS_TEACHER в API добавлена специальная логика, которая 
        // автоматически определяет classId на сервере
        const res = await apiRequest(`/api/grades`, "GET");
        console.log("Ответ API при запросе оценок:", { status: res.status, statusText: res.statusText });
        const data = await res.json();
        console.log(`Получено ${data.length} оценок`);
        return data;
      } catch (error) {
        console.error("Ошибка при получении оценок:", error);
        throw error;
      }
    },
    enabled: !!classId,
  });

  // Фильтруем оценки по выбранному периоду
  const gradesInDateRange = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return allGrades;
    
    return allGrades.filter(grade => {
      // Если у оценки есть дата создания, используем ее для фильтрации
      const gradeDate = grade.createdAt ? new Date(grade.createdAt) : null;
      
      if (!gradeDate) return true; // Если даты нет, включаем оценку в результат
      
      const from = dateRange.from as Date | undefined;
      const to = dateRange.to as Date | undefined;
      
      if (from && to) {
        return isWithinInterval(gradeDate, {
          start: from,
          end: to
        });
      }
      return true;
    });
  }, [allGrades, dateRange]);

  // Фильтруем оценки по выбранному предмету и периоду
  const filteredGrades = useMemo(() => {
    if (!selectedSubjectId || selectedSubjectId === 'all') return gradesInDateRange;
    return gradesInDateRange.filter(grade => grade.subjectId === selectedSubjectId);
  }, [gradesInDateRange, selectedSubjectId]);

  // Получаем детальный расчет среднего балла студента по предмету через API
  const { data: averages = {}, isError, error } = useQuery<Record<string, Record<string, { average: string, percentage: string }>>>({
    queryKey: ["/api/student-subject-averages", classId, dateRange],
    queryFn: async () => {
      try {
        // Преобразуем даты в строки для запроса
        const fromDate = dateRange.from ? format(dateRange.from, 'yyyy-MM-dd') : '';
        const toDate = dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : '';
        
        // Получаем средние баллы через API, чтобы использовать серверную логику расчета
        const res = await apiRequest(`/api/student-subject-averages?classId=${classId}&fromDate=${fromDate}&toDate=${toDate}`, "GET");
        
        if (!res.ok) {
          // Обрабатываем ошибку ответа
          const errorData = await res.json();
          console.error("Ошибка API при запросе средних баллов:", {
            status: res.status, 
            statusText: res.statusText,
            errorData
          });
          throw new Error(`Ошибка API: ${res.status} ${res.statusText} - ${errorData.message || 'Неизвестная ошибка'}`);
        }
        
        console.log("Ответ API при запросе средних баллов:", { status: res.status, statusText: res.statusText });
        const data = await res.json();
        console.log("Полученные средние баллы:", data);
        return data;
      } catch (error) {
        console.error("Ошибка при получении средних баллов:", error);
        // Пробрасываем ошибку, чтобы React Query мог её обработать
        throw error;
      }
    },
    enabled: !!classId && !!dateRange.from && !!dateRange.to,
    retry: 1, // Ограничиваем количество повторных запросов
  });
  
  // Отображаем ошибку, если запрос не удался
  useEffect(() => {
    if (isError) {
      toast({
        title: "Ошибка при загрузке данных",
        description: `Не удалось получить средние баллы: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        variant: "destructive",
      });
    }
  }, [isError, error, toast]);
  
  // Рассчитываем средний балл ученика по выбранному предмету в выбранном периоде
  const calculateSubjectAverage = (studentId: number, subjectId: number) => {
    // Проверяем, есть ли данные от API
    if (averages[studentId.toString()] && averages[studentId.toString()][subjectId.toString()]) {
      const data = averages[studentId.toString()][subjectId.toString()];
      
      // Формат вывода зависит от системы оценивания класса
      if (classInfo?.gradingSystem === GradingSystemEnum.CUMULATIVE) {
        // Для накопительной системы выводим процент
        return `${data.percentage}`;
      }
      
      // Для 5-балльной системы выводим средний балл
      return data.average;
    }
    
    // Запасной вариант: выполняем расчет на стороне клиента, если API не вернуло данные
    const studentSubjectGrades = gradesInDateRange.filter(
      g => g.studentId === studentId && g.subjectId === subjectId
    );
    
    if (studentSubjectGrades.length === 0) return "-";
    
    const sum = studentSubjectGrades.reduce((total, grade) => total + grade.grade, 0);
    const average = sum / studentSubjectGrades.length;
    
    // Формат вывода зависит от системы оценивания класса
    if (classInfo?.gradingSystem === GradingSystemEnum.CUMULATIVE) {
      // Для накопительной системы выводим процент
      return `${Math.round(average * 10) / 10}%`;
    }
    
    // Для 5-балльной системы выводим средний балл с одним знаком после запятой
    return average.toFixed(1);
  };

  // Рассчитываем общий средний балл ученика по всем предметам в выбранном периоде
  const calculateStudentOverallAverage = (studentId: number) => {
    // Проверяем, есть ли данные от API (общий средний)
    if (averages[studentId.toString()] && averages[studentId.toString()]['overall']) {
      const data = averages[studentId.toString()]['overall'];
      
      // Формат вывода зависит от системы оценивания класса
      if (classInfo?.gradingSystem === GradingSystemEnum.CUMULATIVE) {
        // Для накопительной системы выводим процент
        return `${data.percentage}`;
      }
      
      // Для 5-балльной системы выводим средний балл
      return data.average;
    }
    
    // Запасной вариант: расчет на стороне клиента
    const studentGrades = gradesInDateRange.filter(g => g.studentId === studentId);
    
    if (studentGrades.length === 0) return "-";
    
    const sum = studentGrades.reduce((total, grade) => total + grade.grade, 0);
    const average = sum / studentGrades.length;
    
    // Формат вывода зависит от системы оценивания класса
    if (classInfo?.gradingSystem === GradingSystemEnum.CUMULATIVE) {
      // Для накопительной системы выводим процент
      return `${Math.round(average * 10) / 10}%`;
    }
    
    // Для 5-балльной системы выводим средний балл с одним знаком после запятой
    return average.toFixed(1);
  };

  // Получаем уникальные предметы, по которым есть оценки
  const subjectsWithGrades = useMemo(() => {
    const subjectIds = Array.from(new Set(allGrades.map(g => g.subjectId)));
    return subjects.filter(subject => subjectIds.includes(subject.id));
  }, [allGrades, subjects]);

  if (!user || !hasClassTeacherAccess()) {
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
                {classInfo.gradingSystem && (
                  <> • Система оценивания: {classInfo.gradingSystem === GradingSystemEnum.CUMULATIVE ? 'накопительная' : 
                                           'пятибалльная'}</>
                )}
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 min-w-[180px]">
            <div className="w-full sm:w-auto">
              <Label htmlFor="date-range" className="mb-1 block">Период</Label>
              <DateRangePicker 
                dateRange={dateRange}
                onDateRangeChange={setDateRange}
              />
            </div>
            <div>
              <Label htmlFor="subject-select" className="mb-1 block">Предмет</Label>
              <Select
                value={selectedSubjectId?.toString() || ""}
                onValueChange={(value) => {
                  if (value === 'all') {
                    setSelectedSubjectId('all');
                  } else if (value) {
                    setSelectedSubjectId(parseInt(value));
                  } else {
                    setSelectedSubjectId(null);
                  }
                }}
              >
                <SelectTrigger id="subject-select" className="w-[180px]">
                  <SelectValue placeholder="Выберите предмет" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все предметы</SelectItem>
                  {subjects.map((subject) => (
                    <SelectItem key={subject.id} value={subject.id.toString()}>
                      {subject.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
            {selectedSubjectId && selectedSubjectId !== 'all' ? (
              // Отображение оценок для выбранного предмета
              <Card>
                <CardHeader>
                  <CardTitle>
                    Оценки по предмету: {typeof selectedSubjectId === 'number' ? subjects.find(s => s.id === selectedSubjectId)?.name : ''}
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
                                {typeof selectedSubjectId === 'number' ? calculateSubjectAverage(student.id, selectedSubjectId) : "-"}
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