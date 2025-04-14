import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { MainLayout } from "@/components/layout/main-layout";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AttendanceForm } from "@/components/attendance/attendance-form";
import { 
  UserRoleEnum, 
  Grade,
  Schedule,
  Class as ClassType,
  Subject,
  User,
  GradingSystemEnum,
  AssignmentTypeEnum,
  Assignment
} from "@shared/schema";
import { z } from "zod";



// Определяем интерфейс для слотов расписания
interface LessonSlot {
  date: string;
  scheduleId: number;
  formattedDate: string;
  startTime?: string;
  endTime?: string;
  status?: string;
  assignments?: Assignment[];
}
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { 
  AlertCircle, 
  BookOpenIcon, 
  BookPlus,
  CalendarClock,
  CalendarIcon, 
  Download, 
  GraduationCapIcon, 
  Loader2, 
  PlusCircle 
} from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
// Схема для формы добавления задания
const assignmentFormSchema = z.object({
  assignmentType: z.nativeEnum(AssignmentTypeEnum, {
    required_error: "Выберите тип задания",
  }),
  maxScore: z.string({
    required_error: "Укажите максимальный балл",
  }).min(1, "Минимальный балл - 1").refine((val) => !isNaN(Number(val)), {
    message: "Максимальный балл должен быть числом",
  }),
  description: z.string().optional().nullable(),
  scheduleId: z.number({
    required_error: "Необходимо указать ID занятия",
  }),
  subjectId: z.number({
    required_error: "Выберите предмет",
  }),
  classId: z.number({
    required_error: "Выберите класс",
  }),
  teacherId: z.number({
    required_error: "Выберите учителя",
  }),
  subgroupId: z.number().optional().nullable(),
  plannedFor: z.boolean().default(false),
});

// Схема для добавления оценки
// Динамическая схема оценки в зависимости от системы оценивания
const createGradeFormSchema = (gradingSystem: GradingSystemEnum | undefined, assignmentMaxScore?: number) => {
  // Базовая схема с общими полями
  const baseSchema = z.object({
    studentId: z.number({
      required_error: "Выберите ученика",
    }),
    subjectId: z.number({
      required_error: "Выберите предмет",
    }),
    classId: z.number({
      required_error: "Выберите класс",
    }),
    teacherId: z.number({
      required_error: "Выберите учителя",
    }),
    comment: z.string().nullable().optional(),
    gradeType: z.string({
      required_error: "Укажите тип оценки",
    }),
    date: z.string().optional().nullable(),
    scheduleId: z.number().optional().nullable(),
    subgroupId: z.number().optional().nullable(),
    assignmentId: z.number().optional().nullable(), // Для накопительной системы - ID задания
  });

  // Если накопительная система и задан максимальный балл
  if (gradingSystem === GradingSystemEnum.CUMULATIVE && assignmentMaxScore) {
    return baseSchema.extend({
      grade: z.number({
        required_error: "Укажите балл",
      }).min(0, "Минимальный балл - 0").max(assignmentMaxScore, `Максимальный балл - ${assignmentMaxScore}`),
    });
  }

  // Для пятибалльной системы или если система не определена
  return baseSchema.extend({
    grade: z.number({
      required_error: "Укажите оценку",
    }).min(1, "Минимальная оценка - 1").max(5, "Максимальная оценка - 5"),
  });
};

export default function ClassGradeDetailsPage() {
  const params = useParams();
  const classId = parseInt(params.classId || "0");
  const subjectId = parseInt(params.subjectId || "0");
  const [location, navigate] = useLocation();
  
  // Извлекаем subgroupId из параметров URL или из query параметров (для обратной совместимости)
  let subgroupId: number | undefined;
  
  // Сначала проверяем, есть ли subgroupId в пути URL
  if (params.subgroupId) {
    subgroupId = parseInt(params.subgroupId);
  } else {
    // Если нет в пути, пробуем извлечь из query параметров (старый способ)
    const urlParams = new URLSearchParams(location.split('?')[1] || '');
    const subgroupIdParam = urlParams.get('subgroupId');
    if (subgroupIdParam) {
      subgroupId = parseInt(subgroupIdParam);
    }
  }
  
  const { user } = useAuth();
  const { toast } = useToast();
  const { isTeacher, isSchoolAdmin, isSuperAdmin, isClassTeacher } = useRoleCheck();
  const canEditGrades = isTeacher() || isSchoolAdmin() || isSuperAdmin() || isClassTeacher();
  
  const [isGradeDialogOpen, setIsGradeDialogOpen] = useState(false);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isAssignmentDialogOpen, setIsAssignmentDialogOpen] = useState(false);
  const [isContextDialogOpen, setIsContextDialogOpen] = useState(false);
  const [isAttendanceDialogOpen, setIsAttendanceDialogOpen] = useState(false);
  const [editingAssignmentId, setEditingAssignmentId] = useState<number | null>(null);
  const [selectedAssignmentForEdit, setSelectedAssignmentForEdit] = useState<Assignment | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [editingGradeId, setEditingGradeId] = useState<number | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
  
  // Fetch class details
  const { data: classData, isLoading: isClassLoading } = useQuery<ClassType>({
    queryKey: ["/api/classes", classId],
    queryFn: async () => {
      const res = await apiRequest(`/api/classes/${classId}`);
      return res.json();
    },
    enabled: !!classId && !!user,
  });
  
  // Fetch subject details
  const { data: subjectData, isLoading: isSubjectLoading } = useQuery<Subject>({
    queryKey: ["/api/subjects", subjectId],
    queryFn: async () => {
      const res = await apiRequest(`/api/subjects/${subjectId}`);
      return res.json();
    },
    enabled: !!subjectId && !!user,
  });
  
  // Получаем все подгруппы 
  const { data: allSubgroups = [], isLoading: isAllSubgroupsLoading } = useQuery<Array<{id: number, name: string, classId: number}>>({
    queryKey: ["/api/subgroups"],
    queryFn: async () => {
      const res = await apiRequest(`/api/subgroups`);
      return res.json();
    },
    enabled: !!user,
  });

  // Fetch subgroup details if subgroupId is provided
  const { data: subgroupData, isLoading: isSubgroupLoading } = useQuery<{id: number, name: string, classId: number}>({
    queryKey: ["/api/subgroups", subgroupId],
    queryFn: async () => {
      const res = await apiRequest(`/api/subgroups/${subgroupId}`);
      return res.json();
    },
    enabled: !!subgroupId && !!user,
  });
  
  // Fetch students in class
  const { data: students = [], isLoading: isStudentsLoading } = useQuery<User[]>({
    queryKey: ["/api/students-by-class", classId],
    queryFn: async () => {
      const res = await apiRequest(`/api/students-by-class/${classId}`);
      return res.json();
    },
    enabled: !!classId && !!user,
  });
  
  // Получаем студентов, связанных с подгруппой, если указан ID подгруппы
  const { data: studentSubgroups = [], isLoading: isStudentSubgroupsLoading } = useQuery<Array<{studentId: number, subgroupId: number}>>({
    queryKey: ["/api/student-subgroups", subgroupId],
    queryFn: async () => {
      if (subgroupId) {
        const res = await apiRequest(`/api/student-subgroups?subgroupId=${subgroupId}`);
        return res.json();
      }
      return [];
    },
    enabled: !!subgroupId && !!user,
  });
  

  
  // Отфильтрованный список студентов, учитывая подгруппу, если она указана
  const filteredStudents = useMemo(() => {
    if (subgroupId && studentSubgroups.length > 0) {
      // Получаем ID студентов, которые принадлежат конкретной подгруппе
      const subgroupStudentIds = studentSubgroups
        .filter(sg => sg.subgroupId === subgroupId)
        .map(sg => sg.studentId);
      
      // Возвращаем только студентов из этой подгруппы
      return students.filter(student => 
        subgroupStudentIds.includes(student.id)
      );
    }
    
    // Если подгруппа не указана или нет данных о студентах подгруппы, 
    // возвращаем всех студентов класса
    return students;
  }, [students, subgroupId, studentSubgroups]);
  

  
  // Fetch schedules for this class and subject, filtered by subgroup if specified
  const { data: schedules = [], isLoading: isSchedulesLoading } = useQuery<Schedule[]>({
    queryKey: ["/api/schedules", { classId, subjectId, subgroupId }],
    queryFn: async () => {
      let url = `/api/schedules?classId=${classId}&subjectId=${subjectId}`;
      
      // Если указана подгруппа, добавляем параметр для фильтрации расписаний только для этой подгруппы
      if (subgroupId) {
        url += `&subgroupId=${subgroupId}`;
      }
      
      const res = await apiRequest(url);
      return res.json();
    },
    enabled: !!classId && !!subjectId && !!user,
  });
  
  // Получаем расписание для текущего учителя (все предметы)
  const { data: teacherSchedules = [], isLoading: isTeacherSchedulesLoading } = useQuery<Schedule[]>({
    queryKey: ["/api/schedules", { teacherId: user?.id }],
    queryFn: async () => {
      const res = await apiRequest(`/api/schedules?teacherId=${user?.id}`);
      return res.json();
    },
    enabled: !!user?.id,
  });
  
  // Fetch grades for this class, subject, and optionally subgroup
  const { data: grades = [], isLoading: isGradesLoading } = useQuery<Grade[]>({
    queryKey: ["/api/grades", { classId, subjectId, subgroupId }],
    queryFn: async () => {
      let url = `/api/grades?classId=${classId}&subjectId=${subjectId}`;
      
      // Если указана подгруппа, получаем только оценки из уроков этой подгруппы
      // Оценки фильтруются на клиенте после получения
      
      const res = await apiRequest(url);
      return res.json();
    },
    enabled: !!classId && !!subjectId && !!user,
  });
  
  // Используем тип Assignment импортированный из schema

