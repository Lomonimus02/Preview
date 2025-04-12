import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { useAuth } from "@/hooks/use-auth";
import { 
  UserRoleEnum, 
  Grade, 
  Subject, 
  Class, 
  GradingSystemEnum, 
  Assignment, 
  AssignmentTypeEnum, 
  Subgroup 
} from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths } from "date-fns";
import { ru } from "date-fns/locale";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  Calculator, 
  Book, 
  BookOpen, 
  Info 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

// Интерфейс для отображения оценок в гриде по дням
interface GradesByDate {
  [subjectId: number]: {
    [date: string]: {
      grades: Grade[];
      assignments?: Assignment[];
    }
  }
}

// Типы работ и их цвета
const assignmentTypeColors: Record<string, string> = {
  [AssignmentTypeEnum.CONTROL_WORK]: "bg-red-100 text-red-800 hover:bg-red-200",
  [AssignmentTypeEnum.TEST_WORK]: "bg-blue-100 text-blue-800 hover:bg-blue-200",
  [AssignmentTypeEnum.CURRENT_WORK]: "bg-green-100 text-green-800 hover:bg-green-200",
  [AssignmentTypeEnum.HOMEWORK]: "bg-amber-100 text-amber-800 hover:bg-amber-200",
  [AssignmentTypeEnum.CLASSWORK]: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200",
  [AssignmentTypeEnum.PROJECT_WORK]: "bg-purple-100 text-purple-800 hover:bg-purple-200",
  [AssignmentTypeEnum.CLASS_ASSIGNMENT]: "bg-indigo-100 text-indigo-800 hover:bg-indigo-200",
};

// Типы оценок и их цвета
const gradeTypeColors: Record<string, string> = {
  "homework": "bg-amber-100 text-amber-800",
  "classwork": "bg-green-100 text-green-800",
  "test": "bg-blue-100 text-blue-800",
  "exam": "bg-purple-100 text-purple-800",
  "project": "bg-indigo-100 text-indigo-800",
};

// Функция для получения названия типа задания
const getAssignmentTypeName = (type: string): string => {
  const types: Record<string, string> = {
    [AssignmentTypeEnum.CONTROL_WORK]: "Контрольная работа",
    [AssignmentTypeEnum.TEST_WORK]: "Проверочная работа",
    [AssignmentTypeEnum.CURRENT_WORK]: "Текущая работа",
    [AssignmentTypeEnum.HOMEWORK]: "Домашнее задание",
    [AssignmentTypeEnum.CLASSWORK]: "Работа на уроке",
    [AssignmentTypeEnum.PROJECT_WORK]: "Проект",
    [AssignmentTypeEnum.CLASS_ASSIGNMENT]: "Классная работа",
  };
  return types[type] || type;
};

// Функция для получения названия типа оценки
const getGradeTypeName = (type: string): string => {
  const types: Record<string, string> = {
    "homework": "Домашнее задание",
    "classwork": "Классная работа",
    "test": "Тест",
    "exam": "Экзамен",
    "project": "Проект",
  };
  return types[type] || type;
};

