import { useState, useEffect } from "react";
import { Link } from "wouter";
import { MainLayout } from "@/components/layout/main-layout";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import { UserRoleEnum, Grade, Class, Subject, User, Schedule } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, BookOpen, UserCheck, Calendar, Search, Filter } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";

// Тип для комбинации класс-предмет
interface ClassSubjectCombination {
  classId: number;
  className: string;
  subjectId: number;
  subjectName: string;
}

export default function TeacherClasses() {
  const { user } = useAuth();
  const { isTeacher } = useRoleCheck();
  const { toast } = useToast();
  const [selectedCombination, setSelectedCombination] = useState<ClassSubjectCombination | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<number | "all">("all");

  // Проверяем, что пользователь является учителем
  useEffect(() => {
    if (user && !isTeacher()) {
      toast({
        title: "Ошибка доступа",
        description: "Эта страница доступна только для учителей",
        variant: "destructive",
      });
    }
  }, [user, isTeacher, toast]);

  // Получаем расписания, в которых преподаватель ведет занятия
  const { data: schedules = [], isLoading: schedulesLoading } = useQuery<Schedule[]>({
    queryKey: ["/api/schedules", { teacherId: user?.id }],
    queryFn: async () => {
      const res = await apiRequest(`/api/schedules?teacherId=${user?.id}`, "GET");
      if (!res.ok) throw new Error("Не удалось загрузить расписание");
      return res.json();
    },
    enabled: !!user && isTeacher()
  });

  // Получаем список предметов, которые преподает учитель
  const { data: subjects = [], isLoading: subjectsLoading } = useQuery<Subject[]>({
    queryKey: ["/api/teacher-subjects", user?.id],
    queryFn: async () => {
      const res = await apiRequest(`/api/teacher-subjects/${user?.id}`, "GET");
      if (!res.ok) throw new Error("Не удалось загрузить предметы");
      return res.json();
    },
    enabled: !!user && isTeacher()
  });

  // Получаем список классов
  const { data: classes = [], isLoading: classesLoading } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
    enabled: !!user
  });

  // Получаем список студентов
  const { data: students = [], isLoading: studentsLoading } = useQuery<User[]>({
    queryKey: ["/api/users", { role: UserRoleEnum.STUDENT }],
    enabled: !!selectedCombination
  });

  // Получаем оценки
  const { data: grades = [], isLoading: gradesLoading } = useQuery<Grade[]>({
    queryKey: ["/api/grades"],
    enabled: !!user
  });

  // Создаем список уникальных комбинаций класс-предмет на основе расписания
  const classSubjectCombinations: ClassSubjectCombination[] = schedules
    .reduce((combinations, schedule) => {
      // Проверяем, что у расписания есть и класс, и предмет
      if (!schedule.classId || !schedule.subjectId) return combinations;

      // Найдем класс и предмет в соответствующих списках
      const classInfo = classes.find(c => c.id === schedule.classId);
      const subjectInfo = subjects.find(s => s.id === schedule.subjectId);

      // Если информация о классе или предмете не найдена, пропускаем
      if (!classInfo || !subjectInfo) return combinations;

      // Проверяем, есть ли уже такая комбинация в списке
      const existingCombination = combinations.find(
        c => c.classId === schedule.classId && c.subjectId === schedule.subjectId
      );

      // Если комбинации нет в списке, добавляем
      if (!existingCombination) {
        combinations.push({
          classId: schedule.classId,
          className: classInfo.name,
          subjectId: schedule.subjectId,
          subjectName: subjectInfo.name
        });
      }

      return combinations;
    }, [] as ClassSubjectCombination[]);

  // Фильтруем студентов на основе выбранного класса
  const classStudents = students.filter(student => {
    // Если нет выбранной комбинации, показываем всех студентов
    if (!selectedCombination) return true;
    
    // Проверяем, что у студента есть расписание с этим классом
    const hasClassSchedule = schedules.some(schedule => 
      schedule.classId === selectedCombination.classId
    );
    
    return hasClassSchedule;
  });

  // Фильтруем оценки на основе выбранной комбинации класс-предмет и студента
  const filteredGrades = grades.filter(grade => {
    if (!selectedCombination) return false;
    
    const combinationMatches = 
      grade.classId === selectedCombination.classId && 
      grade.subjectId === selectedCombination.subjectId;
    
    const studentMatches = selectedStudentId === "all" || grade.studentId === selectedStudentId;
    
    // Поиск по комментарию
    const commentMatches = !searchQuery || 
      (grade.comment && grade.comment.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return combinationMatches && studentMatches && (searchQuery === "" || commentMatches);
  });

  // Вспомогательные функции для получения имен
  const getStudentName = (id: number) => {
    const student = students.find(u => u.id === id);
    return student ? `${student.lastName} ${student.firstName}` : `Ученик ${id}`;
  };

  const getGradeTypeName = (type: string) => {
    const types = {
      "homework": "Домашнее задание",
      "classwork": "Классная работа",
      "test": "Тест",
      "exam": "Экзамен",
      "project": "Проект",
    };
    return types[type as keyof typeof types] || type;
  };

  // Рассчитываем среднюю оценку
  const calculateAverage = () => {
    if (filteredGrades.length === 0) return 0;
    
    const sum = filteredGrades.reduce((acc, g) => acc + g.grade, 0);
    return (sum / filteredGrades.length).toFixed(1);
  };

  // Группируем оценки по студентам для построения сводной таблицы
  type StudentGradeSummary = {
    studentId: number;
    studentName: string;
    grades: Grade[];
    averageGrade: number;
  };

  const studentGradeSummaries: StudentGradeSummary[] = classStudents
    .map(student => {
      const studentGrades = filteredGrades.filter(g => g.studentId === student.id);
      
      // Рассчитываем среднюю оценку студента
      const averageGrade = studentGrades.length > 0
        ? studentGrades.reduce((sum, g) => sum + g.grade, 0) / studentGrades.length
        : 0;
      
      return {
        studentId: student.id,
        studentName: `${student.lastName} ${student.firstName}`,
        grades: studentGrades,
        averageGrade
      };
    })
    // Сортируем по фамилии
    .sort((a, b) => a.studentName.localeCompare(b.studentName));

  if (!user || !isTeacher()) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Ошибка доступа</AlertTitle>
            <AlertDescription>
              Эта страница доступна только для учителей.
            </AlertDescription>
          </Alert>
        </div>
      </MainLayout>
    );
  }

  if (schedulesLoading || subjectsLoading || classesLoading) {
    return (
      <MainLayout>
        <div className="container mx-auto px-4 py-6">
          <h2 className="text-2xl font-heading font-bold text-gray-800 mb-6">Мои классы</h2>
          <div className="flex items-center justify-center h-64">
            <p className="text-lg">Загрузка данных...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-6">
        <h2 className="text-2xl font-heading font-bold text-gray-800 mb-6">Мои классы</h2>
        
        {classSubjectCombinations.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Нет данных</AlertTitle>
            <AlertDescription>
              У вас пока нет назначенных классов или предметов. Обратитесь к администратору школы.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Выбор класса и предмета */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg">Выберите класс и предмет</CardTitle>
                <CardDescription>
                  Выберите комбинацию класса и предмета, чтобы просмотреть информацию
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Select
                  onValueChange={(value) => {
                    const [classId, subjectId] = value.split(':').map(Number);
                    const combination = classSubjectCombinations.find(
                      c => c.classId === classId && c.subjectId === subjectId
                    );
                    setSelectedCombination(combination || null);
                    // Сбрасываем другие фильтры при смене класса/предмета
                    setSelectedStudentId("all");
                    setSearchQuery("");
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Выберите класс и предмет" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Доступные классы и предметы</SelectLabel>
                      {classSubjectCombinations.map((combination) => (
                        <SelectItem 
                          key={`${combination.classId}:${combination.subjectId}`} 
                          value={`${combination.classId}:${combination.subjectId}`}
                        >
                          {combination.className} - {combination.subjectName}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
            
            {selectedCombination && (
              <>
                <div className="bg-gray-50 p-4 rounded-lg shadow-sm mb-6">
                  <h3 className="text-xl font-semibold mb-2">
                    {selectedCombination.className} - {selectedCombination.subjectName}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BookOpen className="h-4 w-4" />
                    <span>Предмет: {selectedCombination.subjectName}</span>
                    <Separator orientation="vertical" className="h-4" />
                    <UserCheck className="h-4 w-4" />
                    <span>Класс: {selectedCombination.className}</span>
                  </div>
                </div>
                
                <Tabs defaultValue="grades" className="w-full">
                  <TabsList className="mb-4">
                    <TabsTrigger value="grades">
                      Журнал оценок
                    </TabsTrigger>
                    <TabsTrigger value="summary">
                      Сводная таблица
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="grades">
                    {/* Фильтры и поиск */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                        <Input
                          placeholder="Поиск по комментарию..."
                          className="pl-10"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                      
                      <Select
                        value={selectedStudentId.toString()}
                        onValueChange={(value) => setSelectedStudentId(value === "all" ? "all" : parseInt(value))}
                      >
                        <SelectTrigger>
                          <div className="flex items-center">
                            <Filter className="h-4 w-4 mr-2" />
                            <SelectValue placeholder="Все ученики" />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Все ученики</SelectItem>
                          {classStudents.map((student) => (
                            <SelectItem key={student.id} value={student.id.toString()}>
                              {student.lastName} {student.firstName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      <div className="bg-white p-3 rounded-md shadow-sm flex items-center justify-between">
                        <span className="text-sm font-medium">Средний балл:</span>
                        <span className="text-lg font-semibold">{calculateAverage()}</span>
                      </div>
                    </div>
                    
                    {/* Таблица оценок */}
                    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Дата</TableHead>
                            <TableHead>Ученик</TableHead>
                            <TableHead>Тип</TableHead>
                            <TableHead>Оценка</TableHead>
                            <TableHead>Комментарий</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {gradesLoading ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-6">
                                Загрузка...
                              </TableCell>
                            </TableRow>
                          ) : filteredGrades.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center py-6">
                                Нет оценок для отображения
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredGrades.map((grade) => (
                              <TableRow key={grade.id}>
                                <TableCell>
                                  {new Date(grade.createdAt).toLocaleDateString('ru-RU')}
                                </TableCell>
                                <TableCell>{getStudentName(grade.studentId)}</TableCell>
                                <TableCell>{getGradeTypeName(grade.gradeType)}</TableCell>
                                <TableCell className="font-bold">
                                  <span className={`px-2 py-1 rounded-full ${
                                    grade.grade >= 4 ? 'bg-green-100 text-green-800' : 
                                    grade.grade >= 3 ? 'bg-yellow-100 text-yellow-800' : 
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {grade.grade}
                                  </span>
                                </TableCell>
                                <TableCell>{grade.comment || "-"}</TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    
                    <div className="mt-4 flex justify-end">
                      <Button asChild>
                        <Link href="/grades">Добавить оценку</Link>
                      </Button>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="summary">
                    {/* Сводная таблица по ученикам */}
                    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Ученик</TableHead>
                            <TableHead>Количество оценок</TableHead>
                            <TableHead>Средний балл</TableHead>
                            <TableHead>Действия</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {studentsLoading ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-6">
                                Загрузка...
                              </TableCell>
                            </TableRow>
                          ) : studentGradeSummaries.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-6">
                                Нет учеников для отображения
                              </TableCell>
                            </TableRow>
                          ) : (
                            studentGradeSummaries.map((summary) => (
                              <TableRow key={summary.studentId}>
                                <TableCell className="font-medium">{summary.studentName}</TableCell>
                                <TableCell>{summary.grades.length}</TableCell>
                                <TableCell>
                                  <div className={`px-2 py-1 rounded-full text-center w-12 ${
                                    summary.averageGrade >= 4 ? 'bg-green-100 text-green-800' : 
                                    summary.averageGrade >= 3 ? 'bg-yellow-100 text-yellow-800' : 
                                    summary.grades.length > 0 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-500'
                                  }`}>
                                    {summary.grades.length > 0 ? summary.averageGrade.toFixed(1) : '-'}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => setSelectedStudentId(summary.studentId)}
                                  >
                                    Подробно
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}