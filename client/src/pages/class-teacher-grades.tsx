import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/main-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import { UserRoleEnum } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { DateRange } from "react-day-picker";
import { addMonths, format, parse, isValid } from "date-fns";
import { ru } from "date-fns/locale";
import { DateRangePicker } from "@/components/ui/date-range-picker";

type Period = "month" | "quarter" | "semester" | "year" | "custom";

type StudentGrade = {
  studentId: number;
  firstName: string;
  lastName: string;
  averageGrade: number;
};

export default function ClassTeacherGrades() {
  const { user } = useAuth();
  const { isClassTeacher } = useRoleCheck();
  const [period, setPeriod] = useState<Period>("month");
  const [classId, setClassId] = useState<number | null>(null);
  const [studentGrades, setStudentGrades] = useState<StudentGrade[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(),
    to: addMonths(new Date(), 1)
  });

  // Получаем роли пользователя, чтобы найти привязанный класс
  const { data: userRoles = [] } = useQuery({
    queryKey: ["/api/user-roles", user?.id],
    queryFn: async () => {
      const res = await apiRequest(`/api/user-roles/${user?.id}`, "GET");
      if (!res.ok) throw new Error("Не удалось загрузить роли пользователя");
      return res.json();
    },
    enabled: !!user && isClassTeacher(),
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
  const { data: classInfo } = useQuery({
    queryKey: ["/api/classes", classId],
    queryFn: async () => {
      const res = await apiRequest(`/api/classes/${classId}`, "GET");
      if (!res.ok) throw new Error("Не удалось загрузить информацию о классе");
      return res.json();
    },
    enabled: !!classId,
  });

  // Получаем список учеников класса
  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["/api/students-by-class", classId],
    queryFn: async () => {
      const res = await apiRequest(`/api/students-by-class/${classId}`, "GET");
      if (!res.ok) throw new Error("Не удалось загрузить список учеников");
      return res.json();
    },
    enabled: !!classId,
  });

  // Получаем все оценки для класса
  const { data: classGrades = [], isLoading: gradesLoading } = useQuery({
    queryKey: ["/api/grades-by-class", classId],
    queryFn: async () => {
      const res = await apiRequest(`/api/grades-by-class/${classId}`, "GET");
      if (!res.ok) throw new Error("Не удалось загрузить оценки класса");
      return res.json();
    },
    enabled: !!classId,
  });

  // Обработчик изменения периода
  const handlePeriodChange = (value: string) => {
    const newPeriod = value as Period;
    setPeriod(newPeriod);
    
    const now = new Date();
    let newDateRange: DateRange | undefined;
    
    // Устанавливаем диапазон дат в зависимости от выбранного периода
    switch (newPeriod) {
      case "month":
        newDateRange = {
          from: new Date(now.getFullYear(), now.getMonth(), 1),
          to: new Date(now.getFullYear(), now.getMonth() + 1, 0)
        };
        break;
      case "quarter":
        // Определяем текущий квартал
        const currentQuarter = Math.floor(now.getMonth() / 3);
        newDateRange = {
          from: new Date(now.getFullYear(), currentQuarter * 3, 1),
          to: new Date(now.getFullYear(), currentQuarter * 3 + 3, 0)
        };
        break;
      case "semester":
        // Определяем текущий семестр (1-й: сентябрь-январь, 2-й: февраль-июнь)
        const isSemester1 = now.getMonth() >= 8 || now.getMonth() <= 0; // Сентябрь-Январь
        if (isSemester1) {
          newDateRange = {
            from: new Date(now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1, 8, 1), // 1 сентября
            to: new Date(now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear(), 0, 31) // 31 января
          };
        } else {
          newDateRange = {
            from: new Date(now.getFullYear(), 1, 1), // 1 февраля
            to: new Date(now.getFullYear(), 5, 30) // 30 июня
          };
        }
        break;
      case "year":
        // Учебный год (с 1 сентября по 30 июня)
        if (now.getMonth() >= 8) { // Если сейчас после сентября, учебный год с сентября текущего по июнь следующего
          newDateRange = {
            from: new Date(now.getFullYear(), 8, 1), // 1 сентября текущего года
            to: new Date(now.getFullYear() + 1, 5, 30) // 30 июня следующего года
          };
        } else { // Если сейчас до сентября, учебный год с сентября прошлого по июнь текущего
          newDateRange = {
            from: new Date(now.getFullYear() - 1, 8, 1), // 1 сентября прошлого года
            to: new Date(now.getFullYear(), 5, 30) // 30 июня текущего года
          };
        }
        break;
      case "custom":
        // Сохраняем текущий выбранный диапазон
        newDateRange = dateRange;
        break;
    }
    
    setDateRange(newDateRange);
  };

  // Рассчитываем средние оценки для учеников
  useEffect(() => {
    if (students.length > 0 && classGrades.length > 0 && dateRange?.from && dateRange?.to) {
      // Форматируем даты для отладки
      const fromStr = format(dateRange.from, 'yyyy-MM-dd');
      const toStr = dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : 'none';
      console.log(`Расчет средних оценок для периода: ${fromStr} - ${toStr}`);

      // Фильтруем оценки по выбранному периоду
      const filteredGrades = classGrades.filter((grade: any) => {
        // Проверяем, есть ли у оценки дата из расписания или дата создания
        let gradeDate: Date | null = null;
        
        // Если есть расписание, берем дату из него
        if (grade.schedule && grade.schedule.scheduleDate) {
          const dateStr = grade.schedule.scheduleDate;
          gradeDate = parse(dateStr, 'yyyy-MM-dd', new Date());
        } else {
          // Иначе используем дату создания оценки
          if (grade.createdAt) {
            gradeDate = new Date(grade.createdAt);
          }
        }
        
        // Если дату определить не удалось, пропускаем оценку
        if (!gradeDate || !isValid(gradeDate)) return false;
        
        // Проверяем, попадает ли дата в выбранный диапазон
        return gradeDate >= dateRange.from && 
               (!dateRange.to || gradeDate <= dateRange.to);
      });
      
      console.log(`Отфильтровано ${filteredGrades.length} оценок из ${classGrades.length}`);

      // Рассчитываем средние оценки для каждого ученика
      const grades: StudentGrade[] = students.map((student: any) => {
        // Фильтруем оценки для конкретного ученика
        const studentGrades = filteredGrades.filter((grade: any) => 
          grade.studentId === student.id
        );
        
        // Если есть оценки, вычисляем среднее
        const sum = studentGrades.reduce((acc: number, grade: any) => acc + grade.grade, 0);
        const average = studentGrades.length > 0 ? sum / studentGrades.length : 0;
        
        return {
          studentId: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          averageGrade: Number(average.toFixed(2))
        };
      });

      // Сортируем учеников по фамилии
      grades.sort((a, b) => a.lastName.localeCompare(b.lastName));
      
      setStudentGrades(grades);
    } else {
      setStudentGrades([]);
    }
  }, [students, classGrades, dateRange]);

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

  const isLoading = studentsLoading || gradesLoading;

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">Журнал успеваемости класса</h1>
        
        {classInfo && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold">
              Класс: {classInfo.name}
            </h2>
          </div>
        )}
        
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Параметры отображения</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <div>
              <Label htmlFor="period">Период</Label>
              <Select 
                value={period} 
                onValueChange={handlePeriodChange}
              >
                <SelectTrigger id="period">
                  <SelectValue placeholder="Выберите период" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Месяц</SelectItem>
                  <SelectItem value="quarter">Четверть</SelectItem>
                  <SelectItem value="semester">Семестр</SelectItem>
                  <SelectItem value="year">Учебный год</SelectItem>
                  <SelectItem value="custom">Произвольный период</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {period === "custom" && (
              <div>
                <Label>Выберите диапазон дат</Label>
                <DateRangePicker 
                  value={dateRange}
                  onChange={setDateRange}
                  locale={ru}
                  className="mt-1.5"
                />
              </div>
            )}
          </CardContent>
        </Card>
        
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
            <span>Загрузка данных...</span>
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>
                Средний балл учеников
                {dateRange?.from && (
                  <span className="text-base font-normal ml-2">
                    {format(dateRange.from, 'dd.MM.yyyy', { locale: ru })}
                    {dateRange.to && ` — ${format(dateRange.to, 'dd.MM.yyyy', { locale: ru })}`}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {studentGrades.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>№</TableHead>
                      <TableHead>Фамилия</TableHead>
                      <TableHead>Имя</TableHead>
                      <TableHead className="text-right">Средний балл</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {studentGrades.map((student, index) => (
                      <TableRow key={student.studentId}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell>{student.lastName}</TableCell>
                        <TableCell>{student.firstName}</TableCell>
                        <TableCell className="text-right">
                          <span 
                            className={`font-medium ${
                              student.averageGrade > 4.5 ? 'text-green-600' :
                              student.averageGrade > 3.5 ? 'text-blue-600' :
                              student.averageGrade > 2.5 ? 'text-orange-500' :
                              'text-red-600'
                            }`}
                          >
                            {student.averageGrade > 0 ? student.averageGrade : '—'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  {students.length > 0 
                    ? "Нет оценок за выбранный период" 
                    : "Нет учеников в классе"}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}