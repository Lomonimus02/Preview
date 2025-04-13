import { useState, useMemo, useEffect } from "react";
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

// Расширенный интерфейс для предмета с информацией о подгруппе и произвольным ID
interface ExtendedSubject extends Subject {
  subgroupId?: number | null;
  subgroupName?: string | null;
  customId?: string;
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
  // Определение типов четвертей и полугодий
  type QuarterType = 'quarter1' | 'quarter2' | 'quarter3' | 'quarter4' | 'semester1' | 'semester2' | 'year';
  
  // Период отображения: четверти, полугодия и год
  const [displayPeriod, setDisplayPeriod] = useState<QuarterType>('quarter1');
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  
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
    queryKey: ['/api/assignments', studentClass && studentClass.length > 0 ? studentClass[0].id : null, grades],
    queryFn: async ({ queryKey }) => {
      const classId = queryKey[1];
      if (!classId) return [];
      
      // Сначала загружаем все задания для класса
      const response = await fetch(`/api/assignments?classId=${classId}`);
      if (!response.ok) throw new Error('Failed to fetch assignments');
      const classAssignments = await response.json();
      
      // Для каждой оценки, которая ссылается на задание, но это задание не найдено в классе
      // делаем дополнительный запрос по конкретному assignmentId
      const allGrades = queryKey[2] as Grade[] || [];
      const assignmentIds = new Set<number>();
      
      // Получаем список ID заданий, которые присутствуют в оценках
      allGrades.forEach(grade => {
        if (grade.assignmentId) {
          assignmentIds.add(grade.assignmentId);
        }
      });
      
      // Проверяем, какие задания нужно дополнительно загрузить
      const missingAssignmentIds = Array.from(assignmentIds).filter(
        id => !classAssignments.some((a: Assignment) => a.id === id)
      );
      
      // Если есть отсутствующие задания, загружаем их
      if (missingAssignmentIds.length > 0) {
        const additionalAssignments = await Promise.all(
          missingAssignmentIds.map(async id => {
            try {
              const response = await fetch(`/api/assignments/${id}`);
              if (response.ok) {
                return await response.json();
              }
            } catch (error) {
              console.error(`Error fetching assignment ${id}:`, error);
            }
            return null;
          })
        );
        
        // Объединяем все задания, отфильтровывая null значения
        return [...classAssignments, ...additionalAssignments.filter(a => a !== null)];
      }
      
      return classAssignments;
    },
    enabled: !!user && user.role === UserRoleEnum.STUDENT && studentClass && studentClass.length > 0 && grades.length > 0
  });
  
  // Интерфейс для данных о средних оценках из журнала учителя
  interface SubjectAverage {
    average: string;
    percentage: string;
    maxScore?: string;
  }
  
  // Объект для хранения средних оценок по предметам из API
  const [subjectAverages, setSubjectAverages] = useState<Record<string, SubjectAverage>>({});
  
  // Эффект для предварительной загрузки средних оценок для всех предметов
  useEffect(() => {
    if (!user || user.role !== UserRoleEnum.STUDENT || !subjects.length) return;
    
    const fetchSubjectAverages = async () => {
      const averagesData: Record<string, SubjectAverage> = {};
      
      // Загружаем данные для всех предметов
      for (const subject of subjects) {
        try {
          const subjectId = subject.id;
          const cacheKey = subject.customId || `${subjectId}`;
          
          // Загружаем среднюю оценку для этого предмета
          const url = `/api/student-subject-average?studentId=${user.id}&subjectId=${subjectId}`;
          const response = await fetch(url);
          
          if (response.ok) {
            const data = await response.json();
            averagesData[cacheKey] = data;
          }
        } catch (error) {
          console.error(`Ошибка при загрузке средней оценки для предмета:`, error);
        }
      }
      
      // Обновляем состояние
      setSubjectAverages(prev => ({
        ...prev,
        ...averagesData
      }));
    };
    
    fetchSubjectAverages();
  }, [user, subjects]);
  
  // Определяем систему оценивания класса
  const gradingSystem = useMemo(() => {
    if (studentClass && studentClass.length > 0) {
      return studentClass[0].gradingSystem;
    }
    return GradingSystemEnum.FIVE_POINT; // По умолчанию пятибалльная система
  }, [studentClass]);
  
  // Получаем начало и конец периода просмотра в зависимости от выбранного периода
  const { startDate, endDate, periodLabel } = useMemo(() => {
    let start: Date;
    let end: Date;
    let label = '';
    
    // Функция для получения учебного года
    const getAcademicYear = (year: number) => {
      const currentMonth = new Date().getMonth();
      // Если текущий месяц сентябрь и позже, то учебный год начинается в текущем году
      // Иначе учебный год начался в предыдущем году
      return currentMonth >= 8 ? year : year - 1;
    };
    
    const academicYear = getAcademicYear(currentYear);
    
    switch (displayPeriod) {
      case 'quarter1': // 1 четверть: сентябрь - октябрь
        start = new Date(academicYear, 8, 1); // 1 сентября
        end = new Date(academicYear, 9, 31); // 31 октября
        label = `1 четверть (сентябрь - октябрь ${academicYear})`;
        break;
        
      case 'quarter2': // 2 четверть: ноябрь - декабрь
        start = new Date(academicYear, 10, 1); // 1 ноября
        end = new Date(academicYear, 11, 31); // 31 декабря
        label = `2 четверть (ноябрь - декабрь ${academicYear})`;
        break;
        
      case 'quarter3': // 3 четверть: январь - март
        start = new Date(academicYear + 1, 0, 1); // 1 января
        end = new Date(academicYear + 1, 2, 31); // 31 марта
        label = `3 четверть (январь - март ${academicYear + 1})`;
        break;
        
      case 'quarter4': // 4 четверть: апрель - июнь
        start = new Date(academicYear + 1, 3, 1); // 1 апреля
        end = new Date(academicYear + 1, 5, 30); // 30 июня
        label = `4 четверть (апрель - июнь ${academicYear + 1})`;
        break;
        
      case 'semester1': // 1 полугодие: сентябрь - декабрь
        start = new Date(academicYear, 8, 1); // 1 сентября
        end = new Date(academicYear, 11, 31); // 31 декабря
        label = `1 полугодие (сентябрь - декабрь ${academicYear})`;
        break;
        
      case 'semester2': // 2 полугодие: январь - июнь
        start = new Date(academicYear + 1, 0, 1); // 1 января
        end = new Date(academicYear + 1, 5, 30); // 30 июня
        label = `2 полугодие (январь - июнь ${academicYear + 1})`;
        break;
        
      case 'year': // Учебный год: сентябрь - июнь
        start = new Date(academicYear, 8, 1); // 1 сентября
        end = new Date(academicYear + 1, 5, 30); // 30 июня
        label = `Учебный год ${academicYear}-${academicYear + 1}`;
        break;
        
      default:
        start = new Date(academicYear, 8, 1);
        end = new Date(academicYear, 9, 31);
        label = `1 четверть (сентябрь - октябрь ${academicYear})`;
    }
    
    return { 
      startDate: start, 
      endDate: end, 
      periodLabel: label 
    };
  }, [currentYear, displayPeriod]);
  
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
    
    // Получаем ID предмета и подгруппы из customId, строки или из объекта предмета
    let subjectId, subgroupId;
    
    if (typeof subject === 'string') {
      // Если передан customId в виде строки (subjectId-subgroupId)
      [subjectId, subgroupId] = subject.split('-').map(id => id ? parseInt(id) : null);
    } else {
      // Если передан объект
      subjectId = subject.id;
      subgroupId = subject.subgroupId || null;
    }
    
    // Вначале найдем расписание на эту дату для данного предмета (и, возможно, подгруппы)
    // Это нужно, чтобы привязать оценки только к конкретным урокам
    const scheduleForDate = (() => {
      const scheduleDate = date.toISOString().split('T')[0];
      
      // Возможная проблема: в assignments нет scheduleDate, нужно получить его из schedules
      // Получим из API-запроса к /api/schedules
      // Для наших целей можем взять scheduleId из assignment и проверить, привязан ли он к нужной дате
      
      // Для каждого assignment найдем оценки, которые имеют scheduleId для урока на эту дату
      return grades
        .filter(g => {
          // Проверяем, что оценка относится к текущему предмету
          if (g.subjectId !== subjectId) return false;
          
          // Проверяем, что дата оценки совпадает с выбранной датой
          const gradeDate = new Date(g.createdAt);
          const gradeStr = gradeDate.toISOString().split('T')[0];
          if (gradeStr !== scheduleDate) return false;
          
          // Проверяем, что подгруппа совпадает (если указана)
          if (subgroupId !== null && g.subgroupId !== subgroupId) return false;
          if (subgroupId === null && g.subgroupId) return false;
          
          // Считаем, что эта оценка относится к нужному уроку
          return g.scheduleId !== null && g.scheduleId !== undefined;
        })
        .map(g => g.scheduleId)
        .filter((id): id is number => id !== null && id !== undefined);
    })();
    
    // Получаем оценки для указанного предмета и даты, с учетом расписания
    const cellGrades = grades.filter(grade => {
      // Проверяем предмет
      if (grade.subjectId !== subjectId) return false;
      
      // Проверяем соответствие дате
      const gradeDate = new Date(grade.createdAt);
      const gradeStr = gradeDate.toISOString().split('T')[0];
      if (gradeStr !== dateStr) return false;
      
      // Проверяем подгруппу (если указана)
      if (subgroupId !== null && grade.subgroupId !== subgroupId) {
        return false;
      } else if (subgroupId === null && grade.subgroupId) {
        return false;
      }
      
      // Если найдены расписания на эту дату, показываем только оценки с соответствующим scheduleId
      if (scheduleForDate.length > 0 && grade.scheduleId) {
        return scheduleForDate.includes(grade.scheduleId);
      }
      
      return true; // Показываем оценки без привязки к расписанию, если расписание не найдено
    });
    
    if (cellGrades.length === 0) {
      return null;
    }
    
    return (
      <div className="flex flex-wrap gap-1 justify-center">
        {cellGrades.map((grade) => {
          // Определяем, связано ли с заданием
          let assignment = null;
          
          // Сначала проверяем по assignmentId (если есть)
          if (grade.assignmentId) {
            assignment = assignments.find(a => a.id === grade.assignmentId);
          }
          
          // Если assignmentId не задан или не найден, ищем по scheduleId
          if (!assignment && grade.scheduleId) {
            assignment = assignments.find(a => a.scheduleId === grade.scheduleId);
          }
          
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
  const handleGradeClick = async (grade: Grade, initialAssignment: Assignment | null) => {
    console.log("Grade clicked:", grade);
    
    // Ищем соответствующее задание, приоритет assignmentId, затем scheduleId
    let assignment = initialAssignment;
    
    // Если не передано задание, но есть assignmentId в оценке, найдем задание
    if (!assignment && grade.assignmentId) {
      // Сначала ищем в локальном кэше
      assignment = assignments.find(a => a.id === grade.assignmentId) || null;
      
      // Если не нашли в кэше, делаем прямой запрос к API
      if (!assignment) {
        try {
          console.log(`Trying to load assignment directly by ID: ${grade.assignmentId}`);
          const response = await fetch(`/api/assignments/${grade.assignmentId}`);
          if (response.ok) {
            assignment = await response.json();
            console.log("Assignment loaded from API:", assignment);
          } else {
            console.log("Failed to load assignment from API:", response.status);
          }
        } catch (error) {
          console.error("Error fetching assignment:", error);
        }
      }
    }
    
    // Если не найдено по assignmentId, ищем по scheduleId
    if (!assignment && grade.scheduleId) {
      // Сначала ищем в локальном кэше
      assignment = assignments.find(a => a.scheduleId === grade.scheduleId) || null;
      
      // Если не нашли в кэше, делаем прямой запрос к API
      if (!assignment) {
        try {
          console.log(`Trying to load assignments by scheduleId: ${grade.scheduleId}`);
          const response = await fetch(`/api/assignments/schedule/${grade.scheduleId}`);
          if (response.ok) {
            const scheduleAssignments = await response.json();
            if (scheduleAssignments.length > 0) {
              assignment = scheduleAssignments[0];
              console.log("Assignment loaded from API by scheduleId:", assignment);
            }
          } else {
            console.log("Failed to load schedule assignments from API:", response.status);
          }
        } catch (error) {
          console.error("Error fetching schedule assignments:", error);
        }
      }
    }
    
    console.log("Assignment data (final):", assignment);
    
    setSelectedGrade(grade);
    setSelectedAssignment(assignment);
    setIsGradeDialogOpen(true);
  };
  
  // Функция для загрузки среднего балла из API
  const loadSubjectAverage = async (subjectId: number, subgroupId?: number) => {
    try {
      if (!user) return null;
      
      let url = `/api/student-subject-average?studentId=${user.id}&subjectId=${subjectId}`;
      if (subgroupId) {
        url += `&subgroupId=${subgroupId}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) {
        console.error('Failed to fetch subject average:', response.statusText);
        return null;
      }
      
      const data = await response.json();
      return data as SubjectAverage;
    } catch (error) {
      console.error('Error fetching subject average:', error);
      return null;
    }
  };
  
  // Расчет среднего балла по предмету или предмету+подгруппе
  const calculateAverageForSubject = async (subject: any) => {
    // Получаем ID предмета и подгруппы из customId или из объекта предмета
    const subjectKey = typeof subject === 'string' ? subject : (subject.customId || `${subject.id}`);
    const [subjectId, subgroupId] = typeof subjectKey === 'string' 
      ? subjectKey.split('-').map(id => id ? parseInt(id) : null) 
      : [subject.id, subject.subgroupId];
    
    // Проверяем, есть ли уже загруженные данные в состоянии subjectAverages
    const cacheKey = subgroupId ? `${subjectId}-${subgroupId}` : `${subjectId}`;
    
    if (!subjectAverages[cacheKey]) {
      // Если нет в кэше, загружаем данные из API
      try {
        const apiAverage = await loadSubjectAverage(subjectId, subgroupId || undefined);
        
        if (apiAverage) {
          // Сохраняем в кэш для последующих использований
          setSubjectAverages(prev => ({
            ...prev,
            [cacheKey]: apiAverage
          }));
          
          // Возвращаем процент из API
          return apiAverage.percentage;
        }
      } catch (error) {
        console.error("Ошибка при загрузке средних оценок:", error);
      }
    } else {
      // Если данные уже есть в кэше, возвращаем их
      return subjectAverages[cacheKey].percentage;
    }
    
    // Если не удалось получить данные из API, используем локальный расчет (обратная совместимость)
    
    // Фильтруем оценки по предмету и подгруппе (если указана)
    let subjectGrades = grades.filter(g => {
      if (g.subjectId !== subjectId) return false;
      
      // Если указана подгруппа, проверяем соответствие
      if (subgroupId !== null) {
        return g.subgroupId === subgroupId;
      }
      
      // Если подгруппа не указана в ключе, включаем только оценки без подгрупп
      return !g.subgroupId;
    });
    
    // Оценки должны быть привязаны к конкретным урокам через scheduleId
    // Без этой привязки они могут дублироваться во всех уроках одного предмета
    
    // Фильтруем оценки, оставляя только те, что привязаны к конкретным урокам
    const uniqueGrades = subjectGrades.filter(grade => {
      // Всегда используем оценки, которые имеют привязку к конкретному уроку
      return grade.scheduleId !== null && grade.scheduleId !== undefined;
    });
    
    // Используем уникальные оценки для расчёта.
    // Если нет привязанных к урокам оценок, используем все оценки (обратная совместимость)
    subjectGrades = uniqueGrades.length > 0 ? uniqueGrades : subjectGrades;
    
    if (subjectGrades.length === 0) return "-";
    
    // Для накопительной системы оценивания используем тот же алгоритм, что и в журнале учителя
    if (gradingSystem === GradingSystemEnum.CUMULATIVE) {
      // Для каждой оценки ищем соответствующее задание
      let totalEarnedScore = 0;
      let totalMaxScore = 0;
      
      // Обрабатываем оценки, связанные с заданиями
      subjectGrades.forEach(grade => {
        // Определяем связанное задание (сначала по assignmentId, затем по scheduleId)
        let relatedAssignment = null;
        
        if (grade.assignmentId) {
          relatedAssignment = assignments.find(a => a.id === grade.assignmentId);
        }
        
        if (!relatedAssignment && grade.scheduleId) {
          relatedAssignment = assignments.find(a => a.scheduleId === grade.scheduleId);
        }
        
        if (relatedAssignment) {
          // Если нашли задание, добавляем баллы
          totalEarnedScore += grade.grade;
          totalMaxScore += Number(relatedAssignment.maxScore);
        }
      });
      
      // Если нет максимального балла, возвращаем прочерк
      if (totalMaxScore === 0) return "-";
      
      // Вычисляем процент выполнения и форматируем его
      const percentage = (totalEarnedScore / totalMaxScore) * 100;
      
      // Ограничиваем максимальный процент до 100%
      const cappedPercentage = Math.min(percentage, 100);
      
      return `${cappedPercentage.toFixed(1)}%`;
    } else {
      // Для пятибалльной системы оценивания - используем алгоритм с весами, как в журнале учителя
      
      // Весовые коэффициенты для разных типов оценок
      const weights: Record<string, number> = {
        'test': 2,
        'exam': 3,
        'homework': 1,
        'project': 2,
        'classwork': 1,
        'Текущая': 1,
        'Контрольная': 2,
        'Экзамен': 3,
        'Практическая': 1.5,
        'Домашняя': 1
      };
      
      let weightedSum = 0;
      let totalWeight = 0;
      
      subjectGrades.forEach(grade => {
        const weight = weights[grade.gradeType] || 1;
        weightedSum += grade.grade * weight;
        totalWeight += weight;
      });
      
      // Если нет оценок с весами, возвращаем "-"
      if (totalWeight === 0) return "-";
      
      const average = weightedSum / totalWeight;
      
      // Переводим в проценты от максимальной оценки (5.0) для согласованности отображения
      const percentScore = (average / 5) * 100;
      const cappedPercentScore = Math.min(percentScore, 100);
      
      return `${cappedPercentScore.toFixed(1)}%`;
    }
  };
  
  // Получение цвета для среднего процента
  const getAverageGradeColor = (average: string) => {
    if (average === "-") return "";
    
    // Теперь всегда работаем с процентами
    const percent = parseFloat(average.replace('%', ''));
    
    if (percent >= 80) return "text-green-600";
    if (percent >= 60) return "text-yellow-600";
    return "text-red-600";
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
  
  // Получение отображаемого названия для предмета/подгруппы
  const getDisplayName = (subject: any) => {
    const subjectId = subject.id;
    const subgroupId = subject.subgroupId;
    
    if (subgroupId) {
      const subgroup = studentSubgroups.find(sg => sg.id === subgroupId);
      if (subgroup) {
        return `${subject.name} (${subgroup.name})`;
      }
    }
    
    return subject.name;
  };
  
  // Получаем предметы и подгруппы с оценками
  const subjectsWithGrades = useMemo(() => {
    // Создаем комбинации предмет+подгруппа
    const subjectSubgroupMap = new Map();
    
    // Сначала добавляем все подгруппы студента
    studentSubgroups.forEach(subgroup => {
      // Находим предмет для подгруппы (если информация доступна)
      // Обычно подгруппы связаны с предметами через назначения
      const assignment = assignments.find(a => a.subgroupId === subgroup.id);
      if (assignment) {
        const subject = subjects.find(s => s.id === assignment.subjectId);
        if (subject) {
          const key = `${subject.id}-${subgroup.id}`;
          subjectSubgroupMap.set(key, {
            ...subject,
            subgroupId: subgroup.id,
            subgroupName: subgroup.name,
            customId: key
          });
        }
      }
    });
    
    // Затем добавляем предметы с оценками
    grades.forEach(grade => {
      const key = grade.subgroupId 
        ? `${grade.subjectId}-${grade.subgroupId}` 
        : `${grade.subjectId}`;
      
      if (!subjectSubgroupMap.has(key)) {
        const subject = subjects.find(s => s.id === grade.subjectId);
        if (subject) {
          // Если это подгруппа, находим её название
          let subgroupName = null;
          if (grade.subgroupId) {
            const subgroup = studentSubgroups.find(sg => sg.id === grade.subgroupId);
            subgroupName = subgroup ? subgroup.name : null;
          }
          
          // Сохраняем копию предмета с информацией о подгруппе
          subjectSubgroupMap.set(key, {
            ...subject,
            subgroupId: grade.subgroupId,
            subgroupName,
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
                            <Percent className="h-4 w-4 mr-1 text-gray-500" />
                            <span>Ср. процент</span>
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subjectsWithGrades.map((subject) => (
                        <TableRow key={subject.customId || subject.id}>
                          <TableCell className="font-medium sticky left-0 bg-white shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] z-10">
                            {subject.subgroupId 
                              ? getDisplayName(subject) 
                              : subject.name
                            }
                          </TableCell>
                          {daysInPeriod.map((day) => (
                            <TableCell key={day.toString()} className="text-center">
                              {renderGradeCell(subject, day)}
                            </TableCell>
                          ))}
                          <TableCell className={`text-center bg-gray-50 font-semibold sticky right-0 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.1)] ${getAverageGradeColor(subjectAverages[String(subject.id)]?.percentage || "-")}`}>
                            {subjectAverages[String(subject.id)]?.percentage || "-"}
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
                          // Ищем соответствующее задание (сначала по assignmentId, затем по scheduleId)
                          let assignment = null;
                          
                          if (grade.assignmentId) {
                            assignment = assignments.find(a => a.id === grade.assignmentId);
                          }
                          
                          if (!assignment && grade.scheduleId) {
                            assignment = assignments.find(a => a.scheduleId === grade.scheduleId);
                          }
                          
                          return (
                            <TableRow 
                              key={grade.id} 
                              className="cursor-pointer hover:bg-gray-50"
                              onClick={() => handleGradeClick(grade, assignment)}
                            >
                              <TableCell>
                                {format(new Date(grade.createdAt), 'dd.MM.yyyy')}
                              </TableCell>
                              <TableCell className="font-medium">
                                {getSubjectName(grade.subjectId, grade.subgroupId)}
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
                  <div className="font-medium">{getSubjectName(selectedGrade.subjectId, selectedGrade.subgroupId)}</div>
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
                  {selectedAssignment 
                    ? getAssignmentTypeName(selectedAssignment.assignmentType) 
                    : getGradeTypeName(selectedGrade.gradeType)
                  }
                </Badge>
              </div>
              
              <div>
                <div className="text-sm text-gray-500">Оценка</div>
                <div className="mt-1 flex flex-col space-y-2">
                  {/* Отображение оценки для всех систем с информацией о задании */}
                  {selectedAssignment ? (
                    <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                      <div className="flex items-center">
                        <Badge className={`text-lg px-3 py-1 mr-2 ${
                          (selectedGrade.grade / parseFloat(selectedAssignment.maxScore.toString())) >= 0.8 ? 'bg-green-100 text-green-800' : 
                          (selectedGrade.grade / parseFloat(selectedAssignment.maxScore.toString())) >= 0.6 ? 'bg-yellow-100 text-yellow-800' : 
                          'bg-red-100 text-red-800'
                        }`}>
                          {selectedGrade.grade}/{selectedAssignment.maxScore}
                        </Badge>
                      </div>
                      <Badge className={`text-lg px-3 py-1 ${
                        (selectedGrade.grade / parseFloat(selectedAssignment.maxScore.toString())) >= 0.8 ? 'bg-green-100 text-green-800' : 
                        (selectedGrade.grade / parseFloat(selectedAssignment.maxScore.toString())) >= 0.6 ? 'bg-yellow-100 text-yellow-800' : 
                        'bg-red-100 text-red-800'
                      }`}>
                        {((selectedGrade.grade / parseFloat(selectedAssignment.maxScore.toString())) * 100).toFixed(1)}%
                      </Badge>
                    </div>
                  ) : (
                    <div className="bg-gray-50 p-3 rounded-lg text-center">
                      <div className="text-xs text-gray-500 mb-1">Оценка</div>
                      <Badge className={`text-lg px-3 py-1 ${
                        selectedGrade.grade >= 4 ? 'bg-green-100 text-green-800' : 
                        selectedGrade.grade >= 3 ? 'bg-yellow-100 text-yellow-800' : 
                        'bg-red-100 text-red-800'
                      }`}>
                        {selectedGrade.grade}
                      </Badge>
                    </div>
                  )}
                  
                  {/* Отображение оценки для пятибалльной системы */}
                  {gradingSystem === GradingSystemEnum.FIVE_POINT && selectedAssignment && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2 items-center">
                        <div className="bg-gray-50 p-3 rounded-lg text-center">
                          <div className="text-xs text-gray-500 mb-1">Оценка</div>
                          <Badge className={`text-lg px-3 py-1 ${
                            selectedGrade.grade >= 4 ? 'bg-green-100 text-green-800' : 
                            selectedGrade.grade >= 3 ? 'bg-yellow-100 text-yellow-800' : 
                            'bg-red-100 text-red-800'
                          }`}>
                            {selectedGrade.grade}
                          </Badge>
                        </div>
                        {selectedAssignment && (
                          <>
                            <div className="bg-gray-50 p-3 rounded-lg text-center">
                              <div className="text-xs text-gray-500 mb-1">Формат</div>
                              <Badge variant="outline" className="text-lg px-3 py-1">
                                {selectedGrade.grade}/{selectedAssignment.maxScore}
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
                          </>
                        )}
                      </div>
                      
                      {selectedAssignment && (
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
                      )}
                    </div>
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
                    <Badge className={assignmentTypeColors[selectedAssignment.assignmentType] || 'bg-gray-100'}>
                      {getAssignmentTypeName(selectedAssignment.assignmentType)}
                    </Badge>
                    
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