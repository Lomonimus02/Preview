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
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, subMonths, isSameDay, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  Calculator, 
  Book, 
  BookOpen, 
  Info,
  Award,
  BarChart,
  Percent 
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
  CardDescription,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Progress
} from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  // Период отображения: "неделя", "месяц", "семестр", "год"
  const [displayPeriod, setDisplayPeriod] = useState<'week' | 'month' | 'semester' | 'year'>('month');
  
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
    queryKey: ['/api/assignments', studentClass && studentClass.length > 0 ? studentClass[0].id : null],
    queryFn: async ({ queryKey }) => {
      const classId = queryKey[1];
      if (!classId) return [];
      const response = await fetch(`/api/assignments?classId=${classId}`);
      if (!response.ok) throw new Error('Failed to fetch assignments');
      return response.json();
    },
    enabled: !!user && user.role === UserRoleEnum.STUDENT && studentClass && studentClass.length > 0
  });
  
  // Определяем систему оценивания класса
  const gradingSystem = useMemo(() => {
    if (studentClass && studentClass.length > 0) {
      return studentClass[0].gradingSystem;
    }
    return GradingSystemEnum.FIVE_POINT; // По умолчанию пятибалльная система
  }, [studentClass]);
  
  // Получаем начало и конец периода просмотра в зависимости от выбранного периода
  const { startDate, endDate, periodLabel } = useMemo(() => {
    if (displayPeriod === 'week') {
      const start = startOfWeek(currentMonth, { weekStartsOn: 1 }); // Неделя начинается с понедельника
      const end = endOfWeek(currentMonth, { weekStartsOn: 1 });
      return { 
        startDate: start, 
        endDate: end,
        periodLabel: `${format(start, 'dd.MM.yyyy')} - ${format(end, 'dd.MM.yyyy')}` 
      };
    } else if (displayPeriod === 'month') {
      const start = startOfMonth(currentMonth);
      const end = endOfMonth(currentMonth);
      return { 
        startDate: start, 
        endDate: end,
        periodLabel: format(currentMonth, 'LLLL yyyy', { locale: ru }) 
      };
    } else if (displayPeriod === 'semester') {
      // Примерное определение семестра (первый: сентябрь-декабрь, второй: январь-май)
      const currentYear = currentMonth.getFullYear();
      const currentMonthNum = currentMonth.getMonth();
      
      let start, end;
      if (currentMonthNum >= 8 && currentMonthNum <= 11) { // Сентябрь-Декабрь
        start = new Date(currentYear, 8, 1); // 1 сентября
        end = new Date(currentYear, 11, 31); // 31 декабря
        return { 
          startDate: start, 
          endDate: end,
          periodLabel: `I семестр (сент.-дек. ${currentYear})` 
        };
      } else if (currentMonthNum >= 0 && currentMonthNum <= 4) { // Январь-Май
        start = new Date(currentYear, 0, 1); // 1 января
        end = new Date(currentYear, 4, 31); // 31 мая
        return { 
          startDate: start, 
          endDate: end,
          periodLabel: `II семестр (янв.-май ${currentYear})` 
        };
      } else { // Летние месяцы
        start = new Date(currentYear, 5, 1); // 1 июня
        end = new Date(currentYear, 7, 31); // 31 августа
        return { 
          startDate: start, 
          endDate: end,
          periodLabel: `Летний период (июнь-авг. ${currentYear})` 
        };
      }
    } else { // год
      const start = new Date(currentMonth.getFullYear(), 0, 1); // 1 января текущего года
      const end = new Date(currentMonth.getFullYear(), 11, 31); // 31 декабря текущего года
      return { 
        startDate: start, 
        endDate: end,
        periodLabel: `${currentMonth.getFullYear()} год` 
      };
    }
  }, [currentMonth, displayPeriod]);
  
  // Определяем дни текущего периода
  const daysInPeriod = useMemo(() => {
    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [startDate, endDate]);
  
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
  
  // Функция для отображения оценок для конкретного предмета/подгруппы и даты
  const renderGradeCell = (subject: any, date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    // Получаем ID предмета и подгруппы из customId или из объекта предмета
    const subjectKey = subject.customId || `${subject.id}`;
    const [subjectId, subgroupId] = typeof subjectKey === 'string' 
      ? subjectKey.split('-').map(id => id ? parseInt(id) : null) 
      : [subject.id, subject.subgroupId];
    
    // Получаем все оценки для указанного предмета и даты
    const cellGrades = grades.filter(grade => {
      // Проверяем предмет и дату
      if (grade.subjectId !== subjectId) return false;
      
      // Проверяем соответствие дате
      const gradeDate = new Date(grade.createdAt);
      const gradeStr = gradeDate.toISOString().split('T')[0];
      if (gradeStr !== dateStr) return false;
      
      // Проверяем подгруппу (если указана)
      if (subgroupId !== null) {
        return grade.subgroupId === subgroupId;
      }
      
      // Если подгруппа не указана в ключе, включаем только оценки без подгрупп
      return !grade.subgroupId;
    });
    
    if (cellGrades.length === 0) {
      return null;
    }
    
    return (
      <div className="flex flex-wrap gap-1 justify-center">
        {cellGrades.map((grade) => {
          // Определяем, связано ли с заданием
          const assignment = assignments.find(a => a.scheduleId === grade.scheduleId);
          const hasAssignment = !!assignment;
          
          // Определяем цвет в зависимости от типа задания или оценки
          const getColorClass = () => {
            if (hasAssignment) {
              return assignmentTypeColors[assignment.assignmentType] || 'bg-primary-100 text-primary-800 hover:bg-primary-200';
            } else if (grade.gradeType && gradeTypeColors[grade.gradeType]) {
              return gradeTypeColors[grade.gradeType];
            } else {
              return grade.grade >= 4 
                ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                : grade.grade >= 3 
                  ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' 
                  : 'bg-red-100 text-red-800 hover:bg-red-200';
            }
          };
          
          return (
            <span 
              key={grade.id}
              onClick={() => handleGradeClick(grade, assignment || null)}
              className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium cursor-pointer ${getColorClass()}`}
              title={hasAssignment ? getAssignmentTypeName(assignment.assignmentType) : (grade.gradeType ? getGradeTypeName(grade.gradeType) : "")}
            >
              {grade.grade}
              {hasAssignment && (
                <span className="w-1 h-1 ml-1 rounded-full bg-current"></span>
              )}
            </span>
          );
        })}
      </div>
    );
  };
  
  // Обработчик клика по оценке
  const handleGradeClick = (grade: Grade, assignment: Assignment | null) => {
    setSelectedGrade(grade);
    setSelectedAssignment(assignment);
    setIsGradeDialogOpen(true);
  };
  
  // Расчет среднего балла по предмету или предмету+подгруппе
  const calculateAverageForSubject = (subject: any) => {
    // Получаем ID предмета и подгруппы из customId или из объекта предмета
    const subjectKey = typeof subject === 'string' ? subject : (subject.customId || `${subject.id}`);
    const [subjectId, subgroupId] = typeof subjectKey === 'string' 
      ? subjectKey.split('-').map(id => id ? parseInt(id) : null) 
      : [subject.id, subject.subgroupId];
    
    // Фильтруем оценки по предмету и подгруппе (если указана)
    const subjectGrades = grades.filter(g => {
      if (g.subjectId !== subjectId) return false;
      
      // Если указана подгруппа, проверяем соответствие
      if (subgroupId !== null) {
        return g.subgroupId === subgroupId;
      }
      
      // Если подгруппа не указана в ключе, включаем только оценки без подгрупп
      return !g.subgroupId;
    });
    
    if (subjectGrades.length === 0) return "-";
    
    // Для накопительной системы оценивания рассчитываем процентное соотношение суммы полученных баллов к сумме максимально возможных
    if (gradingSystem === GradingSystemEnum.CUMULATIVE) {
      // Получаем оценки, у которых есть связь с заданиями
      const gradesWithAssignments = subjectGrades.filter(g => g.scheduleId);
      
      // Рассчитываем процент успеваемости на основе заданий
      let totalEarnedPoints = 0;
      let totalMaxPoints = 0;
      
      // Обрабатываем оценки, связанные с заданиями
      gradesWithAssignments.forEach(grade => {
        const relatedAssignment = assignments.find(a => a.scheduleId === grade.scheduleId);
        
        if (relatedAssignment) {
          totalEarnedPoints += grade.grade;
          totalMaxPoints += parseFloat(relatedAssignment.maxScore.toString());
        }
      });
      
      // Обрабатываем оценки без связи с заданиями (если есть)
      const gradesWithoutAssignments = subjectGrades.filter(g => !g.scheduleId || !assignments.some(a => a.scheduleId === g.scheduleId));
      if (gradesWithoutAssignments.length > 0) {
        // Примечание: оценки без связи с заданиями не участвуют в расчете процентного соотношения,
        // так как для них нет информации о максимальном балле
        console.log(`${gradesWithoutAssignments.length} оценок без связи с заданиями по предмету ${subjectId}`);
      }
      
      if (totalMaxPoints === 0) {
        // Если нет максимального балла, просто показываем средний балл
        if (subjectGrades.length > 0) {
          const sum = subjectGrades.reduce((acc, g) => acc + g.grade, 0);
          return (sum / subjectGrades.length).toFixed(1);
        }
        return "-";
      }
      
      // Вычисляем процент успеваемости (сумма полученных баллов / сумма максимальных баллов)
      const percentScore = (totalEarnedPoints / totalMaxPoints) * 100;
      return `${percentScore.toFixed(1)}%`;
    } else {
      // Для пятибалльной системы просто рассчитываем средний балл
      const sum = subjectGrades.reduce((acc, g) => acc + g.grade, 0);
      return (sum / subjectGrades.length).toFixed(1);
    }
  };
  
  // Получение цвета для среднего балла
  const getAverageGradeColor = (average: string) => {
    if (average === "-") return "";
    
    if (gradingSystem === GradingSystemEnum.CUMULATIVE) {
      // Для накопительной системы оцениваем процент
      const percent = parseFloat(average.replace('%', ''));
      
      if (percent >= 80) return "text-green-600";
      if (percent >= 60) return "text-yellow-600";
      return "text-red-600";
    } else {
      // Для пятибалльной системы оцениваем средний балл
      const avgGrade = parseFloat(average);
      
      if (avgGrade >= 4.5) return "text-green-600";
      if (avgGrade >= 3.5) return "text-green-500";
      if (avgGrade >= 2.5) return "text-yellow-600";
      return "text-red-600";
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
  
  // Получение названия предмета или подгруппы
  const getSubjectName = (subjectId: number, gradeSubgroupId?: number | null) => {
    // Если указана подгруппа, отображаем её название
    if (gradeSubgroupId) {
      const subgroup = studentSubgroups.find(sg => sg.id === gradeSubgroupId);
      if (subgroup) {
        const subject = subjects.find(s => s.id === subjectId);
        return `${subject?.name || `Предмет ${subjectId}`} (${subgroup.name})`;
      }
    }
    
    // Если подгруппа не указана, отображаем название предмета
    const subject = subjects.find(s => s.id === subjectId);
    return subject ? subject.name : `Предмет ${subjectId}`;
  };
  
  // Получаем предметы и подгруппы с оценками
  const subjectsWithGrades = useMemo(() => {
    // Создаем комбинации предмет+подгруппа
    const subjectSubgroupMap = new Map();
    
    grades.forEach(grade => {
      const key = grade.subgroupId 
        ? `${grade.subjectId}-${grade.subgroupId}` 
        : `${grade.subjectId}`;
      
      if (!subjectSubgroupMap.has(key)) {
        const subject = subjects.find(s => s.id === grade.subjectId);
        if (subject) {
          // Сохраняем копию предмета с информацией о подгруппе
          subjectSubgroupMap.set(key, {
            ...subject, 
            subgroupId: grade.subgroupId,
            // Используем customId для сравнения в дальнейшем
            customId: key
          });
        }
      }
    });
    
    return Array.from(subjectSubgroupMap.values());
  }, [grades, subjects]);
  
  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-heading font-bold text-gray-800">Оценки</h2>
        
        {/* Переключатели периодов */}
        <div className="flex items-center space-x-2">
          {/* Переключатель типа периода */}
          <Select value={displayPeriod} onValueChange={(value) => setDisplayPeriod(value as 'week' | 'month' | 'semester' | 'year')}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder="Период" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Неделя</SelectItem>
              <SelectItem value="month">Месяц</SelectItem>
              <SelectItem value="semester">Семестр</SelectItem>
              <SelectItem value="year">Учебный год</SelectItem>
            </SelectContent>
          </Select>
          
          {/* Навигация по периодам */}
          <div className="flex items-center space-x-2 border rounded-md p-1">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={goToPreviousMonth}
              className="h-7 w-7"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex items-center px-2">
              <Calendar className="mr-2 h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium">
                {periodLabel}
              </span>
            </div>
            
            <Button 
              variant="ghost" 
              size="icon"
              onClick={goToNextMonth}
              className="h-7 w-7"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
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
              <CardTitle>Успеваемость за {periodLabel}</CardTitle>
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
                        {daysInPeriod.map((day) => (
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
                        <TableHead className="text-center bg-gray-50 min-w-[80px] sticky right-0 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)]">
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
                          <TableCell className="font-medium sticky left-0 bg-white shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] z-10">
                            {subject.name}
                          </TableCell>
                          {daysInPeriod.map((day) => (
                            <TableCell key={day.toString()} className="text-center">
                              {renderGradeCell(subject.customId, day)}
                            </TableCell>
                          ))}
                          <TableCell className={`text-center bg-gray-50 font-semibold sticky right-0 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)] ${getAverageGradeColor(calculateAverageForSubject(subject.customId))}`}>
                            {calculateAverageForSubject(subject.customId)}
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
              <CardTitle>Список оценок за {periodLabel}</CardTitle>
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
                          return gradeDate >= startDate && gradeDate <= endDate;
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
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2 items-center">
                        <div className="bg-gray-50 p-3 rounded-lg text-center">
                          <div className="text-xs text-gray-500 mb-1">Получено</div>
                          <Badge className={`text-lg px-3 py-1 ${
                            (selectedGrade.grade / parseFloat(selectedAssignment.maxScore.toString())) >= 0.8 ? 'bg-green-100 text-green-800' : 
                            (selectedGrade.grade / parseFloat(selectedAssignment.maxScore.toString())) >= 0.6 ? 'bg-yellow-100 text-yellow-800' : 
                            'bg-red-100 text-red-800'
                          }`}>
                            {selectedGrade.grade}
                          </Badge>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg text-center">
                          <div className="text-xs text-gray-500 mb-1">Максимум</div>
                          <Badge variant="outline" className="text-lg px-3 py-1">
                            {selectedAssignment.maxScore}
                          </Badge>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg text-center">
                          <div className="text-xs text-gray-500 mb-1">Процент</div>
                          <Badge className={`text-lg px-3 py-1 ${
                            (selectedGrade.grade / parseFloat(selectedAssignment.maxScore.toString())) >= 0.8 ? 'bg-green-100 text-green-800' : 
                            (selectedGrade.grade / parseFloat(selectedAssignment.maxScore.toString())) >= 0.6 ? 'bg-yellow-100 text-yellow-800' : 
                            'bg-red-100 text-red-800'
                          }`}>
                            {((selectedGrade.grade / parseFloat(selectedAssignment.maxScore.toString())) * 100).toFixed(1)}%
                          </Badge>
                        </div>
                      </div>
                      
                      {/* Индикатор прогресса */}
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div 
                          className={`h-3 rounded-full ${
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