// Получаем задания для этого класса и предмета, чтобы знать, какие ячейки активировать для выставления оценок
  const { data: assignments = [], isLoading: isAssignmentsLoading } = useQuery<Assignment[]>({
    queryKey: ["/api/assignments", { classId, subjectId, subgroupId }],
    queryFn: async () => {
      let url = `/api/assignments?classId=${classId}&subjectId=${subjectId}`;
      if (subgroupId) {
        url += `&subgroupId=${subgroupId}`;
      }
      const res = await apiRequest(url);
      return res.json();
    },
    enabled: !!classId && !!subjectId && !!user && classData?.gradingSystem === GradingSystemEnum.CUMULATIVE,
  });
  
  // Функция для определения, есть ли задания для конкретного урока
  const getAssignmentsForSchedule = useCallback((scheduleId: number) => {
    return assignments.filter(a => a.scheduleId === scheduleId);
  }, [assignments]);

  // Функция для получения цвета фона ячейки на основе типа задания
  const getAssignmentTypeColor = useCallback((assignmentType: string) => {
    console.log("Получение цвета для типа задания:", assignmentType);
    
    switch(assignmentType) {
      case AssignmentTypeEnum.CONTROL_WORK: // control_work
        return 'bg-red-100';
      case AssignmentTypeEnum.TEST_WORK: // test_work
        return 'bg-blue-100';
      case AssignmentTypeEnum.CURRENT_WORK: // current_work
        return 'bg-green-100';
      case AssignmentTypeEnum.HOMEWORK: // homework
        return 'bg-amber-100';
      case AssignmentTypeEnum.CLASSWORK: // classwork
        return 'bg-purple-100';
      case AssignmentTypeEnum.PROJECT_WORK: // project_work
        return 'bg-emerald-100';
      case AssignmentTypeEnum.CLASS_ASSIGNMENT: // class_assignment
        return 'bg-indigo-100';
      default:
        console.warn("Неизвестный тип задания:", assignmentType);
        return 'bg-gray-100'; // Возвращаем серый цвет для неизвестных типов
    }
  }, []);

  // Функция для получения названия типа задания
  const getAssignmentTypeName = useCallback((assignmentType: string) => {
    switch(assignmentType) {
      case AssignmentTypeEnum.CONTROL_WORK:
        return 'Контрольная работа';
      case AssignmentTypeEnum.TEST_WORK:
        return 'Проверочная работа';
      case AssignmentTypeEnum.CURRENT_WORK:
        return 'Текущая работа';
      case AssignmentTypeEnum.HOMEWORK:
        return 'Домашнее задание';
      case AssignmentTypeEnum.CLASSWORK:
        return 'Работа на уроке';
      case AssignmentTypeEnum.PROJECT_WORK:
        return 'Работа с проектом';
      case AssignmentTypeEnum.CLASS_ASSIGNMENT:
        return 'Классная работа';
      default:
        return assignmentType;
    }
  }, []);
  
  // Функция для получения названия типа оценки
  const getGradeTypeName = useCallback((gradeType: string) => {
    switch(gradeType) {
      case 'test':
      case 'Контрольная':
        return 'Контрольная работа';
      case 'exam':
      case 'Экзамен':
        return 'Экзамен';
      case 'homework':
      case 'Домашняя':
        return 'Домашнее задание';
      case 'project':
        return 'Проект';
      case 'classwork':
      case 'Практическая':
        return 'Работа на уроке';
      default:
        return gradeType;
    }
  }, []);

  // Get unique lesson slots (date + scheduleId pairs) from schedules for this class and subject
  // Используем useState вместо useMemo, чтобы можно было обновлять данные
  const [lessonSlots, setLessonSlots] = useState<LessonSlot[]>([]);
  
  // Обновляем lessonSlots при изменении зависимостей
  useEffect(() => {
    // Фильтруем расписания для текущего предмета
    const newLessonSlots = schedules
      .filter(s => s.scheduleDate && s.subjectId === subjectId) // Filter schedules for this subject only
      .sort((a, b) => {
        // Сортируем по дате, затем по времени начала урока (если есть)
        const dateCompare = new Date(a.scheduleDate as string).getTime() - new Date(b.scheduleDate as string).getTime();
        if (dateCompare !== 0) return dateCompare;
        
        // Если даты одинаковые, сортируем по времени начала
        return a.startTime && b.startTime ? 
          a.startTime.localeCompare(b.startTime) : 0;
      })
      .map(s => ({
        date: s.scheduleDate as string,
        scheduleId: s.id,
        startTime: s.startTime || '',
        endTime: s.endTime || '',
        status: s.status || 'not_conducted',
        formattedDate: format(new Date(s.scheduleDate as string), "dd.MM", { locale: ru }),
        assignments: getAssignmentsForSchedule(s.id)
      }));
    
    setLessonSlots(newLessonSlots);
  }, [schedules, subjectId, getAssignmentsForSchedule, assignments]);
  
  // Группируем расписания учителя по предметам
  const schedulesBySubject = useMemo(() => {
    return teacherSchedules.reduce((acc, schedule) => {
      if (!schedule.subjectId || !schedule.scheduleDate) return acc;
      
      if (!acc[schedule.subjectId]) {
        acc[schedule.subjectId] = [];
      }
      
      // Добавляем, если такой даты еще нет
      if (!acc[schedule.subjectId].includes(schedule.scheduleDate)) {
        acc[schedule.subjectId].push(schedule.scheduleDate);
      }
      
      return acc;
    }, {} as Record<number, string[]>);
  }, [teacherSchedules]);
  
  // Отфильтрованные оценки, учитывая подгруппу, если она указана
  const filteredGrades = useMemo(() => {
    if (!grades) return [];
    
    let filtered = grades;
    
    // Если указана подгруппа, фильтруем оценки
    if (subgroupId) {
      // Для подгруппы оставляем только оценки, связанные с уроками этой подгруппы
      // или оценки, у которых явно указана эта подгруппа
      filtered = grades.filter(grade => {
        // Если у оценки напрямую указана эта подгруппа
        if (grade.subgroupId === subgroupId) return true;
        
        // Если у оценки указан урок, проверяем, относится ли он к этой подгруппе
        if (grade.scheduleId) {
          const schedule = schedules.find(s => s.id === grade.scheduleId);
          return schedule && schedule.subgroupId === subgroupId;
        }
        
        return false;
      });
    }
    
    return filtered;
  }, [grades, subgroupId, schedules]);

  // Функция для получения оценок конкретного студента на определенную дату
  const getStudentGradeForSlot = useCallback((studentId: number, slot: LessonSlot, grades: Grade[]) => {
    if (!grades) return [];
    
    return grades.filter(g => 
      g.studentId === studentId && 
      g.scheduleId === slot.scheduleId
    );
  }, []);

  // Функция для расчета среднего балла студента
  const calculateAverageGrade = useCallback((studentId: number) => {
    if (!filteredGrades) return "-";
    
    const studentGrades = filteredGrades.filter(g => g.studentId === studentId);
    if (studentGrades.length === 0) return "-";
    
    // Для накопительной системы оценок вычисляем процент от максимума
    if (classData?.gradingSystem === GradingSystemEnum.CUMULATIVE) {
      let totalSum = 0;
      let totalMaxScore = 0;
      
      // Проходим по всем оценкам студента и собираем сумму и максимально возможную сумму
      for (const grade of studentGrades) {
        if (grade.assignmentId) {
          // Находим соответствующее задание для этой оценки
          const assignment = assignments.find(a => a.id === grade.assignmentId);
          if (assignment) {
            totalSum += grade.grade;
            totalMaxScore += parseInt(assignment.maxScore);
          }
        } else {
          // Если нет связи с заданием, считаем обычным образом
          totalSum += grade.grade;
          totalMaxScore += 5; // Предполагаем максимум для обычной оценки
        }
      }
      
      if (totalMaxScore === 0) return "-"; // Защита от деления на ноль
      
      // Возвращаем процент от максимального балла
      const percentage = (totalSum / totalMaxScore) * 100;
      return percentage.toFixed(1) + "%";
    } else {
      // Для обычной системы - простое среднее арифметическое
      const sum = studentGrades.reduce((acc, g) => acc + g.grade, 0);
      return (sum / studentGrades.length).toFixed(1);
    }
  }, [filteredGrades, assignments, classData?.gradingSystem]);
  
  // Функция для построения схемы формы для добавления оценки
  // с учетом типа оценочной системы и выбранного задания
  const getGradeFormSchema = useCallback(() => {
    // Если это накопительная система и выбрано задание, берем максимальный балл из задания
    let maxScore: number | undefined;
    
    if (classData?.gradingSystem === GradingSystemEnum.CUMULATIVE && selectedAssignmentId) {
      const assignment = assignments.find(a => a.id === selectedAssignmentId);
      if (assignment) {
        maxScore = parseInt(assignment.maxScore);
      }
    }
    
    return createGradeFormSchema(classData?.gradingSystem, maxScore);
  }, [classData?.gradingSystem, selectedAssignmentId, assignments]);
  
  const gradeForm = useForm<z.infer<ReturnType<typeof createGradeFormSchema>>>({
    resolver: zodResolver(getGradeFormSchema()),
    defaultValues: {
      classId: classId,
      subjectId: subjectId,
      teacherId: user?.id,
      studentId: selectedStudentId || undefined,
      subgroupId: subgroupId,
      scheduleId: null,
      assignmentId: null,
      gradeType: "classwork",
    },
  });
  
  // Эффект для обновления defaultValues формы при изменении выбранного студента или задания
  useEffect(() => {
    if (selectedStudentId) {
      gradeForm.setValue('studentId', selectedStudentId);
    }
    
    if (selectedDate) {
      gradeForm.setValue('date', selectedDate);
    }
    
    if (selectedAssignmentId) {
      gradeForm.setValue('assignmentId', selectedAssignmentId);
      
      // Если выбрано задание, устанавливаем тип оценки в соответствии с типом задания
      const assignment = assignments.find(a => a.id === selectedAssignmentId);
      if (assignment) {
        gradeForm.setValue('gradeType', assignment.assignmentType);
      }
    }
  }, [selectedStudentId, selectedDate, selectedAssignmentId, gradeForm, assignments]);
  
  // Mutation для добавления оценки
  const addGradeMutation = useMutation({
    mutationFn: async (data: z.infer<ReturnType<typeof createGradeFormSchema>>) => {
      const res = await apiRequest('/api/grades', 'POST', data);
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Ошибка при добавлении оценки');
      }
      
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Оценка успешно добавлена",
        description: `Оценка ${data.grade} добавлена студенту`,
      });
      
      // Обновляем кэш оценок
      queryClient.invalidateQueries({
        queryKey: ["/api/grades", { classId, subjectId, subgroupId }],
      });
      
      setIsGradeDialogOpen(false);
      
      // Очищаем форму
      gradeForm.reset({
        studentId: undefined,
        grade: undefined,
        gradeType: "classwork",
        comment: "",
        classId: classId,
        subjectId: subjectId,
        teacherId: user?.id,
        subgroupId: subgroupId,
      });
      
      // Сбрасываем состояния выбора
      setSelectedStudentId(null);
      setSelectedDate(null);
      setSelectedAssignmentId(null);
    },
    onError: (error) => {
      toast({
        title: "Ошибка при добавлении оценки",
        description: error instanceof Error ? error.message : 'Неизвестная ошибка',
        variant: "destructive",
      });
    },
  });
  
  // Mutation для обновления оценки
  const updateGradeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: Partial<Grade> }) => {
      // Для корректного обновления убеждаемся, что все необходимые поля присутствуют
      const updateData = {
        ...data,
        classId: data.classId || classId,
        subjectId: data.subjectId || subjectId,
        teacherId: data.teacherId || user?.id,
        subgroupId: data.subgroupId || subgroupId,
      };
      
      const res = await apiRequest(`/api/grades/${id}`, 'PATCH', updateData);
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Ошибка при обновлении оценки');
      }
      
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Оценка успешно обновлена",
        description: `Оценка изменена на ${data.grade}`,
      });
      
      // Обновляем кэш оценок
      queryClient.invalidateQueries({
        queryKey: ["/api/grades", { classId, subjectId, subgroupId }],
      });
      
      setIsGradeDialogOpen(false);
      setEditingGradeId(null);
      
      gradeForm.reset({
        studentId: undefined,
        grade: undefined,
        gradeType: "classwork",
        comment: "",
        classId: classId,
        subjectId: subjectId,
        teacherId: user?.id,
        subgroupId: subgroupId,
      });
      
      // Сбрасываем состояния выбора
      setSelectedStudentId(null);
      setSelectedDate(null);
      setSelectedAssignmentId(null);
    },
    onError: (error) => {
      toast({
        title: "Ошибка при обновлении оценки",
        description: error instanceof Error ? error.message : 'Неизвестная ошибка',
        variant: "destructive",
      });
    },
  });
  
  // Mutation для удаления оценки
  const deleteGradeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/grades/${id}`, 'DELETE');
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Ошибка при удалении оценки');
      }
      
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Оценка успешно удалена",
      });
      
      // Обновляем кэш оценок
      queryClient.invalidateQueries({
        queryKey: ["/api/grades", { classId, subjectId, subgroupId }],
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка при удалении оценки",
        description: error instanceof Error ? error.message : 'Неизвестная ошибка',
        variant: "destructive",
      });
    },
  });
  
  // Mutation для добавления задания
  const addAssignmentMutation = useMutation({
    mutationFn: async (data: z.infer<typeof assignmentFormSchema>) => {
      const res = await apiRequest('/api/assignments', 'POST', data);
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Ошибка при добавлении задания');
      }
      
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Задание успешно добавлено",
        description: `Задание типа "${getAssignmentTypeName(data.assignmentType)}" добавлено к уроку`,
      });
      
      // Обновляем кэш заданий
      queryClient.invalidateQueries({
        queryKey: ["/api/assignments", { classId, subjectId, subgroupId }],
      });
      
      setIsAssignmentDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Ошибка при добавлении задания",
        description: error instanceof Error ? error.message : 'Неизвестная ошибка',
        variant: "destructive",
      });
    },
  });
  
  // Mutation для обновления задания
  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: Partial<Assignment> }) => {
      const res = await apiRequest(`/api/assignments/${id}`, 'PATCH', data);
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Ошибка при обновлении задания');
      }
      
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Задание успешно обновлено",
        description: `Задание типа "${getAssignmentTypeName(data.assignmentType)}" обновлено`,
      });
      
      // Обновляем кэш заданий
      queryClient.invalidateQueries({
        queryKey: ["/api/assignments", { classId, subjectId, subgroupId }],
      });
      
      setIsAssignmentDialogOpen(false);
      setEditingAssignmentId(null);
    },
    onError: (error) => {
      toast({
        title: "Ошибка при обновлении задания",
        description: error instanceof Error ? error.message : 'Неизвестная ошибка',
        variant: "destructive",
      });
    },
  });
  
  // Mutation для удаления задания
  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/assignments/${id}`, 'DELETE');
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Ошибка при удалении задания');
      }
      
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Задание успешно удалено",
      });
      
      // Обновляем кэш заданий
      queryClient.invalidateQueries({
        queryKey: ["/api/assignments", { classId, subjectId, subgroupId }],
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка при удалении задания",
        description: error instanceof Error ? error.message : 'Неизвестная ошибка',
        variant: "destructive",
      });
    },
  });
  
  // Mutation для обновления статуса урока
  const updateScheduleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number, status: string }) => {
      const res = await apiRequest(`/api/schedules/${id}/status`, 'PATCH', { status });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Ошибка при обновлении статуса урока');
      }
      
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Статус урока обновлен",
        description: `Урок от ${format(new Date(data.scheduleDate || ''), "dd.MM.yyyy", { locale: ru })} отмечен как ${
          data.status === 'conducted' ? 'проведенный' : 
          data.status === 'cancelled' ? 'отмененный' : 'не проведенный'
        }`,
      });
      
      // Обновляем кэш расписаний
      queryClient.invalidateQueries({
        queryKey: ["/api/schedules", { classId, subjectId, subgroupId }],
      });
      
      setIsStatusDialogOpen(false);
      setSelectedSchedule(null);
    },
    onError: (error) => {
      toast({
        title: "Ошибка при обновлении статуса урока",
        description: error instanceof Error ? error.message : 'Неизвестная ошибка',
        variant: "destructive",
      });
    },
  });
  
  // Edit existing grade
  const openEditGradeDialog = (grade: Grade) => {
    setSelectedStudentId(grade.studentId);
    setSelectedDate(null);
    setEditingGradeId(grade.id);
    
    // Если есть scheduleId и в накопительной системе, нужно найти задание
    if (grade.scheduleId && classData?.gradingSystem === GradingSystemEnum.CUMULATIVE && grade.assignmentId) {
      setSelectedAssignmentId(grade.assignmentId);
    } else {
      setSelectedAssignmentId(null);
    }
    
    // Устанавливаем значения формы
    gradeForm.reset({
      studentId: grade.studentId,
      grade: grade.grade,
      gradeType: grade.gradeType,
      comment: grade.comment || '',
      classId: classId,
      subjectId: subjectId,
      teacherId: user?.id,
      // В модели Grade нет поля date, но оно может приходить от API
      scheduleId: grade.scheduleId || null,
      subgroupId: grade.subgroupId || subgroupId,
      assignmentId: grade.assignmentId || null,
    });
    
    setIsGradeDialogOpen(true);
  };
  
  // Open grade dialog to add new grade
  const openGradeDialog = (studentId: number, date?: string, scheduleId?: number) => {
    setSelectedStudentId(studentId);
    setSelectedDate(date || null);
    setEditingGradeId(null);
    
    // Для накопительной системы, если есть scheduleId, нужно найти возможные задания
    let assignmentId = null;
    
    if (classData?.gradingSystem === GradingSystemEnum.CUMULATIVE && scheduleId) {
      const scheduleAssignments = assignments.filter(a => a.scheduleId === scheduleId);
      
      // Если есть только одно задание для этого урока, автоматически выбираем его
      if (scheduleAssignments.length === 1) {
        assignmentId = scheduleAssignments[0].id;
        setSelectedAssignmentId(assignmentId);
      } else {
        // Сбросим выбранное задание, если задач несколько
        setSelectedAssignmentId(null);
      }
    } else {
      // Сбросим выбранное задание
      setSelectedAssignmentId(null);
    }
    
    // Устанавливаем значения формы
    gradeForm.reset({
      studentId,
      classId,
      subjectId,
      teacherId: user?.id,
      gradeType: assignmentId ? (assignments.find(a => a.id === assignmentId)?.assignmentType || "classwork") : "classwork",
      comment: '',
      date,
      scheduleId: scheduleId || null,
      subgroupId,
      assignmentId: assignmentId,
    });
    
    setIsGradeDialogOpen(true);
  };
  
  // Handle grade form submission
  const onGradeSubmit = (data: z.infer<ReturnType<typeof getGradeFormSchema>>) => {
    // Если используется накопительная система и есть задание, проверим ограничение на максимальный балл
    if (classData?.gradingSystem === GradingSystemEnum.CUMULATIVE && data.assignmentId) {
      const assignment = assignments.find(a => a.id === data.assignmentId);
      if (assignment && data.grade > parseInt(assignment.maxScore)) {
        // Если оценка превышает максимальный балл, автоматически корректируем её
        const correctedData = {
          ...data,
          grade: parseInt(assignment.maxScore)
        };
        
        toast({
          title: "Оценка скорректирована",
          description: `Оценка была автоматически снижена до максимального балла (${assignment.maxScore})`,
        });
        
        if (editingGradeId) {
          // Updating existing grade with corrected data
          updateGradeMutation.mutate({ id: editingGradeId, data: correctedData });
        } else {
          // Creating new grade with corrected data
          addGradeMutation.mutate(correctedData);
        }
        return;
      }
    }
    
    // Если не нужна коррекция или это не накопительная система
    if (editingGradeId) {
      // Updating existing grade
      updateGradeMutation.mutate({ id: editingGradeId, data });
    } else {
      // Creating new grade
      addGradeMutation.mutate(data);
    }
  };
  
  // Handle grade deletion
  const handleDeleteGrade = (id: number) => {
    if (confirm('Вы уверены, что хотите удалить эту оценку?')) {
      deleteGradeMutation.mutate(id);
    }
  };
  
  // Open assignment dialog
  const openAssignmentDialog = (scheduleId: number) => {
    setEditingAssignmentId(null);
    setSelectedAssignmentForEdit(null);
    
    // Получаем расписание
    const schedule = schedules.find(s => s.id === scheduleId);
    
    if (schedule) {
      const assignmentForm = document.getElementById('assignment-form') as HTMLFormElement;
      if (assignmentForm) {
        assignmentForm.reset();
      }
      
      setIsAssignmentDialogOpen(true);
      
      // Заполняем скрытые поля формы
      const scheduleIdInput = document.getElementById('assignment-scheduleId') as HTMLInputElement;
      const classIdInput = document.getElementById('assignment-classId') as HTMLInputElement;
      const subjectIdInput = document.getElementById('assignment-subjectId') as HTMLInputElement;
      const teacherIdInput = document.getElementById('assignment-teacherId') as HTMLInputElement;
      const subgroupIdInput = document.getElementById('assignment-subgroupId') as HTMLInputElement;
      
      if (scheduleIdInput) scheduleIdInput.value = schedule.id.toString();
      if (classIdInput) classIdInput.value = classId.toString();
      if (subjectIdInput) subjectIdInput.value = subjectId.toString();
      if (teacherIdInput) teacherIdInput.value = (user?.id || 0).toString();
      if (subgroupIdInput && schedule.subgroupId) subgroupIdInput.value = schedule.subgroupId.toString();
    } else {
      toast({
        title: "Ошибка",
        description: "Не удалось найти расписание для добавления задания",
        variant: "destructive",
      });
    }
  };
  
  // Open assignment edit dialog
  const openEditAssignmentDialog = (assignment: Assignment) => {
    setEditingAssignmentId(assignment.id);
    setSelectedAssignmentForEdit(assignment);
    
    const assignmentForm = document.getElementById('assignment-form') as HTMLFormElement;
    if (assignmentForm) {
      // Заполняем поля формы
      const assignmentTypeInput = document.getElementById('assignment-type') as HTMLSelectElement;
      const maxScoreInput = document.getElementById('assignment-maxScore') as HTMLInputElement;
      const descriptionInput = document.getElementById('assignment-description') as HTMLTextAreaElement;
      const plannedForInput = document.getElementById('assignment-plannedFor') as HTMLInputElement;
      
      if (assignmentTypeInput) assignmentTypeInput.value = assignment.assignmentType;
      if (maxScoreInput) maxScoreInput.value = assignment.maxScore.toString();
      if (descriptionInput) descriptionInput.value = assignment.description || '';
      if (plannedForInput) plannedForInput.checked = assignment.plannedFor || false;
      
      // Заполняем скрытые поля формы
      const scheduleIdInput = document.getElementById('assignment-scheduleId') as HTMLInputElement;
      const classIdInput = document.getElementById('assignment-classId') as HTMLInputElement;
      const subjectIdInput = document.getElementById('assignment-subjectId') as HTMLInputElement;
      const teacherIdInput = document.getElementById('assignment-teacherId') as HTMLInputElement;
      const subgroupIdInput = document.getElementById('assignment-subgroupId') as HTMLInputElement;
      
      if (scheduleIdInput) scheduleIdInput.value = assignment.scheduleId.toString();
      if (classIdInput) classIdInput.value = assignment.classId.toString();
      if (subjectIdInput) subjectIdInput.value = assignment.subjectId.toString();
      if (teacherIdInput) teacherIdInput.value = assignment.teacherId.toString();
      if (subgroupIdInput && assignment.subgroupId) subgroupIdInput.value = assignment.subgroupId.toString();
    }
    
    setIsAssignmentDialogOpen(true);
  };
  
  // Handle assignment form submission
  const onAssignmentSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    const formData = new FormData(event.currentTarget);
    const assignmentTypeValue = formData.get('assignmentType') as string;
    
    // Проверка корректности типа задания
    if (!Object.values(AssignmentTypeEnum).includes(assignmentTypeValue as AssignmentTypeEnum)) {
      toast({
        title: "Ошибка при добавлении задания",
        description: "Неправильный тип задания",
        variant: "destructive",
      });
      return;
    }
    
    // Создаем правильно типизированные данные
    const data = {
      assignmentType: assignmentTypeValue as AssignmentTypeEnum,
      maxScore: formData.get('maxScore') as string,
      description: formData.get('description') as string || null,
      scheduleId: parseInt(formData.get('scheduleId') as string),
      classId: parseInt(formData.get('classId') as string),
      subjectId: parseInt(formData.get('subjectId') as string),
      teacherId: parseInt(formData.get('teacherId') as string),
      subgroupId: formData.get('subgroupId') ? parseInt(formData.get('subgroupId') as string) : null,
      plannedFor: formData.get('plannedFor') === 'on',
    };
    
    if (editingAssignmentId) {
      // Updating existing assignment
      updateAssignmentMutation.mutate({ id: editingAssignmentId, data });
    } else {
      // Creating new assignment
      addAssignmentMutation.mutate(data as z.infer<typeof assignmentFormSchema>);
    }
  };
  
  // Handle assignment deletion
  const handleDeleteAssignment = (id: number) => {
    if (confirm('Вы уверены, что хотите удалить это задание? Все связанные оценки также будут удалены.')) {
      deleteAssignmentMutation.mutate(id);
    }
  };
  
  // Open dialog to change lesson status
  const openLessonStatusDialog = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setIsStatusDialogOpen(true);
  };
  
  // Handle schedule status update
  const handleScheduleStatusUpdate = (status: string) => {
    if (selectedSchedule) {
      updateScheduleStatusMutation.mutate({ id: selectedSchedule.id, status });
    }
  };
  
  // Function to check if a new grade can be added to a lesson
  const canAddGradeToLesson = (scheduleId: number, slot: LessonSlot) => {
    // Проверяем, проведен ли урок. Оценки можно выставлять только за проведенные уроки
    if (slot.status !== 'conducted') {
      return false;
    }
    
    // В накопительной системе, можно добавлять оценки только если есть задания для проведенного урока
    if (classData?.gradingSystem === GradingSystemEnum.CUMULATIVE) {
      return slot.assignments && slot.assignments.length > 0;
    }
    
    // В обычной системе можно добавлять оценки к любому проведенному уроку
    return true;
  };
  
  // Function to check if a student already has a grade for a specific assignment
  const hasStudentGradeForAssignment = (studentId: number, assignmentId: number): boolean => {
    if (!filteredGrades) return false;
    
    return filteredGrades.some(g => 
      g.studentId === studentId && 
      g.assignmentId === assignmentId
    );
  };
  
  // Function to check if a student has at least one available assignment without a grade
  const hasAvailableAssignmentsForGrading = (studentId: number, slot: LessonSlot): boolean => {
    // Если это не накопительная система, то всегда можно добавить оценку
    if (classData?.gradingSystem !== GradingSystemEnum.CUMULATIVE) {
      return true;
    }
    
    // Если нет заданий, нельзя добавить оценку
    if (!slot.assignments || slot.assignments.length === 0) {
      return false;
    }
    
    // Проверяем, есть ли хотя бы одно задание без оценки
    return slot.assignments.some(assignment => 
      !hasStudentGradeForAssignment(studentId, assignment.id)
    );
  };
  
  // Handle header click to show context menu or open assignment dialog
  const handleHeaderClick = (slot: LessonSlot) => {
    // Если это накопительная система, открываем диалог добавления задания
    if (classData?.gradingSystem === GradingSystemEnum.CUMULATIVE && canEditGrades) {
      openAssignmentDialog(slot.scheduleId);
    }
  };
  
  // Open dialog to view and mark attendance
  const openAttendanceDialog = (scheduleId: number) => {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (schedule) {
      setSelectedSchedule(schedule);
      setIsAttendanceDialogOpen(true);
    }
  };
  
  // Функция для экспорта данных в Excel (для демонстрации)
  const exportToExcel = () => {
    toast({
      title: "Экспорт в Excel",
      description: "Функция экспорта данных в Excel будет реализована в будущем.",
    });
  };
  
  // Render
  if (isClassLoading || isSubjectLoading) {
    return (
      <MainLayout>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-lg">Загрузка данных...</span>
        </div>
      </MainLayout>
    );
  }
  
  return (
    <MainLayout>
      <div className="container mx-auto p-4">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">
              Журнал оценок
            </h1>
            <div className="mt-1 flex items-center space-x-2 text-muted-foreground">
              <GraduationCapIcon className="h-4 w-4" />
              <span>{classData?.name || 'Класс'}</span>
              <span>•</span>
              <BookOpenIcon className="h-4 w-4" />
              <span>{subjectData?.name || 'Предмет'}</span>
              {subgroupData && (
                <>
                  <span>•</span>
                  <span className="text-yellow-600 font-medium">Подгруппа: {subgroupData.name}</span>
                </>
              )}
            </div>
          </div>
          
          <div className="mt-4 md:mt-0 flex flex-col md:flex-row gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate(`/dashboard`)}
            >
              Назад
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={exportToExcel}
            >
              <Download className="h-4 w-4 mr-2" />
              Экспорт
            </Button>
          </div>
        </div>
        
        {/* Main Content */}
        {isGradesLoading || isStudentsLoading || isSchedulesLoading || 
         (classData?.gradingSystem === GradingSystemEnum.CUMULATIVE && isAssignmentsLoading) ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-lg">Загрузка данных журнала...</span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* If no slots found */}
            {lessonSlots.length === 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Нет уроков</AlertTitle>
                <AlertDescription>
                  Расписание для этого предмета и класса не найдено. Добавьте уроки в расписание.
                </AlertDescription>
              </Alert>
            )}
            
            {lessonSlots.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    Оценки учеников
                    {classData?.gradingSystem === GradingSystemEnum.CUMULATIVE && (
                      <span className="ml-2 text-sm text-yellow-600 font-normal">
                        (Накопительная система)
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {subgroupData ? (
                      <>
                        Журнал оценок для подгруппы <span className="font-semibold">{subgroupData.name}</span> класса <span className="font-semibold">{classData?.name}</span> по предмету <span className="font-semibold">{subjectData?.name}</span>
                      </>
                    ) : (
                      <>
                        Журнал оценок класса <span className="font-semibold">{classData?.name}</span> по предмету <span className="font-semibold">{subjectData?.name}</span>
                      </>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-auto pb-6">
                  <div className="overflow-auto">
                    <Table className="min-w-[800px] border">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[200px] bg-muted/50 sticky left-0 z-10">
                            Ученик
                          </TableHead>
                          {lessonSlots.map((slot) => {
                            const hasAssignments = slot.assignments && slot.assignments.length > 0;
                            const isLessonConducted = slot.status === 'conducted';
                            
                            return (
                              <TableHead 
                                key={`${slot.date}-${slot.scheduleId}`} 
                                className={`text-center min-w-[100px] ${isLessonConducted ? 'bg-green-50' : ''}`}
                              >
                                <div className="flex flex-col items-center">
                                  <button 
                                    className="flex flex-col items-center hover:bg-muted/30 p-1 rounded-md w-full"
                                    onClick={() => handleHeaderClick(slot)}
                                    title={isLessonConducted ? "Открыть меню урока" : "Изменить статус урока"}
                                  >
                                    <div className="flex items-center font-medium">
                                      {slot.formattedDate}
                                      {isLessonConducted && (
                                        <span className="ml-1 text-green-600">
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                          </svg>
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {slot.startTime ? slot.startTime.slice(0, 5) : '-'}
                                    </div>
                                  </button>
                                  
                                  {/* Assignments for this slot */}
                                  {classData?.gradingSystem === GradingSystemEnum.CUMULATIVE && hasAssignments && (
                                    <div className="mt-1 flex flex-wrap gap-1 justify-center">
                                      {slot.assignments?.map((assignment) => (
                                        <span 
                                          key={assignment.id}
                                          className={`inline-block text-xs px-1.5 py-0.5 rounded cursor-pointer ${getAssignmentTypeColor(assignment.assignmentType)}`}
                                          title={`${getAssignmentTypeName(assignment.assignmentType)} (максимум ${assignment.maxScore} баллов)`}
                                          onClick={() => openEditAssignmentDialog(assignment)}
                                        >
                                          {getAssignmentTypeName(assignment.assignmentType).slice(0, 1)}
                                          {assignment.maxScore}
                                        </span>
                                      ))}
                                      
                                      {canEditGrades && (
                                        <button 
                                          className="inline-block text-xs px-1 rounded-full bg-muted hover:bg-muted-foreground/20"
                                          onClick={() => openAssignmentDialog(slot.scheduleId)}
                                          title="Добавить задание"
                                        >
                                          +
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  
                                  {/* Action buttons */}
                                  <div className="mt-1 flex gap-1">
                                    {canEditGrades && (
                                      <button 
                                        className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-muted-foreground/20"
                                        onClick={() => openLessonStatusDialog(schedules.find(s => s.id === slot.scheduleId) as Schedule)}
                                        title="Изменить статус урока"
                                      >
                                        Статус
                                      </button>
                                    )}
                                    
                                    {isLessonConducted && (
                                      <button 
                                        className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-muted-foreground/20"
                                        onClick={() => openAttendanceDialog(slot.scheduleId)}
                                        title="Посмотреть и отметить посещаемость"
                                      >
                                        Пос.
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </TableHead>
                            );
                          })}
                          <TableHead className="text-center sticky right-0 bg-muted/50">
                            Средний балл
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredStudents.map((student) => (
                          <TableRow key={student.id}>
                            <TableCell className="font-medium bg-muted/20">
                              {student.lastName} {student.firstName}
                            </TableCell>
                            {lessonSlots.map((slot) => {
                              const studentGrades = getStudentGradeForSlot(student.id, slot, filteredGrades);
                              
                              // Проверяем накопительную систему и наличие нескольких заданий
                              if (classData?.gradingSystem === GradingSystemEnum.CUMULATIVE && 
                                  slot.assignments && 
                                  slot.assignments.length > 1) {
                                // Если есть несколько заданий, создаем подколонки
                                return (
                                  <TableCell 
                                    key={`${slot.date}-${slot.scheduleId}`}
                                    className="text-center p-0 border"
                                  >
                                    <div className="flex divide-x divide-gray-200">
                                      {slot.assignments.map((assignment) => {
                                        // Находим оценку для студента по этому заданию
                                        const gradeForAssignment = filteredGrades.find(
                                          g => g.studentId === student.id && 
                                               g.scheduleId === slot.scheduleId && 
                                               g.assignmentId === assignment.id
                                        );
                                        
                                        return (
                                          <div 
                                            key={assignment.id}
                                            className={`${getAssignmentTypeColor(assignment.assignmentType)} flex-1 p-1 min-w-[50px]`}
                                          >
                                            {canEditGrades ? (
                                              gradeForAssignment ? (
                                                // Если оценка уже есть, показываем её с возможностью редактирования
                                                <div className="relative group">
                                                  <span 
                                                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium cursor-help`}
                                                    title={`${getAssignmentTypeName(assignment.assignmentType)}${gradeForAssignment.comment ? ': ' + gradeForAssignment.comment : ''}`}
                                                  >
                                                    {gradeForAssignment.grade}
                                                  </span>
                                                  
                                                  <div className="absolute invisible group-hover:visible -top-2 -right-2 flex space-x-1">
                                                    <Button
                                                      variant="outline"
                                                      size="icon"
                                                      className="h-5 w-5 p-0 bg-background border-muted-foreground/50"
                                                      onClick={() => openEditGradeDialog(gradeForAssignment)}
                                                      title="Редактировать оценку"
                                                    >
                                                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M12 20h9"></path>
                                                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                                                      </svg>
                                                    </Button>
                                                    <Button
                                                      variant="outline"
                                                      size="icon"
                                                      className="h-5 w-5 p-0 bg-background border-destructive text-destructive"
                                                      onClick={() => handleDeleteGrade(gradeForAssignment.id)}
                                                      title="Удалить оценку"
                                                    >
                                                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M3 6h18"></path>
                                                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                                      </svg>
                                                    </Button>
                                                  </div>
                                                </div>
                                              ) : (
                                                // Если оценки нет, показываем поле для прямого ввода
                                                <Input
                                                  type="number"
                                                  className="w-10 h-7 text-center p-0 text-sm mx-auto bg-transparent"
                                                  min={1}
                                                  max={parseInt(assignment.maxScore)}
                                                  placeholder=""
                                                  title={`${getAssignmentTypeName(assignment.assignmentType)} (макс. ${assignment.maxScore})`}
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                      const value = (e.target as HTMLInputElement).value;
                                                      if (value && !isNaN(parseInt(value))) {
                                                        // Создаем новую оценку прямо здесь
                                                        const gradeValue = parseInt(value);
                                                        const newGrade = {
                                                          studentId: student.id,
                                                          grade: gradeValue,
                                                          classId: classId,
                                                          subjectId: subjectId,
                                                          teacherId: user?.id as number,
                                                          scheduleId: slot.scheduleId,
                                                          assignmentId: assignment.id,
                                                          gradeType: assignment.assignmentType,
                                                          date: slot.date,
                                                          comment: '',
                                                          subgroupId: subgroupId
                                                        };
                                                        console.log("Добавление оценки:", newGrade);
                                                        addGradeMutation.mutate(newGrade);
                                                        (e.target as HTMLInputElement).value = '';
                                                      }
                                                    }
                                                  }}
                                                />
                                              )
                                            ) : gradeForAssignment ? (
                                              // Если нет прав на редактирование, просто показываем оценку
                                              <span 
                                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                                                title={`${getAssignmentTypeName(assignment.assignmentType)}${gradeForAssignment.comment ? ': ' + gradeForAssignment.comment : ''}`}
                                              >
                                                {gradeForAssignment.grade}
                                              </span>
                                            ) : (
                                              "-"
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </TableCell>
                                );
                              } else {
                                // Для одиночного задания или обычной системы оценок
                                return (
                                  <TableCell 
                                    key={`${slot.date}-${slot.scheduleId}`} 
                                    className={`text-center ${
                                      classData?.gradingSystem === GradingSystemEnum.CUMULATIVE && 
                                      slot.assignments && 
                                      slot.assignments.length === 1 
                                        ? getAssignmentTypeColor(slot.assignments[0].assignmentType) 
                                        : ''
                                    }`}
                                  >
                                    {studentGrades.length > 0 ? (
                                      <div className="flex flex-wrap justify-center gap-1 items-center">
                                        {studentGrades.map((grade) => (
                                          <div key={grade.id} className="relative group">
                                            <span 
                                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-help
                                                ${grade.gradeType === 'test' || grade.gradeType === 'Контрольная' ? 'bg-blue-600' : 
                                                grade.gradeType === 'exam' || grade.gradeType === 'Экзамен' ? 'bg-purple-600' : 
                                                grade.gradeType === 'homework' || grade.gradeType === 'Домашняя' ? 'bg-amber-600' : 
                                                grade.gradeType === 'project' ? 'bg-emerald-600' : 
                                                grade.gradeType === 'classwork' || grade.gradeType === 'Практическая' ? 'bg-green-600' :
                                                'bg-primary'} text-primary-foreground`}
                                              title={`${getGradeTypeName(grade.gradeType)}${grade.comment ? ': ' + grade.comment : ''}`}
                                            >
                                              {grade.grade}
                                            </span>
                                            
                                            {canEditGrades && (
                                              <div className="absolute invisible group-hover:visible -top-2 -right-2 flex space-x-1">
                                                <Button
                                                  variant="outline"
                                                  size="icon"
                                                  className="h-5 w-5 p-0 bg-background border-muted-foreground/50"
                                                  onClick={() => openEditGradeDialog(grade)}
                                                  title="Редактировать оценку"
                                                >
                                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M12 20h9"></path>
                                                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                                                  </svg>
                                                </Button>
                                                <Button
                                                  variant="outline"
                                                  size="icon"
                                                  className="h-5 w-5 p-0 bg-background border-destructive text-destructive"
                                                  onClick={() => handleDeleteGrade(grade.id)}
                                                  title="Удалить оценку"
                                                >
                                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M3 6h18"></path>
                                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                                                  </svg>
                                                </Button>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                        {/* Кнопка "+" для добавления еще одной оценки в тот же дату и урок */}
                                        {canEditGrades && 
                                         canAddGradeToLesson(slot.scheduleId, slot) && 
                                         hasAvailableAssignmentsForGrading(student.id, slot) && (
                                          <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-5 w-5 p-0 rounded-full ml-1"
                                            onClick={() => openGradeDialog(student.id, slot.date, slot.scheduleId)}
                                            title="Добавить еще одну оценку"
                                          >
                                            +
                                          </Button>
                                        )}
                                      </div>
                                    ) : canEditGrades && 
                                       canAddGradeToLesson(slot.scheduleId, slot) && 
                                       hasAvailableAssignmentsForGrading(student.id, slot) ? (
                                      // Если заданий нет или одно задание, добавляем возможность прямого ввода
                                      classData?.gradingSystem === GradingSystemEnum.CUMULATIVE && 
                                      slot.assignments && 
                                      slot.assignments.length === 1 ? (
                                        <Input
                                          type="number"
                                          className="w-10 h-7 text-center p-0 text-sm mx-auto bg-transparent"
                                          min={1}
                                          max={parseInt(slot.assignments[0].maxScore)}
                                          placeholder=""
                                          title={`${getAssignmentTypeName(slot.assignments[0].assignmentType)} (макс. ${slot.assignments[0].maxScore})`}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              const value = (e.target as HTMLInputElement).value;
                                              if (value && !isNaN(parseInt(value))) {
                                                // Проверяем, что введенная оценка не превышает максимальный балл
                                                const gradeValue = parseInt(value);
                                                
                                                // Проверка существования slot.assignments
                                                if (!slot.assignments || slot.assignments.length === 0) {
                                                  toast({
                                                    title: "Ошибка при добавлении оценки",
                                                    description: "Невозможно добавить оценку: задание не найдено",
                                                    variant: "destructive",
                                                  });
                                                  return;
                                                }

                                                // Теперь мы знаем, что slot.assignments существует и содержит элементы
                                                const assignment = slot.assignments[0];
                                                const maxScore = parseInt(assignment.maxScore);
                                                
                                                // Создаем переменную для хранения финальной оценки
                                                let finalGradeValue = gradeValue;
                                                
                                                // Если оценка превышает максимальный балл, снижаем её до максимального
                                                if (finalGradeValue > maxScore) {
                                                  finalGradeValue = maxScore;
                                                  toast({
                                                    title: "Оценка скорректирована",
                                                    description: `Оценка была автоматически снижена до максимального балла (${maxScore})`,
                                                  });
                                                }
                                                
                                                // Создаем новую оценку
                                                const newGrade = {
                                                  studentId: student.id,
                                                  grade: finalGradeValue, // Используем скорректированное значение оценки
                                                  classId: classId,
                                                  subjectId: subjectId,
                                                  teacherId: user?.id as number,
                                                  scheduleId: slot.scheduleId,
                                                  assignmentId: assignment.id,
                                                  gradeType: assignment.assignmentType,
                                                  date: slot.date,
                                                  comment: '',
                                                  subgroupId: subgroupId
                                                };
                                                console.log("Добавление оценки:", newGrade);
                                                addGradeMutation.mutate(newGrade);
                                                (e.target as HTMLInputElement).value = '';
                                              }
                                            }
                                          }}
                                        />
                                      ) : (
                                        <Button 
                                          variant="ghost" 
                                          size="sm" 
                                          className="h-7 w-7 p-0 rounded-full"
                                          onClick={() => openGradeDialog(student.id, slot.date, slot.scheduleId)}
                                        >
                                          +
                                        </Button>
                                      )
                                    ) : (
                                      "-"
                                    )}
                                  </TableCell>
                                );
                              }
                            })}
                            <TableCell className="text-center font-medium sticky right-0 bg-muted/30">
                              {calculateAverageGrade(student.id)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
        
        {/* Dialog for changing lesson status */}
        <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Статус урока</DialogTitle>
              <DialogDescription>
                {selectedSchedule && `Изменение статуса урока: ${
                  format(new Date(selectedSchedule.scheduleDate || ''), "dd.MM.yyyy", { locale: ru })
                } (${selectedSchedule.startTime?.slice(0, 5)} - ${selectedSchedule.endTime?.slice(0, 5)})`}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <Button 
                    variant={selectedSchedule?.status === 'not_conducted' ? 'default' : 'outline'} 
                    className="w-full py-8 flex flex-col items-center justify-center gap-2"
                    onClick={() => handleScheduleStatusUpdate('not_conducted')}
                  >
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      className="h-8 w-8" 
                      viewBox="0 0 20 20" 
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                    </svg>
                    <span>Не проведен</span>
                  </Button>
                  <Button 
                    variant={selectedSchedule?.status === 'conducted' ? 'default' : 'outline'} 
                    className="w-full py-8 flex flex-col items-center justify-center gap-2"
                    onClick={() => handleScheduleStatusUpdate('conducted')}
                  >
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      className="h-8 w-8" 
                      viewBox="0 0 20 20" 
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Проведен</span>
                  </Button>
                </div>
                <Button 
                  variant={selectedSchedule?.status === 'cancelled' ? 'default' : 'outline'} 
                  className="w-full py-8 flex flex-col items-center justify-center gap-2"
                  onClick={() => handleScheduleStatusUpdate('cancelled')}
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-8 w-8" 
                    viewBox="0 0 20 20" 
                    fill="currentColor"
                  >
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span>Отменен</span>
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        
        {/* Dialog for adding/editing grade */}
        <Dialog open={isGradeDialogOpen} onOpenChange={setIsGradeDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingGradeId ? "Редактировать оценку" : "Добавить оценку"}</DialogTitle>
              <DialogDescription>
                {selectedStudentId ? 
                  `${editingGradeId ? "Редактирование" : "Добавление"} оценки для ученика: ${
                    filteredStudents.find(s => s.id === selectedStudentId)?.lastName || ''
                  } ${filteredStudents.find(s => s.id === selectedStudentId)?.firstName || ''}`
                  : "Выберите ученика и введите оценку"
                }
                {selectedDate && ` (${format(new Date(selectedDate), "dd.MM.yyyy", { locale: ru })})`}
              </DialogDescription>
            </DialogHeader>
            
            <Form {...gradeForm}>
              <form onSubmit={gradeForm.handleSubmit(onGradeSubmit)} className="space-y-4">
                <FormField
                  control={gradeForm.control}
                  name="studentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ученик</FormLabel>
                      <Select
                        disabled={!!selectedStudentId} // Disable if student is preselected
                        value={field.value?.toString()}
                        onValueChange={(value) => field.onChange(parseInt(value))}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Выберите ученика" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {filteredStudents.map((student) => (
                            <SelectItem key={student.id} value={student.id.toString()}>
                              {student.lastName} {student.firstName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* If class uses cumulative grading and there are assignments, show assignment selection */}
                {classData?.gradingSystem === GradingSystemEnum.CUMULATIVE && (
                  <FormField
                    control={gradeForm.control}
                    name="assignmentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Задание</FormLabel>
                        <Select
                          value={field.value?.toString() || ''}
                          onValueChange={(value) => {
                            if (value) {
                              // Set assignmentId
                              field.onChange(parseInt(value));
                              // Also update selectedAssignmentId state which is used by getGradeFormSchema
                              setSelectedAssignmentId(parseInt(value));
                              
                              // Find the assignment to get its type and max score
                              const assignment = assignments.find(a => a.id === parseInt(value));
                              if (assignment) {
                                // Update gradeType based on assignment type
                                gradeForm.setValue('gradeType', assignment.assignmentType);
                              }
                            } else {
                              field.onChange(null);
                              setSelectedAssignmentId(null);
                            }
                          }}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Выберите задание" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {/* Filter assignments by scheduleId if it's selected */}
                            {(gradeForm.getValues('scheduleId') ?
                              assignments.filter(a => a.scheduleId === gradeForm.getValues('scheduleId')) :
                              assignments
                            ).map((assignment) => (
                              <SelectItem key={assignment.id} value={assignment.id.toString()}>
                                {getAssignmentTypeName(assignment.assignmentType)} ({assignment.maxScore} б.)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                        <FormDescription>
                          В накопительной системе оценка должна быть привязана к заданию
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={gradeForm.control}
                    name="grade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Оценка</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={
                              classData?.gradingSystem === GradingSystemEnum.CUMULATIVE && selectedAssignmentId
                                ? parseInt(assignments.find(a => a.id === selectedAssignmentId)?.maxScore || '5')
                                : 5
                            }
                            {...field}
                            value={field.value || ''}
                            onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {classData?.gradingSystem !== GradingSystemEnum.CUMULATIVE && (
                    <FormField
                      control={gradeForm.control}
                      name="gradeType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Тип оценки</FormLabel>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Выберите тип оценки" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="classwork">Работа на уроке</SelectItem>
                              <SelectItem value="homework">Домашнее задание</SelectItem>
                              <SelectItem value="test">Тест</SelectItem>
                              <SelectItem value="exam">Экзамен</SelectItem>
                              <SelectItem value="project">Проект</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
                
                <FormField
                  control={gradeForm.control}
                  name="comment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Комментарий (необязательно)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Введите комментарий к оценке"
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* Hidden fields */}
                <input type="hidden" {...gradeForm.register('classId')} />
                <input type="hidden" {...gradeForm.register('subjectId')} />
                <input type="hidden" {...gradeForm.register('teacherId')} />
                <input type="hidden" {...gradeForm.register('scheduleId')} />
                <input type="hidden" {...gradeForm.register('date')} />
                {subgroupId && (
                  <input type="hidden" {...gradeForm.register('subgroupId')} />
                )}
                
                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsGradeDialogOpen(false)}
                  >
                    Отмена
                  </Button>
                  <Button 
                    type="submit"
                    disabled={addGradeMutation.isPending || updateGradeMutation.isPending}
                  >
                    {(addGradeMutation.isPending || updateGradeMutation.isPending) && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {editingGradeId ? "Сохранить" : "Добавить"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        
        {/* Dialog for adding/editing assignment */}
        <Dialog open={isAssignmentDialogOpen} onOpenChange={setIsAssignmentDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingAssignmentId ? "Редактировать задание" : "Добавить задание"}
              </DialogTitle>
              <DialogDescription>
                {selectedSchedule && `Добавление задания к уроку: ${
                  format(new Date(selectedSchedule.scheduleDate || ''), "dd.MM.yyyy", { locale: ru })
                } (${selectedSchedule.startTime?.slice(0, 5)} - ${selectedSchedule.endTime?.slice(0, 5)})`}
                {subgroupData && ` - Подгруппа: ${subgroupData.name}`}
              </DialogDescription>
            </DialogHeader>
            
            <form id="assignment-form" onSubmit={onAssignmentSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="assignment-type" className="text-sm font-medium">
                  Тип задания
                </label>
                <Select name="assignmentType" defaultValue="classwork">
                  <SelectTrigger id="assignment-type">
                    <SelectValue placeholder="Выберите тип задания" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AssignmentTypeEnum.CLASSWORK}>Работа на уроке</SelectItem>
                    <SelectItem value={AssignmentTypeEnum.HOMEWORK}>Домашнее задание</SelectItem>
                    <SelectItem value={AssignmentTypeEnum.TEST_WORK}>Проверочная работа</SelectItem>
                    <SelectItem value={AssignmentTypeEnum.CONTROL_WORK}>Контрольная работа</SelectItem>
                    <SelectItem value={AssignmentTypeEnum.PROJECT_WORK}>Проект</SelectItem>
                    <SelectItem value={AssignmentTypeEnum.CURRENT_WORK}>Текущая работа</SelectItem>
                    <SelectItem value={AssignmentTypeEnum.CLASS_ASSIGNMENT}>Классная работа</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <label htmlFor="assignment-maxScore" className="text-sm font-medium">
                  Максимальный балл
                </label>
                <Input
                  type="number"
                  id="assignment-maxScore"
                  name="maxScore"
                  defaultValue="5"
                  min="1"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <label htmlFor="assignment-description" className="text-sm font-medium">
                  Описание (необязательно)
                </label>
                <Textarea
                  id="assignment-description"
                  name="description"
                  placeholder="Введите описание задания"
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox id="assignment-plannedFor" name="plannedFor" />
                <label
                  htmlFor="assignment-plannedFor"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Запланировано на будущее
                </label>
              </div>
              
              {/* Hidden fields */}
              <input type="hidden" id="assignment-scheduleId" name="scheduleId" />
              <input type="hidden" id="assignment-classId" name="classId" value={classId} />
              <input type="hidden" id="assignment-subjectId" name="subjectId" value={subjectId} />
              <input type="hidden" id="assignment-teacherId" name="teacherId" value={user?.id} />
              {subgroupId && (
                <input type="hidden" id="assignment-subgroupId" name="subgroupId" value={subgroupId} />
              )}
              
              <DialogFooter>
                {editingAssignmentId && (
                  <Button 
                    type="button" 
                    variant="destructive"
                    onClick={() => {
                      if (editingAssignmentId) {
                        handleDeleteAssignment(editingAssignmentId);
                        setIsAssignmentDialogOpen(false);
                      }
                    }}
                  >
                    Удалить
                  </Button>
                )}
                <div className="flex-1"></div>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsAssignmentDialogOpen(false)}
                >
                  Отмена
                </Button>
                <Button 
                  type="submit"
                  disabled={addAssignmentMutation.isPending || updateAssignmentMutation.isPending}
                >
                  {(addAssignmentMutation.isPending || updateAssignmentMutation.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {editingAssignmentId ? "Сохранить" : "Добавить"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        
        {/* Dialog for viewing and marking attendance */}
        <Dialog open={isAttendanceDialogOpen} onOpenChange={setIsAttendanceDialogOpen}>
          <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Посещаемость</DialogTitle>
              <DialogDescription>
                {selectedSchedule && `Урок: ${
                  format(new Date(selectedSchedule.scheduleDate || ''), "dd.MM.yyyy", { locale: ru })
                } (${selectedSchedule.startTime?.slice(0, 5)} - ${selectedSchedule.endTime?.slice(0, 5)})`}
                {subgroupData && ` - Подгруппа: ${subgroupData.name}`}
              </DialogDescription>
            </DialogHeader>
            
            {selectedSchedule && (
              <AttendanceForm 
                schedule={selectedSchedule}
                onClose={() => setIsAttendanceDialogOpen(false)}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}