export default function StudentGrades() {
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [isGradeDialogOpen, setIsGradeDialogOpen] = useState(false);
  
  // Получение данных студента
  const { data: studentClass } = useQuery<Class[]>({
    queryKey: [`/api/student-classes?studentId=${user?.id}`],
    enabled: !!user && user.role === UserRoleEnum.STUDENT
  });
  
  // Получение предметов
  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ["/api/subjects"],
    enabled: !!user
  });
  
  // Получение подгрупп, в которых состоит ученик
  const { data: studentSubgroups = [] } = useQuery<Subgroup[]>({
    queryKey: ["/api/student-subgroups", { studentId: user?.id }],
    enabled: !!user && user.role === UserRoleEnum.STUDENT
  });
  
  // Получение оценок ученика
  const { data: grades = [], isLoading: gradesLoading } = useQuery<Grade[]>({
    queryKey: [`/api/grades?studentId=${user?.id}`],
    enabled: !!user && user.role === UserRoleEnum.STUDENT
  });
  
  // Получение заданий (для детальной информации об оценках)
  const { data: assignments = [] } = useQuery<Assignment[]>({
    queryKey: [`/api/assignments`],
    enabled: !!user && user.role === UserRoleEnum.STUDENT && studentClass && studentClass.length > 0
  });
  
  // Определяем систему оценивания класса
  const gradingSystem = useMemo(() => {
    if (studentClass && studentClass.length > 0) {
      return studentClass[0].gradingSystem;
    }
    return GradingSystemEnum.FIVE_POINT; // По умолчанию пятибалльная система
  }, [studentClass]);
  
  // Определяем дни текущего месяца
  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);
  
  // Группируем оценки по предметам и датам
  const gradesBySubjectAndDate: GradesByDate = useMemo(() => {
    const result: GradesByDate = {};
    
    // Создаем структуру для всех предметов
    subjects.forEach(subject => {
      result[subject.id] = {};
    });
    
    // Заполняем оценками
    grades.forEach(grade => {
      // Получаем дату в формате строки для использования как ключ
      const date = new Date(grade.createdAt).toISOString().split('T')[0];
      
      // Если нет такого предмета, создаем запись
      if (!result[grade.subjectId]) {
        result[grade.subjectId] = {};
      }
      
      // Если нет записи для этой даты, создаем
      if (!result[grade.subjectId][date]) {
        result[grade.subjectId][date] = { grades: [] };
      }
      
      // Добавляем оценку
      result[grade.subjectId][date].grades.push(grade);
      
      // Если оценка связана с заданием, добавляем информацию о задании
      if (grade.scheduleId) {
        const scheduleAssignments = assignments.filter(a => a.scheduleId === grade.scheduleId);
        if (scheduleAssignments.length > 0) {
          result[grade.subjectId][date].assignments = scheduleAssignments;
        }
      }
    });
    
    return result;
  }, [grades, subjects, assignments]);
  
  // Функция для отображения оценок для конкретного предмета и даты
  const renderGradeCell = (subjectId: number, date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    const cell = gradesBySubjectAndDate[subjectId]?.[dateStr];
    
    if (!cell || cell.grades.length === 0) {
      return null;
    }
    
    return (
      <div className="flex flex-wrap gap-1">
        {cell.grades.map((grade) => (
          <span 
            key={grade.id}
            onClick={() => handleGradeClick(grade, cell.assignments?.find(a => a.scheduleId === grade.scheduleId) || null)}
            className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium cursor-pointer ${
              grade.gradeType && gradeTypeColors[grade.gradeType] 
                ? gradeTypeColors[grade.gradeType] 
                : grade.grade >= 4 
                  ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                  : grade.grade >= 3 
                    ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' 
                    : 'bg-red-100 text-red-800 hover:bg-red-200'
            }`}
          >
            {grade.grade}
          </span>
        ))}
      </div>
    );
  };
  
  // Обработчик клика по оценке
  const handleGradeClick = (grade: Grade, assignment: Assignment | null) => {
    setSelectedGrade(grade);
    setSelectedAssignment(assignment);
    setIsGradeDialogOpen(true);
  };
  
  // Расчет среднего балла по предмету
  const calculateAverageForSubject = (subjectId: number) => {
    const subjectGrades = grades.filter(g => g.subjectId === subjectId);
    
    if (subjectGrades.length === 0) return "-";
    
    // Для накопительной системы оценивания рассчитываем средний процент
    if (gradingSystem === GradingSystemEnum.CUMULATIVE) {
      // Получаем оценки, у которых есть связь с заданиями
      const gradesWithAssignments = subjectGrades.filter(g => g.scheduleId);
      
      if (gradesWithAssignments.length === 0) {
        // Если нет связи с заданиями, отображаем обычный средний балл
        const sum = subjectGrades.reduce((acc, g) => acc + g.grade, 0);
        return (sum / subjectGrades.length).toFixed(1);
      }
      
      // Рассчитываем процент успеваемости на основе заданий
      let totalPoints = 0;
      let maxTotalPoints = 0;
      
      gradesWithAssignments.forEach(grade => {
        const relatedAssignment = assignments.find(a => a.scheduleId === grade.scheduleId);
        
        if (relatedAssignment) {
          totalPoints += grade.grade;
          maxTotalPoints += parseFloat(relatedAssignment.maxScore.toString());
        }
      });
      
      if (maxTotalPoints === 0) {
        // Если нет максимального балла, отображаем обычный средний балл
        const sum = subjectGrades.reduce((acc, g) => acc + g.grade, 0);
        return (sum / subjectGrades.length).toFixed(1);
      }
      
      // Вычисляем процент успеваемости
      const percentScore = (totalPoints / maxTotalPoints) * 100;
      return `${percentScore.toFixed(1)}%`;
    } else {
      // Для пятибалльной системы просто рассчитываем средний балл
      const sum = subjectGrades.reduce((acc, g) => acc + g.grade, 0);
      return (sum / subjectGrades.length).toFixed(1);
    }
  };
  
  // Переключение на предыдущий месяц
  const goToPreviousMonth = () => {
    setCurrentMonth(prevMonth => subMonths(prevMonth, 1));
  };
  
  // Переключение на следующий месяц
  const goToNextMonth = () => {
    setCurrentMonth(prevMonth => addMonths(prevMonth, 1));
  };
  
  // Получение названия предмета
  const getSubjectName = (subjectId: number) => {
    const subject = subjects.find(s => s.id === subjectId);
    return subject ? subject.name : `Предмет ${subjectId}`;
  };
  
  // Фильтруем предметы, по которым есть оценки
  const subjectsWithGrades = useMemo(() => {
    const subjectIds = [...new Set(grades.map(g => g.subjectId))];
    return subjects.filter(subject => subjectIds.includes(subject.id));
  }, [grades, subjects]);
  
  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-heading font-bold text-gray-800">Оценки</h2>
        
        {/* Переключатель месяца */}
        <div className="flex items-center space-x-4">
          <Button 
            variant="outline" 
            size="icon"
            onClick={goToPreviousMonth}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <div className="flex items-center">
            <Calendar className="mr-2 h-4 w-4 text-gray-500" />
            <span className="font-medium">
              {format(currentMonth, 'LLLL yyyy', { locale: ru })}
            </span>
          </div>
          
          <Button 
            variant="outline" 
            size="icon"
            onClick={goToNextMonth}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <Tabs defaultValue="table">
        <TabsList className="mb-6">
          <TabsTrigger value="table">
            <BookOpen className="h-4 w-4 mr-2" />
            Табличный вид
          </TabsTrigger>
          <TabsTrigger value="list">
            <Book className="h-4 w-4 mr-2" />
            Список оценок
          </TabsTrigger>
        </TabsList>
        
        {/* Табличный вид с оценками по дням */}
        <TabsContent value="table">
          <Card>
            <CardHeader>
              <CardTitle>Успеваемость за {format(currentMonth, 'LLLL yyyy', { locale: ru })}</CardTitle>
            </CardHeader>
            <CardContent>
              {gradesLoading ? (
                <div className="text-center py-10">Загрузка оценок...</div>
              ) : subjectsWithGrades.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  За выбранный период оценок нет
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="border">
                    <TableHeader className="sticky top-0 bg-white">
                      <TableRow>
                        <TableHead className="min-w-[180px] sticky left-0 bg-white z-10">Предмет</TableHead>
                        {daysInMonth.map((day) => (
                          <TableHead key={day.toString()} className="text-center min-w-[60px]">
                            <div className="flex flex-col items-center">
                              <div className="font-normal text-xs text-gray-500">
                                {format(day, 'E', { locale: ru })}
                              </div>
                              <div className="font-medium">
                                {format(day, 'dd', { locale: ru })}
                              </div>
                            </div>
                          </TableHead>
                        ))}
                        <TableHead className="text-center bg-gray-50 min-w-[80px]">
                          <div className="flex items-center justify-center">
                            <Calculator className="h-4 w-4 mr-1 text-gray-500" />
                            <span>Ср. балл</span>
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subjectsWithGrades.map((subject) => (
                        <TableRow key={subject.id}>
                          <TableCell className="font-medium sticky left-0 bg-white">
                            {subject.name}
                          </TableCell>
                          {daysInMonth.map((day) => (
                            <TableCell key={day.toString()} className="text-center">
                              {renderGradeCell(subject.id, day)}
                            </TableCell>
                          ))}
                          <TableCell className="text-center bg-gray-50 font-semibold">
                            {calculateAverageForSubject(subject.id)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Список всех оценок за период */}
        <TabsContent value="list">
          <Card>
            <CardHeader>
              <CardTitle>Список оценок за {format(currentMonth, 'LLLL yyyy', { locale: ru })}</CardTitle>
            </CardHeader>
            <CardContent>
              {gradesLoading ? (
                <div className="text-center py-10">Загрузка оценок...</div>
              ) : grades.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  За выбранный период оценок нет
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Дата</TableHead>
                        <TableHead>Предмет</TableHead>
                        <TableHead>Тип</TableHead>
                        <TableHead>Оценка</TableHead>
                        <TableHead>Комментарий</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grades
                        .filter(grade => {
                          const gradeDate = new Date(grade.createdAt);
                          const start = startOfMonth(currentMonth);
                          const end = endOfMonth(currentMonth);
                          return gradeDate >= start && gradeDate <= end;
                        })
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        .map(grade => {
                          const assignment = assignments.find(a => a.scheduleId === grade.scheduleId);
                          return (
                            <TableRow 
                              key={grade.id} 
                              className="cursor-pointer hover:bg-gray-50"
                              onClick={() => handleGradeClick(grade, assignment || null)}
                            >
                              <TableCell>
                                {format(new Date(grade.createdAt), 'dd.MM.yyyy')}
                              </TableCell>
                              <TableCell className="font-medium">
                                {getSubjectName(grade.subjectId)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`${
                                  grade.gradeType && gradeTypeColors[grade.gradeType] 
                                    ? gradeTypeColors[grade.gradeType] 
                                    : 'bg-gray-100'
                                }`}>
                                  {getGradeTypeName(grade.gradeType)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className={`${
                                  grade.grade >= 4 ? 'bg-green-100 text-green-800' : 
                                  grade.grade >= 3 ? 'bg-yellow-100 text-yellow-800' : 
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {grade.grade}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {grade.comment || "-"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Диалог для детальной информации об оценке */}
      <Dialog open={isGradeDialogOpen} onOpenChange={setIsGradeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Детали оценки</DialogTitle>
            <DialogDescription>
              Информация об оценке и связанном задании
            </DialogDescription>
          </DialogHeader>
          
          {selectedGrade && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-500">Предмет</div>
                  <div className="font-medium">{getSubjectName(selectedGrade.subjectId)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Дата</div>
                  <div className="font-medium">
                    {format(new Date(selectedGrade.createdAt), 'dd.MM.yyyy')}
                  </div>
                </div>
              </div>
              
              <div>
                <div className="text-sm text-gray-500">Тип работы</div>
                <Badge className={`${
                  selectedGrade.gradeType && gradeTypeColors[selectedGrade.gradeType] 
                    ? gradeTypeColors[selectedGrade.gradeType] 
                    : 'bg-gray-100'
                }`}>
                  {getGradeTypeName(selectedGrade.gradeType)}
                </Badge>
              </div>
              
              <div>
                <div className="text-sm text-gray-500">Оценка</div>
                <div className="mt-1 flex flex-col space-y-2">
                  {/* Отображение оценки для пятибалльной системы */}
                  {gradingSystem === GradingSystemEnum.FIVE_POINT && (
                    <Badge className={`text-lg px-3 py-1 ${
                      selectedGrade.grade >= 4 ? 'bg-green-100 text-green-800' : 
                      selectedGrade.grade >= 3 ? 'bg-yellow-100 text-yellow-800' : 
                      'bg-red-100 text-red-800'
                    }`}>
                      {selectedGrade.grade}
                    </Badge>
                  )}
                  
                  {/* Отображение для накопительной системы */}
                  {gradingSystem === GradingSystemEnum.CUMULATIVE && selectedAssignment && (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Badge className={`text-lg px-3 py-1 ${
                          (selectedGrade.grade / parseFloat(selectedAssignment.maxScore.toString())) >= 0.8 ? 'bg-green-100 text-green-800' : 
                          (selectedGrade.grade / parseFloat(selectedAssignment.maxScore.toString())) >= 0.6 ? 'bg-yellow-100 text-yellow-800' : 
                          'bg-red-100 text-red-800'
                        }`}>
                          {selectedGrade.grade}
                        </Badge>
                        <span className="text-gray-600">из {selectedAssignment.maxScore}</span>
                      </div>
                      
                      {/* Процентное соотношение */}
                      <div className="text-sm text-gray-700">
                        Процент выполнения: <span className="font-medium">
                          {((selectedGrade.grade / parseFloat(selectedAssignment.maxScore.toString())) * 100).toFixed(1)}%
                        </span>
                      </div>
                      
                      {/* Индикатор прогресса */}
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div 
                          className={`h-2.5 rounded-full ${
                            (selectedGrade.grade / parseFloat(selectedAssignment.maxScore.toString())) >= 0.8 ? 'bg-green-600' : 
                            (selectedGrade.grade / parseFloat(selectedAssignment.maxScore.toString())) >= 0.6 ? 'bg-yellow-500' : 
                            'bg-red-600'
                          }`}
                          style={{ width: `${(selectedGrade.grade / parseFloat(selectedAssignment.maxScore.toString())) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                  
                  {/* Для накопительной системы, но без связанного задания */}
                  {gradingSystem === GradingSystemEnum.CUMULATIVE && !selectedAssignment && (
                    <div>
                      <Badge className="text-lg px-3 py-1 bg-gray-100 text-gray-800">
                        {selectedGrade.grade}
                      </Badge>
                      <div className="mt-1 text-sm text-gray-500 italic">
                        Отсутствует информация о максимальном балле
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {selectedGrade.comment && (
                <div>
                  <div className="text-sm text-gray-500">Комментарий преподавателя</div>
                  <div className="p-3 bg-gray-50 rounded-md mt-1">
                    {selectedGrade.comment}
                  </div>
                </div>
              )}
              
              {selectedAssignment && (
                <div className="border-t pt-4 mt-4">
                  <div className="text-sm text-gray-500 mb-2 flex items-center">
                    <Info className="h-4 w-4 mr-1" />
                    <span>Информация о задании</span>
                  </div>
                  
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm text-gray-500">Тип задания</div>
                      <Badge className={assignmentTypeColors[selectedAssignment.assignmentType] || 'bg-gray-100'}>
                        {getAssignmentTypeName(selectedAssignment.assignmentType)}
                      </Badge>
                    </div>
                    
                    <div>
                      <div className="text-sm text-gray-500">Максимальный балл</div>
                      <div className="font-medium">{selectedAssignment.maxScore}</div>
                    </div>
                    
                    {selectedAssignment.description && (
                      <div>
                        <div className="text-sm text-gray-500">Описание задания</div>
                        <div className="p-3 bg-gray-50 rounded-md mt-1">
                          {selectedAssignment.description}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button onClick={() => setIsGradeDialogOpen(false)}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}