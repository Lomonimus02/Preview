import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { MainLayout } from "@/components/layout/main-layout";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
import { CalendarIcon, BookOpenIcon, GraduationCapIcon, Loader2, AlertCircle, Download, PlusCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
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
  
  // Определяем схему на основе системы оценивания класса
  const gradeFormSchema = useMemo(() => {
    // Находим максимальный балл для выбранного задания (если выбрано)
    const maxScore = selectedAssignment ? parseInt(selectedAssignment.maxScore) : undefined;
    return createGradeFormSchema(classData?.gradingSystem, maxScore);
  }, [classData?.gradingSystem, selectedAssignment]);

  // Grade form
  const gradeForm = useForm<z.infer<ReturnType<typeof createGradeFormSchema>>>({
    resolver: zodResolver(gradeFormSchema),
    defaultValues: {
      studentId: undefined,
      grade: undefined,
      comment: "",
      gradeType: "Текущая",
      subjectId: subjectId,
      classId: classId,
      teacherId: user?.id,
      scheduleId: null, // Добавляем scheduleId с изначальным значением null
      subgroupId: subgroupId || null, // Важно! Устанавливаем subgroupId если открыт журнал подгруппы
      assignmentId: null, // Добавляем поле для связи с заданием (для накопительной системы)
    },
  });
  
  // Обновляем форму при изменении выбранного задания
  useEffect(() => {
    if (selectedAssignment) {
      gradeForm.setValue('assignmentId', selectedAssignment.id);
      // Перевалидируем форму с новыми ограничениями на максимальный балл
      gradeForm.trigger('grade');
    } else {
      gradeForm.setValue('assignmentId', null);
    }
  }, [selectedAssignment, gradeForm]);
  
  // Mutation to add grade
  const addGradeMutation = useMutation({
    mutationFn: async (data: z.infer<ReturnType<typeof createGradeFormSchema>>) => {
      // Убедимся, что scheduleId всегда передается, если был выбран конкретный урок
      const gradeData = {
        ...data,
        scheduleId: data.scheduleId || null,
      };
      const res = await apiRequest("/api/grades", "POST", gradeData);
      return res.json();
    },
    onMutate: async (newGradeData) => {
      // Отменяем исходящие запросы за оценками
      await queryClient.cancelQueries({ queryKey: ["/api/grades"] });
      
      // Сохраняем предыдущее состояние
      const previousGrades = queryClient.getQueryData<Grade[]>(["/api/grades"]) || [];
      const previousGradesWithFilter = queryClient.getQueryData<Grade[]>(["/api/grades", { classId, subjectId }]) || [];
      
      // Создаём временную оценку для оптимистичного обновления
      // Учитываем выбранную дату, если она есть
      let createdAtDate = new Date();
      
      // Если у нас есть selectedDate, используем его вместо текущей даты
      if (selectedDate) {
        // Правильная обработка строки даты - убеждаемся, что у нас всегда строка
        const dateString = selectedDate || '';
        if (dateString.trim() !== '') {
          createdAtDate = new Date(dateString);
        }
      }
      
      // Преобразуем Date в строку ISO для совместимости с типом в Grade
      const createdAt = createdAtDate.toISOString();
      
      // Создаём временную оценку для оптимистичного обновления интерфейса
      const tempGrade: Grade = {
        id: Date.now(), // Временный ID для локального отображения
        studentId: newGradeData.studentId!, 
        subjectId: newGradeData.subjectId!,
        classId: newGradeData.classId!,
        teacherId: newGradeData.teacherId!,
        grade: newGradeData.grade!,
        comment: newGradeData.comment || null,
        gradeType: newGradeData.gradeType || "Текущая",
        // Добавляем scheduleId для привязки к конкретному уроку
        scheduleId: newGradeData.scheduleId || null,
        // Очень важно! Добавляем subgroupId, если оценка ставится в подгруппе
        subgroupId: newGradeData.subgroupId || null,
        // Используем строковое представление даты для отображения в UI
        // В БД сама дата будет приведена к нужному типу
        createdAt: createdAt as unknown as Date,
      };
      
      // Оптимистично обновляем кеш react-query для обоих запросов
      queryClient.setQueryData<Grade[]>(["/api/grades"], [...previousGrades, tempGrade]);
      queryClient.setQueryData<Grade[]>(["/api/grades", { classId, subjectId }], [...previousGradesWithFilter, tempGrade]);
      
      // Возвращаем контекст с предыдущим состоянием
      return { previousGrades, previousGradesWithFilter };
    },
    onSuccess: (newGrade) => {
      // После успешного запроса обновляем кеш актуальными данными
      // Обновляем все запросы связанные с оценками
      queryClient.invalidateQueries({ 
        queryKey: ["/api/grades"]
      });
      
      // Инвалидируем запрос с конкретными параметрами класса и предмета (для основного журнала)
      queryClient.invalidateQueries({ 
        queryKey: ["/api/grades", { classId, subjectId }]
      });
      
      // Если оценка добавлена в подгруппе, инвалидируем запрос этой подгруппы
      if (subgroupId) {
        queryClient.invalidateQueries({ 
          queryKey: ["/api/grades", { classId, subjectId, subgroupId }]
        });
      }
      
      console.log("Запрос данных обновлен после добавления оценки:", { 
        classId, 
        subjectId, 
        subgroupId,
        grade: newGrade 
      });
      
      console.log("Оценка добавлена:", newGrade, "для подгруппы:", subgroupId);
      
      // Закрываем диалог только после успешного добавления
      setIsGradeDialogOpen(false);
      
      // Очищаем форму
      gradeForm.reset({
        studentId: undefined,
        grade: undefined,
        comment: "",
        gradeType: "Текущая",
        subjectId: subjectId,
        classId: classId,
        teacherId: user?.id,
        scheduleId: null, // Добавляем scheduleId с изначальным значением null
        subgroupId: subgroupId || null, // Сохраняем текущую подгруппу, если мы в контексте подгруппы
      });
      
      toast({
        title: "Оценка добавлена",
        description: "Оценка успешно добавлена в журнал",
      });
    },
    onError: (error, newGrade, context) => {
      // При ошибке возвращаем предыдущее состояние
      if (context?.previousGrades) {
        queryClient.setQueryData(["/api/grades"], context.previousGrades);
      }
      if (context?.previousGradesWithFilter) {
        queryClient.setQueryData(["/api/grades", { classId, subjectId }], context.previousGradesWithFilter);
      }
      
      toast({
        title: "Ошибка",
        description: "Не удалось добавить оценку. Попробуйте позже.",
        variant: "destructive",
      });
    },
    // Всегда возвращаемся к актуальному состоянию после выполнения мутации
    onSettled: () => {
      // Добавляем дополнительную инвалидацию для запроса с параметрами подгруппы
      queryClient.invalidateQueries({ queryKey: ["/api/grades"] });
      // Явно инвалидируем запрос с параметрами для текущего класса, предмета и подгруппы
      queryClient.invalidateQueries({ 
        queryKey: ["/api/grades", { classId, subjectId, subgroupId }] 
      });
      console.log("Запрос данных для подгруппы после сохранения оценки:", { classId, subjectId, subgroupId });
    },
  });
  
  // Mutation to update grade
  const updateGradeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: Partial<z.infer<typeof gradeFormSchema>> }) => {
      // Если мы обновляем только тип оценки, используем PATCH для частичного обновления
      if (Object.keys(data).length === 1 && 'gradeType' in data) {
        const res = await apiRequest(`/api/grades/${id}`, "PATCH", data);
        return res.json();
      } else {
        // Для полного обновления используем PUT 
        const res = await apiRequest(`/api/grades/${id}`, "PUT", data);
        return res.json();
      }
    },
    onMutate: async ({ id, data }) => {
      // Отменяем исходящие запросы
      await queryClient.cancelQueries({ queryKey: ["/api/grades"] });
      
      // Сохраняем предыдущее состояние
      const previousGrades = queryClient.getQueryData<Grade[]>(["/api/grades"]) || [];
      const previousGradesWithFilter = queryClient.getQueryData<Grade[]>(["/api/grades", { classId, subjectId }]) || [];
      
      // Функция обновления данных оценки
      const updateGradeData = (oldData: Grade[] = []) => {
        return oldData.map(grade => {
          if (grade.id === id) {
            // Обновляем существующую оценку
            return {
              ...grade,
              ...data,
              grade: data.grade || grade.grade, // Обновляем оценку, если она есть в data
              comment: data.comment !== undefined ? data.comment : grade.comment,
              gradeType: data.gradeType || grade.gradeType,
            };
          }
          return grade;
        });
      };
      
      // Оптимистично обновляем кеш в обоих запросах
      queryClient.setQueryData<Grade[]>(["/api/grades"], updateGradeData);
      queryClient.setQueryData<Grade[]>(["/api/grades", { classId, subjectId }], updateGradeData);
      
      return { previousGrades, previousGradesWithFilter };
    },
    onSuccess: (updatedGrade) => {
      // Обновляем все запросы связанные с оценками
      queryClient.invalidateQueries({ 
        queryKey: ["/api/grades"]
      });
      
      // Инвалидируем запрос с конкретными параметрами класса и предмета (для основного журнала)
      queryClient.invalidateQueries({ 
        queryKey: ["/api/grades", { classId, subjectId }]
      });
      
      // Если оценка обновлена в подгруппе, инвалидируем запрос этой подгруппы
      if (subgroupId) {
        queryClient.invalidateQueries({ 
          queryKey: ["/api/grades", { classId, subjectId, subgroupId }]
        });
      }
      
      console.log("Запрос данных обновлен после обновления оценки:", { 
        classId, 
        subjectId, 
        subgroupId,
        grade: updatedGrade 
      });
      
      // Закрываем диалог и очищаем форму после успешного обновления
      setIsGradeDialogOpen(false);
      setEditingGradeId(null);
      
      gradeForm.reset({
        studentId: undefined,
        grade: undefined,
        comment: "",
        gradeType: "Текущая",
        subjectId: subjectId,
        classId: classId,
        teacherId: user?.id,
        scheduleId: null, // Добавляем scheduleId с изначальным значением null
        subgroupId: subgroupId || null, // Сохраняем текущую подгруппу, если мы в контексте подгруппы
      });
      
      toast({
        title: "Оценка обновлена",
        description: "Оценка успешно обновлена в журнале",
      });
    },
    onError: (error, variables, context) => {
      // При ошибке возвращаем предыдущее состояние
      if (context?.previousGrades) {
        queryClient.setQueryData(["/api/grades"], context.previousGrades);
      }
      if (context?.previousGradesWithFilter) {
        queryClient.setQueryData(["/api/grades", { classId, subjectId }], context.previousGradesWithFilter);
      }
      
      toast({
        title: "Ошибка",
        description: "Не удалось обновить оценку. Попробуйте позже.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Добавляем дополнительную инвалидацию для запроса с параметрами подгруппы
      queryClient.invalidateQueries({ queryKey: ["/api/grades"] });
      
      // Явно инвалидируем запрос с параметрами для текущего класса, предмета и подгруппы
      queryClient.invalidateQueries({ 
        queryKey: ["/api/grades", { classId, subjectId, subgroupId }] 
      });
      
      console.log("Запрос данных после обновления оценки:", { classId, subjectId, subgroupId });
    },
  });
  
  // Форма для добавления задания
  const assignmentForm = useForm<z.infer<typeof assignmentFormSchema>>({
    resolver: zodResolver(assignmentFormSchema),
    defaultValues: {
      assignmentType: undefined,
      maxScore: "",
      description: "",
      scheduleId: undefined,
      subjectId: subjectId,
      classId: classId,
      teacherId: user?.id,
      subgroupId: subgroupId || undefined,
    },
  });

  // Mutation to add assignment
  const addAssignmentMutation = useMutation({
    mutationFn: async (data: z.infer<typeof assignmentFormSchema>) => {
      const res = await apiRequest("/api/assignments", "POST", data);
      return res.json();
    },
    onSuccess: (newAssignment) => {
      toast({
        title: "Задание создано",
        description: "Задание успешно добавлено к уроку",
      });
      
      // Ручное обновление lessonSlots
      // Добавляем созданное задание в соответствующий слот расписания
      const updatedLessonSlots = [...lessonSlots];
      const slotIndex = updatedLessonSlots.findIndex(
        slot => slot.scheduleId === newAssignment.scheduleId
      );
      
      if (slotIndex !== -1) {
        // Если нашли слот расписания, добавляем к нему задание
        if (!updatedLessonSlots[slotIndex].assignments) {
          updatedLessonSlots[slotIndex].assignments = [];
        }
        updatedLessonSlots[slotIndex].assignments?.push(newAssignment);
        
        // Обновляем состояние lessonSlots
        setLessonSlots(updatedLessonSlots);
        
        console.log('Задание добавлено в слот:', {
          slotIndex,
          slot: updatedLessonSlots[slotIndex],
          newAssignment
        });
      }
      
      // Обновляем кеш запросов
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ 
        queryKey: ["/api/assignments", { classId, subjectId, subgroupId }] 
      });
      
      // Закрываем диалог и сбрасываем форму
      setIsAssignmentDialogOpen(false);
      assignmentForm.reset({
        assignmentType: undefined,
        maxScore: "",
        description: "",
        scheduleId: undefined,
        subjectId: subjectId,
        classId: classId,
        teacherId: user?.id,
        subgroupId: subgroupId || undefined,
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: `Не удалось создать задание: ${error.message}`,
        variant: "destructive",
      });
    }
  });
  
  // Mutation to update assignment
  const updateAssignmentMutation = useMutation({
    mutationFn: async (data: z.infer<typeof assignmentFormSchema> & { id: number }) => {
      const { id, ...updateData } = data;
      const res = await apiRequest(`/api/assignments/${id}`, "PATCH", updateData);
      return res.json();
    },
    onSuccess: (updatedAssignment) => {
      toast({
        title: "Задание обновлено",
        description: "Задание успешно изменено",
      });
      
      // Обновляем кеш запросов
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ 
        queryKey: ["/api/assignments", { classId, subjectId, subgroupId }] 
      });
      
      // Закрываем диалог и сбрасываем форму
      setIsAssignmentDialogOpen(false);
      setEditingAssignmentId(null);
      setSelectedAssignmentForEdit(null);
      
      assignmentForm.reset({
        assignmentType: undefined,
        maxScore: "",
        description: "",
        scheduleId: undefined,
        subjectId: subjectId,
        classId: classId,
        teacherId: user?.id,
        subgroupId: subgroupId || undefined,
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: `Не удалось обновить задание: ${error.message}`,
        variant: "destructive",
      });
    }
  });
  
  // Mutation to delete assignment
  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/assignments/${id}`, "DELETE");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Задание удалено",
        description: "Задание успешно удалено",
      });
      
      // Обновляем кеш запросов
      queryClient.invalidateQueries({ queryKey: ["/api/assignments"] });
      queryClient.invalidateQueries({ 
        queryKey: ["/api/assignments", { classId, subjectId, subgroupId }] 
      });
    },
    onError: (error) => {
      console.error("Ошибка при удалении задания:", error);
      toast({
        title: "Ошибка",
        description: `Не удалось удалить задание: ${error.message}`,
        variant: "destructive",
      });
    }
  });

  // Mutation to update schedule status
  const updateScheduleStatusMutation = useMutation({
    mutationFn: async ({ scheduleId, status }: { scheduleId: number, status: string }) => {
      const res = await apiRequest(`/api/schedules/${scheduleId}/status`, "PATCH", { status });
      return res.json();
    },
    onSuccess: (updatedSchedule) => {
      // После успешного запроса обновляем кеш актуальными данными
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      
      // Закрываем диалог
      setIsStatusDialogOpen(false);
      setSelectedSchedule(null);
      
      toast({
        title: "Статус урока обновлен",
        description: updatedSchedule.status === "conducted" 
          ? "Урок отмечен как проведенный" 
          : "Урок отмечен как не проведенный",
      });
    },
    onError: (error: any) => {
      // Показываем ошибку пользователю
      toast({
        title: "Ошибка",
        description: "Не удалось обновить статус урока",
        variant: "destructive",
      });

      // Если ошибка из-за того, что урок еще не закончился, показываем подробности
      if (error.response) {
        error.response.json().then((data: any) => {
          if (data.message === "Cannot mark lesson as conducted before it ends") {
            toast({
              title: "Урок еще не закончился",
              description: "Вы не можете отметить урок как проведенный до его окончания",
              variant: "destructive",
            });
          }
        }).catch(() => {});
      }
    }
  });
  
  // Mutation to delete grade
  const deleteGradeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/grades/${id}`, "DELETE");
      return res.json();
    },
    onMutate: async (id) => {
      // Отменяем исходящие запросы
      await queryClient.cancelQueries({ queryKey: ["/api/grades"] });
      
      // Сохраняем предыдущее состояние
      const previousGrades = queryClient.getQueryData<Grade[]>(["/api/grades"]) || [];
      const previousGradesWithFilter = queryClient.getQueryData<Grade[]>(["/api/grades", { classId, subjectId }]) || [];
      
      // Функция фильтрации для удаления оценки
      const filterGradeData = (oldData: Grade[] = []) => {
        return oldData.filter(grade => grade.id !== id);
      };
      
      // Оптимистично обновляем кеш удаляя оценку из обоих запросов
      queryClient.setQueryData<Grade[]>(["/api/grades"], filterGradeData);
      queryClient.setQueryData<Grade[]>(["/api/grades", { classId, subjectId }], filterGradeData);
      
      return { previousGrades, previousGradesWithFilter };
    },
    onSuccess: () => {
      // Обновляем все запросы связанные с оценками
      queryClient.invalidateQueries({ 
        queryKey: ["/api/grades"]
      });
      
      // Инвалидируем запрос с конкретными параметрами класса и предмета (для основного журнала)
      queryClient.invalidateQueries({ 
        queryKey: ["/api/grades", { classId, subjectId }]
      });
      
      // Если оценка удалена в подгруппе, инвалидируем запрос этой подгруппы
      if (subgroupId) {
        queryClient.invalidateQueries({ 
          queryKey: ["/api/grades", { classId, subjectId, subgroupId }]
        });
      }
      
      console.log("Запрос данных обновлен после удаления оценки:", { 
        classId, 
        subjectId, 
        subgroupId
      });
      
      toast({
        title: "Оценка удалена",
        description: "Оценка успешно удалена из журнала",
      });
    },
    onError: (error, id, context) => {
      // При ошибке возвращаем предыдущее состояние
      if (context?.previousGrades) {
        queryClient.setQueryData(["/api/grades"], context.previousGrades);
      }
      if (context?.previousGradesWithFilter) {
        queryClient.setQueryData(["/api/grades", { classId, subjectId }], context.previousGradesWithFilter);
      }
      
      toast({
        title: "Ошибка",
        description: "Не удалось удалить оценку. Попробуйте позже.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      // Добавляем дополнительную инвалидацию для запроса с параметрами подгруппы
      queryClient.invalidateQueries({ queryKey: ["/api/grades"] });
      
      // Явно инвалидируем запрос с параметрами для текущего класса, предмета и подгруппы
      queryClient.invalidateQueries({ 
        queryKey: ["/api/grades", { classId, subjectId, subgroupId }] 
      });
      
      console.log("Запрос данных после удаления оценки:", { classId, subjectId, subgroupId });
    },
  });
  
  // Function to get schedule by its ID
  const getScheduleById = (scheduleId: number) => {
    return schedules.find(s => s.id === scheduleId);
  };
  
  // Open schedule status dialog
  const openStatusDialog = (scheduleId: number) => {
    const schedule = getScheduleById(scheduleId);
    if (schedule) {
      setSelectedSchedule(schedule);
      setIsStatusDialogOpen(true);
    }
  };
  
  // Handle schedule status update
  const handleScheduleStatusUpdate = (status: string) => {
    if (!selectedSchedule) return;
    
    updateScheduleStatusMutation.mutate({
      scheduleId: selectedSchedule.id,
      status
    });
  };
  
  // Open dialog to create a new assignment
  const openAssignmentDialog = (scheduleId?: number) => {
    // Сбрасываем информацию о редактировании задания
    setEditingAssignmentId(null);
    setSelectedAssignmentForEdit(null);
    
    // Если передан ID урока, находим его в списке
    if (scheduleId) {
      const schedule = getScheduleById(scheduleId);
      if (schedule) {
        // Проверяем, проведен ли урок
        if (schedule.status !== 'conducted') {
          toast({
            title: "Невозможно добавить задание",
            description: "Урок не отмечен как проведенный. Отметьте урок как проведенный, чтобы добавить задание.",
            variant: "destructive",
          });
          return;
        }
        setSelectedSchedule(schedule);
      }
    } else {
      setSelectedSchedule(null);
    }
    
    // Сбрасываем форму и устанавливаем значения по умолчанию
    assignmentForm.reset({
      assignmentType: undefined,
      maxScore: "",
      description: "",
      scheduleId: scheduleId || undefined,
      subjectId: subjectId,
      classId: classId,
      teacherId: user?.id,
      subgroupId: subgroupId || undefined,
    });
    
    setIsAssignmentDialogOpen(true);
  };
  
  // Open dialog to edit an existing assignment
  const openEditAssignmentDialog = (assignment: Assignment) => {
    setEditingAssignmentId(assignment.id);
    setSelectedAssignmentForEdit(assignment);
    
    // Находим урок, к которому привязано задание
    if (assignment.scheduleId) {
      const schedule = getScheduleById(assignment.scheduleId);
      if (schedule) {
        setSelectedSchedule(schedule);
      }
    }
    
    // Заполняем форму данными задания
    assignmentForm.reset({
      assignmentType: assignment.assignmentType as any,
      maxScore: assignment.maxScore.toString(),
      description: assignment.description || "",
      scheduleId: assignment.scheduleId || undefined,
      subjectId: assignment.subjectId,
      classId: assignment.classId,
      teacherId: assignment.teacherId,
      subgroupId: assignment.subgroupId || undefined,
    });
    
    setIsAssignmentDialogOpen(true);
  };
  
  // Handle assignment deletion
  const handleDeleteAssignment = (id: number) => {
    if (window.confirm("Вы действительно хотите удалить задание? Все оценки, связанные с этим заданием, будут удалены.")) {
      deleteAssignmentMutation.mutate(id);
    }
  };
  
  // Open grade dialog to edit existing grade
  const openEditGradeDialog = (grade: Grade) => {
    setSelectedStudentId(grade.studentId);
    setSelectedDate(null);
    setEditingGradeId(grade.id);
    
    // Если есть scheduleId и в накопительной системе, нужно найти задание
    if (grade.scheduleId && classData?.gradingSystem === GradingSystemEnum.CUMULATIVE) {
      // Ищем урок
      const slot = lessonSlots.find(slot => slot.scheduleId === grade.scheduleId);
      
      if (slot && slot.assignments && slot.assignments.length > 0) {
        // Если есть привязка к заданию, используем ее
        if ('assignmentId' in grade && grade.assignmentId) {
          const assignment = slot.assignments.find(a => a.id === grade.assignmentId);
          if (assignment) {
            setSelectedAssignment(assignment);
            setSelectedAssignmentId(assignment.id);
          }
        } 
        // Иначе берем первое задание (для обратной совместимости)
        else if (slot.assignments.length > 0) {
          setSelectedAssignment(slot.assignments[0]);
          setSelectedAssignmentId(slot.assignments[0].id);
        }
      }
    } else {
      // Сбрасываем выбранное задание
      setSelectedAssignment(null);
      setSelectedAssignmentId(null);
    }
    
    // Сбрасываем и заполняем форму данными существующей оценки
    gradeForm.reset({
      studentId: grade.studentId,
      grade: grade.grade,
      comment: grade.comment || "", // Преобразуем null в пустую строку для полей формы
      gradeType: grade.gradeType,
      subjectId: grade.subjectId,
      classId: grade.classId,
      teacherId: grade.teacherId,
      scheduleId: grade.scheduleId || null,
      subgroupId: grade.subgroupId || null, // Важно! Сохраняем связь с подгруппой при редактировании
      assignmentId: 'assignmentId' in grade ? grade.assignmentId : null, // Для накопительной системы
    });
    
    setIsGradeDialogOpen(true);
  };
  
  // Open grade dialog to add new grade
  const openGradeDialog = (studentId: number, date?: string, scheduleId?: number) => {
    setSelectedStudentId(studentId);
    setSelectedDate(date || null);
    setEditingGradeId(null);
    
    // Сбросим выбранное задание
    setSelectedAssignment(null);
    setSelectedAssignmentId(null);
    
    // Убираем ограничение для добавления заданий на непроведенные уроки
    // Теперь учитель может добавлять задания на любые уроки, включая непроведенные
    let canAddGrade = true;
    
    // Оставляем ссылку на расписание, чтобы использовать её в форме для установки статуса "plannedFor"
    const schedule = scheduleId ? getScheduleById(scheduleId) : null;
    
    if (canAddGrade) {
      // Сбрасываем форму и устанавливаем значения по умолчанию
      gradeForm.reset({
        studentId: studentId,
        grade: undefined,
        comment: "",
        gradeType: "Текущая",
        subjectId: subjectId,
        classId: classId,
        teacherId: user?.id,
        date: date || null,
        scheduleId: scheduleId || null,
        subgroupId: subgroupId || null, // Важно! Сохраняем связь с подгруппой при создании новой оценки
        assignmentId: null, // Сбрасываем ID задания
      });
      
      setIsGradeDialogOpen(true);
    }
  };
  
  // Handle grade form submission
  const onGradeSubmit = (data: z.infer<typeof gradeFormSchema>) => {
    if (editingGradeId) {
      // Updating existing grade
      updateGradeMutation.mutate({
        id: editingGradeId, 
        data
      });
    } else {
      // Проверяем, существует ли уже оценка для данного ученика и задания
      const studentId = data.studentId;
      const assignmentId = data.assignmentId;
      const scheduleId = data.scheduleId;
      
      // Если у нас есть scheduleId и assignmentId и урок проведен, проверяем на дублирование
      if (assignmentId && scheduleId) {
        const schedule = lessonSlots.find(s => s.scheduleId === scheduleId);
        const isConducted = schedule?.status === "conducted";
        
        if (isConducted) {
          const existingGrade = grades.find(g => 
            g.studentId === studentId && 
            g.assignmentId === assignmentId
          );
          
          if (existingGrade) {
            toast({
              title: "Оценка уже существует",
              description: "Для этого ученика уже выставлена оценка за данное задание. Отредактируйте существующую оценку.",
              variant: "destructive",
            });
            return; // Прерываем выполнение функции
          }
        }
      }
      
      // Adding new grade - обеспечиваем, что scheduleId, assignmentId и subgroupId всегда будут корректно установлены,
      // так как это критически важно для правильного отображения оценок в журналах
      const finalData = {
        ...data,
        scheduleId: data.scheduleId || null,
        subgroupId: data.subgroupId || null, // Сохраняем связь с подгруппой
        assignmentId: data.assignmentId || null // Для накопительной системы - ID задания
      };
      addGradeMutation.mutate(finalData);
    }
  };
  
  // Handle grade deletion
  const handleDeleteGrade = (id: number) => {
    if (window.confirm("Вы действительно хотите удалить оценку?")) {
      deleteGradeMutation.mutate(id);
    }
  };
  
  // Function to format date as "DD Month" (e.g. "15 марта")
  const formatFullDate = (dateString: string) => {
    return format(new Date(dateString), "d MMMM", { locale: ru });
  };
  
  // Get all grades for a specific student and schedule slot
  const getStudentGradeForSlot = (studentId: number, slot: { date: string, scheduleId: number }, allGrades: Grade[]) => {
    // Фильтруем оценки для конкретного ученика
    const studentGrades = allGrades.filter(g => g.studentId === studentId);
    
    // Проверяем оценки - теперь только те, которые привязаны к конкретному scheduleId
    return studentGrades.filter(g => 
      // Проверяем только оценки, привязанные к конкретному уроку по scheduleId
      g.scheduleId === slot.scheduleId
    );
  };
  
  // Функция для получения читаемого названия типа оценки
  const getGradeTypeName = (gradeType: string): string => {
    const gradeTypes: Record<string, string> = {
      'test': 'Контрольная работа',
      'exam': 'Экзамен',
      'homework': 'Домашняя работа',
      'project': 'Проект',
      'classwork': 'Классная работа',
      'Текущая': 'Текущая оценка',
      'Контрольная': 'Контрольная работа',
      'Экзамен': 'Экзамен',
      'Практическая': 'Практическая работа',
      'Домашняя': 'Домашняя работа'
    };
    
    return gradeTypes[gradeType] || gradeType;
  };

  // Фильтрация оценок в зависимости от подгруппы
  const filteredGrades = useMemo(() => {
    // Защита от пустых данных
    if (!grades || !grades.length) {
      return [];
    }
    
    // Логируем для отладки
    console.log("Фильтрация оценок:", {
      subgroupId,
      gradeCount: grades.length,
      scheduleCount: schedules.length,
      subjectId,
      studentSubgroupCount: studentSubgroups.length
    });
    
    // Если выбрана конкретная подгруппа (просмотр журнала подгруппы)
    if (subgroupId) {
      // 1. Получаем ID студентов этой подгруппы
      const subgroupStudentIds = studentSubgroups
        .filter(ss => ss.subgroupId === subgroupId)
        .map(ss => ss.studentId);
      
      console.log(`Студенты в подгруппе ${subgroupId}:`, subgroupStudentIds);
      
      // 2. Получаем все расписания (уроки) для этой подгруппы
      const subgroupScheduleIds = schedules
        .filter(schedule => schedule.subgroupId === subgroupId)
        .map(schedule => schedule.id);
      
      console.log(`Расписания для подгруппы ${subgroupId}:`, subgroupScheduleIds);
      
      // 3. Фильтруем оценки только для этой подгруппы
      const result = grades.filter(grade => {
        // Базовая проверка - оценка должна быть для этого предмета
        if (grade.subjectId !== subjectId) {
          return false;
        }
        
        // Используем два основных критерия проверки:
        
        // КРИТЕРИЙ 1: Оценка привязана к уроку этой конкретной подгруппы
        const isLinkedToSubgroupSchedule = grade.scheduleId && 
                                           subgroupScheduleIds.includes(grade.scheduleId);
        
        if (isLinkedToSubgroupSchedule) {
          return true; // Это главный критерий - показываем такие оценки всегда
        }
        
        // КРИТЕРИЙ 2: Студент в этой подгруппе и оценка либо:
        // - явно маркирована этой подгруппой через subgroupId
        // - не привязана ни к какому расписанию вообще (общая оценка)
        if (subgroupStudentIds.includes(grade.studentId)) {
          // Есть явная метка подгруппы, и это именно наша подгруппа
          if (grade.subgroupId === subgroupId) {
            return true;
          }
          
          // Оценка без привязки к расписанию, но студент в нашей подгруппе
          // Показываем ТОЛЬКО если нет явной привязки к другой подгруппе
          if (!grade.scheduleId && grade.subgroupId === null) {
            return true;
          }
        }
        
        return false;
      });
      
      console.log(`Отфильтровано ${result.length} оценок для подгруппы ${subgroupId}`);
      return result;
    } 
    // Если просматриваем журнал основного предмета (не подгруппы)
    else {
      // 1. Собираем все ID подгрупп, связанных с этим предметом
      const relatedSubgroupIds = schedules
        .filter(schedule => 
          schedule.subjectId === subjectId && 
          schedule.subgroupId !== null
        )
        .map(schedule => schedule.subgroupId)
        .filter((id): id is number => id !== null);
      
      // Убираем дубликаты, если есть
      const uniqueSubgroupIds = [...new Set(relatedSubgroupIds)];
      console.log(`Подгруппы для предмета ${subjectId}:`, uniqueSubgroupIds);
      
      // 2. Собираем все расписания (уроки) этих подгрупп
      const subgroupScheduleIds = schedules
        .filter(schedule => 
          schedule.subjectId === subjectId && 
          schedule.subgroupId !== null
        )
        .map(schedule => schedule.id);
      
      console.log(`Расписания подгрупп предмета ${subjectId}:`, subgroupScheduleIds);
      
      // 3. Собираем ID студентов, входящих в эти подгруппы
      const subgroupStudentIds = new Set<number>();
      
      // Обрабатываем каждую подгруппу связанную с этим предметом
      uniqueSubgroupIds.forEach(sgId => {
        const studentsInSubgroup = studentSubgroups
          .filter(ss => ss.subgroupId === sgId)
          .map(ss => ss.studentId);
        
        studentsInSubgroup.forEach(id => subgroupStudentIds.add(id));
      });
      
      console.log(`Студенты в подгруппах предмета ${subjectId}:`, [...subgroupStudentIds]);
      
      // 4. Фильтруем оценки для основного предмета, исключая подгруппы
      const result = grades.filter(grade => {
        // Базовая проверка - оценка должна быть для этого предмета
        if (grade.subjectId !== subjectId) {
          return false;
        }
        
        // КРИТЕРИЙ 1: Оценка не должна быть связана с уроком в подгруппе
        if (grade.scheduleId && subgroupScheduleIds.includes(grade.scheduleId)) {
          return false; // Оценка связана с уроком подгруппы, не показываем в основном журнале
        }
        
        // КРИТЕРИЙ 2: Оценка не должна быть явно помечена как оценка подгруппы
        if (grade.subgroupId !== null && uniqueSubgroupIds.includes(grade.subgroupId)) {
          return false; // Явная метка подгруппы, не показываем в основном журнале
        }
        
        // КРИТЕРИЙ 3: Если студент состоит в подгруппе по этому предмету,
        // то не показываем его оценки без расписания в основном журнале
        // (они должны быть только в журнале подгруппы)
        if (subgroupStudentIds.has(grade.studentId) && !grade.scheduleId) {
          return false;
        }
        
        // В остальных случаях показываем оценку в основном журнале
        return true;
      });
      
      console.log(`Отфильтровано ${result.length} оценок для основного предмета ${subjectId}`);
      return result;
    }
  }, [grades, subgroupId, schedules, filteredStudents, subjectId, studentSubgroups]);

  // Calculate average grade for a student with weight based on grade type
  const calculateAverageGrade = (studentId: number) => {
    const studentGrades = filteredGrades.filter(g => g.studentId === studentId);
    if (studentGrades.length === 0) return "-";
    
    // Если используется накопительная система оценивания
    if (classData?.gradingSystem === GradingSystemEnum.CUMULATIVE) {
      // Для накопительной системы используем другой алгоритм расчета
      // Считаем сумму полученных баллов и максимально возможных для всех заданий
      
      let totalEarnedScore = 0;
      let totalMaxScore = 0;
      
      // Для каждой оценки находим соответствующее задание, чтобы получить максимальный балл
      studentGrades.forEach(grade => {
        // Находим урок, на который эта оценка
        const slot = lessonSlots.find(slot => slot.scheduleId === grade.scheduleId);
        if (slot && slot.assignments && slot.assignments.length > 0) {
          // Если нет конкретной связи с заданием, берем первое задание урока
          const assignmentId = grade.assignmentId || slot.assignments[0].id;
          
          // Находим задание с соответствующим ID
          const assignment = slot.assignments.find(a => a.id === assignmentId);
          
          if (assignment) {
            // Если нашли задание, добавляем баллы
            totalEarnedScore += grade.grade;
            totalMaxScore += Number(assignment.maxScore);
          }
        }
      });
      
      // Если нет максимального балла, возвращаем прочерк
      if (totalMaxScore === 0) return "-";
      
      // Вычисляем процент выполнения и форматируем его
      const percentage = (totalEarnedScore / totalMaxScore) * 100;
      return `${percentage.toFixed(1)}%`;
    } else {
      // Для пятибалльной системы оценивания - используем старый алгоритм с весами
      
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
      
      studentGrades.forEach(grade => {
        const weight = weights[grade.gradeType] || 1;
        weightedSum += grade.grade * weight;
        totalWeight += weight;
      });
      
      // Если нет оценок с весами, возвращаем "-"
      if (totalWeight === 0) return "-";
      
      const average = weightedSum / totalWeight;
      return average.toFixed(1);
    }
  };
  
  // Determine if a lesson is conducted
  const isLessonConducted = (scheduleId: number) => {
    const schedule = schedules.find(s => s.id === scheduleId);
    return schedule?.status === 'conducted';
  };
  
  // Проверяет, можно ли добавить оценку для урока в накопительной системе
  const canAddGradeToLesson = (scheduleId: number, slot: LessonSlot) => {
    // Для пятибалльной системы достаточно только, чтобы урок был проведен
    if (!classData || classData.gradingSystem !== GradingSystemEnum.CUMULATIVE) {
      return isLessonConducted(scheduleId);
    }
    
    // Для накопительной системы важно, чтобы были задания, но не требуется, чтобы урок был проведен
    // Это позволяет добавлять задания и для непроведенных уроков
    return slot.assignments && slot.assignments.length > 0;
  };
  
  // Функция для определения должен ли клик по заголовку колонки открыть диалог статуса или диалог добавления задания
  const handleHeaderClick = (slot: LessonSlot) => {
    if (!canEditGrades) return;
    
    // Находим урок и проверяем его статус
    const schedule = getScheduleById(slot.scheduleId);
    if (!schedule) return;
    
    // Изменено условие, чтобы можно было добавлять задания и для непроведенных уроков
    if (classData?.gradingSystem === GradingSystemEnum.CUMULATIVE) {
      // Если у урока уже есть задания, предлагаем добавить еще одно
      if (slot.assignments && slot.assignments.length > 0) {
        // Открываем диалог добавления задания
        openAssignmentDialog(slot.scheduleId);
      } else {
        // Открываем диалог добавления первого задания
        openAssignmentDialog(slot.scheduleId);
      }
    } else {
      // Для всех остальных случаев - открываем диалог статуса урока
      openStatusDialog(slot.scheduleId);
    }
  };
  
  // Loading state
  const isLoading = isClassLoading || isSubjectLoading || isStudentsLoading || isSchedulesLoading || isGradesLoading;
  
  // Redirect if user is not logged in
  useEffect(() => {
    if (!user) {
      navigate("/");
    }
  }, [user, navigate]);
  
  // Функция экспорта данных таблицы в CSV
  const exportToCSV = () => {
    if (!classData || !subjectData || !filteredStudents.length) return;
    
    // Создаем заголовок таблицы
    let csvContent = "Ученик,";
    
    // Добавляем даты уроков в заголовок
    lessonSlots.forEach(slot => {
      csvContent += `${slot.formattedDate},`;
    });
    
    csvContent += "Средний балл\n";
    
    // Добавляем данные по каждому ученику
    filteredStudents.forEach(student => {
      const studentName = `${student.lastName} ${student.firstName}`;
      csvContent += `${studentName},`;
      
      // Добавляем оценки по каждому уроку
      lessonSlots.forEach(slot => {
        const grades = getStudentGradeForSlot(student.id, slot, filteredGrades);
        if (grades.length > 0) {
          // Если есть несколько оценок для одного урока, разделяем их точкой с запятой
          csvContent += grades.map(g => g.grade).join(";");
        }
        csvContent += ",";
      });
      
      // Добавляем средний балл
      csvContent += calculateAverageGrade(student.id) + "\n";
    });
    
    // Создаем Blob для скачивания
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // Создаем временную ссылку для скачивания файла
    const link = document.createElement("a");
    const fileName = `Оценки_${subjectData?.name}_${classData?.name}_${new Date().toLocaleDateString()}.csv`;
    
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <MainLayout>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Журнал оценок
              {subgroupData ? (
                <span className="text-emerald-600 ml-2">
                  ({subgroupData.name})
                </span>
              ) : null}
            </h1>
            <p className="text-muted-foreground">
              {subgroupData 
                ? `Просмотр и редактирование оценок учеников подгруппы "${subgroupData.name}"`
                : "Просмотр и редактирование оценок учеников класса"}
            </p>
          </div>
          <div className="flex gap-2">
            {/* Показываем кнопку создания задания только если выбран накопительный тип оценивания */}
            {classData?.gradingSystem === GradingSystemEnum.CUMULATIVE && canEditGrades && (
              <Button
                variant="default"
                className="gap-2"
                onClick={() => openAssignmentDialog()}
                disabled={isLoading}
              >
                <PlusCircle className="h-4 w-4" />
                Добавить задание
              </Button>
            )}
            <Button
              variant="outline"
              className="gap-2"
              onClick={exportToCSV}
              disabled={isLoading || !filteredStudents.length}
            >
              <Download className="h-4 w-4" />
              Экспорт
            </Button>
          </div>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center items-center h-[300px]">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GraduationCapIcon className="h-5 w-5" />
                    Информация о классе
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {classData && (
                    <div className="space-y-2">
                      <div>
                        <h3 className="font-medium">Класс:</h3>
                        <p className="text-lg text-muted-foreground">{classData.name}</p>
                      </div>
                      <div>
                        <h3 className="font-medium">Всего учеников:</h3>
                        <p className="text-lg text-muted-foreground">
                          {subgroupId 
                            ? `${filteredStudents.length} (из подгруппы)`
                            : students.length}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpenIcon className="h-5 w-5" />
                    Информация о предмете
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {subjectData && (
                    <div className="space-y-2">
                      <div>
                        <h3 className="font-medium">Предмет:</h3>
                        <p className="text-lg text-muted-foreground">{subjectData.name}</p>
                      </div>
                      <div>
                        <h3 className="font-medium">Всего уроков:</h3>
                        <p className="text-lg text-muted-foreground">{lessonSlots.length}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  Оценки по предмету
                  {subgroupId && subgroupData && (
                    <span className="ml-2 text-sm bg-primary/10 text-primary px-2 py-1 rounded-md">
                      Подгруппа: {subgroupData.name}
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  {subgroupId 
                    ? `Журнал показывает только учеников из выбранной подгруппы. `
                    : ''}
                  Нажмите на ячейку с "+" чтобы добавить оценку. Нажмите на дату урока, чтобы изменить его статус.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto">
                  <Table className="border">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="bg-muted/50 sticky left-0">
                          Ученик
                        </TableHead>
                        {lessonSlots.map((slot) => {
                          const isLessonConducted = schedules.find(s => s.id === slot.scheduleId)?.status === 'conducted';
                          return (
                            <TableHead 
                              key={`${slot.date}-${slot.scheduleId}`} 
                              className="text-center cursor-pointer"
                              onClick={() => canEditGrades ? handleHeaderClick(slot) : null}
                            >
                              <div className="flex flex-col items-center justify-center">
                                {slot.formattedDate}
                                {slot.startTime && <span className="text-xs">({slot.startTime.slice(0, 5)})</span>}
                                {/* Отображаем задания в заголовке если они есть */}
                                {slot.assignments && slot.assignments.length > 0 && classData?.gradingSystem === GradingSystemEnum.CUMULATIVE && (
                                  <div className="flex flex-wrap mt-1 mb-1 gap-1 justify-center text-xs">
                                    {slot.assignments.map(assignment => (
                                      <span 
                                        key={assignment.id}
                                        className={`${getAssignmentTypeColor(assignment.assignmentType)} text-gray-800 px-1.5 py-0.5 rounded-sm border border-gray-300 cursor-pointer hover:border-primary hover:bg-primary/10 transition-colors`}
                                        title={`${getAssignmentTypeName(assignment.assignmentType)}: ${assignment.maxScore} баллов. Нажмите для редактирования.`}
                                        onClick={(e) => {
                                          e.stopPropagation(); // Предотвращаем открытие диалога статуса
                                          openEditAssignmentDialog(assignment);
                                        }}
                                      >
                                        {getAssignmentTypeName(assignment.assignmentType).substring(0, 2)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {isLessonConducted && (
                                  <div className="flex items-center">
                                    <span className="text-green-600 ml-1">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                      </svg>
                                    </span>
                                    
                                    {/* Кнопка для добавления задания (только для накопительной системы) */}
                                    {classData?.gradingSystem === GradingSystemEnum.CUMULATIVE && canEditGrades && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation(); // Предотвращаем открытие диалога статуса
                                          openAssignmentDialog(slot.scheduleId);
                                        }}
                                        className="ml-1 text-primary hover:text-primary-dark focus:outline-none"
                                        title="Добавить задание"
                                      >
                                        <PlusCircle className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                )}
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
                            return (
                              <TableCell 
                                key={`${slot.date}-${slot.scheduleId}`} 
                                className={`text-center ${
                                  classData?.gradingSystem === GradingSystemEnum.CUMULATIVE && 
                                  slot.assignments && 
                                  slot.assignments.length > 0 
                                    ? slot.assignments.length === 1 
                                      ? getAssignmentTypeColor(slot.assignments[0].assignmentType) 
                                      : 'bg-gray-50 border-gray-200' 
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
                                    {canEditGrades && canAddGradeToLesson(slot.scheduleId, slot) && (
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
                                ) : canEditGrades && canAddGradeToLesson(slot.scheduleId, slot) ? (
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 w-7 p-0 rounded-full"
                                    onClick={() => openGradeDialog(student.id, slot.date, slot.scheduleId)}
                                  >
                                    +
                                  </Button>
                                ) : (
                                  "-"
                                )}
                              </TableCell>
                            );
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
                } (${selectedSchedule.startTime.slice(0, 5)} - ${selectedSchedule.endTime.slice(0, 5)})`}
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
                      <path 
                        fillRule="evenodd" 
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" 
                        clipRule="evenodd" 
                      />
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
                      <path 
                        fillRule="evenodd" 
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" 
                        clipRule="evenodd" 
                      />
                    </svg>
                    <span>Проведен</span>
                  </Button>
                </div>
                
                <p className="text-sm text-muted-foreground">
                  Статус урока влияет на возможность выставления оценок.
                  Оценки можно ставить только для проведенных уроков.
                </p>
                
                {/* Check if the current time is before the lesson time */}
                {selectedSchedule && new Date() < new Date(`${selectedSchedule.scheduleDate}T${selectedSchedule.endTime}`) && (
                  <>
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Внимание</AlertTitle>
                      <AlertDescription>
                        Урок еще не завершился. Отметить урок как проведенный можно только после его окончания.
                      </AlertDescription>
                    </Alert>
                    
                    {/* Кнопка для добавления запланированного задания для будущего урока */}
                    {classData?.gradingSystem === GradingSystemEnum.CUMULATIVE && (
                      <div className="mt-4">
                        <Alert className="bg-amber-50 border-amber-200">
                          <CalendarIcon className="h-4 w-4 text-amber-600" />
                          <AlertTitle className="text-amber-700">Запланировать задание</AlertTitle>
                          <AlertDescription className="text-amber-700">
                            Вы можете запланировать задание к этому уроку заранее. Запланированные задания не влияют на среднюю оценку до проведения урока.
                          </AlertDescription>
                        </Alert>
                        
                        <Button 
                          variant="outline" 
                          className="w-full mt-2 text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                          onClick={() => {
                            setIsStatusDialogOpen(false);
                            // Автоматически устанавливаем флаг plannedFor для заданий будущих уроков
                            if (selectedSchedule) {
                              // Пре-заполняем форму для запланированного задания
                              assignmentForm.reset({
                                assignmentType: AssignmentTypeEnum.HOMEWORK,
                                maxScore: "10",
                                description: "",
                                scheduleId: selectedSchedule.id,
                                subjectId: subjectId,
                                classId: classId,
                                teacherId: user?.id || 0,
                                subgroupId: subgroupId || null,
                                plannedFor: true // Автоматически помечаем как запланированное
                              });
                              setSelectedSchedule(selectedSchedule);
                              setIsAssignmentDialogOpen(true);
                            }
                          }}
                        >
                          <CalendarIcon className="h-4 w-4 mr-2" />
                          Запланировать задание
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setIsStatusDialogOpen(false)}
              >
                Закрыть
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Dialog for adding an assignment */}
        <Dialog open={isAssignmentDialogOpen} onOpenChange={setIsAssignmentDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingAssignmentId ? "Изменить задание" : "Добавить задание"}</DialogTitle>
              <DialogDescription>
                {editingAssignmentId 
                  ? "Измените параметры существующего задания" 
                  : "Создайте новое задание для накопительной системы оценивания."}
              </DialogDescription>
            </DialogHeader>
            <Form {...assignmentForm}>
              <form onSubmit={assignmentForm.handleSubmit(data => {
                if (editingAssignmentId) {
                  updateAssignmentMutation.mutate({
                    id: editingAssignmentId,
                    ...data
                  });
                } else {
                  addAssignmentMutation.mutate(data);
                }
              })}>
                <div className="grid gap-4 py-4">
                  <FormField
                    control={assignmentForm.control}
                    name="assignmentType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Тип задания</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Выберите тип задания" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={AssignmentTypeEnum.CONTROL_WORK}>Контрольная работа</SelectItem>
                            <SelectItem value={AssignmentTypeEnum.TEST_WORK}>Проверочная работа</SelectItem>
                            <SelectItem value={AssignmentTypeEnum.CURRENT_WORK}>Текущая работа</SelectItem>
                            <SelectItem value={AssignmentTypeEnum.HOMEWORK}>Домашнее задание</SelectItem>
                            <SelectItem value={AssignmentTypeEnum.CLASSWORK}>Работа на уроке</SelectItem>
                            <SelectItem value={AssignmentTypeEnum.PROJECT_WORK}>Работа с проектом</SelectItem>
                            <SelectItem value={AssignmentTypeEnum.CLASS_ASSIGNMENT}>Классная работа</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={assignmentForm.control}
                    name="maxScore"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Максимальный балл</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Введите максимальный балл" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={assignmentForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Описание (опционально)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Введите описание задания"
                            onChange={field.onChange}
                            value={field.value || ""}
                            ref={field.ref}
                            name={field.name}
                            onBlur={field.onBlur}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={assignmentForm.control}
                    name="plannedFor"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>
                            Запланированное задание
                          </FormLabel>
                          <p className="text-sm text-muted-foreground">
                            Оценки за это задание будут учитываться в среднем проценте только после проведения урока
                          </p>
                        </div>
                      </FormItem>
                    )}
                  />
                  
                  {!selectedSchedule && !editingAssignmentId && (
                    <FormField
                      control={assignmentForm.control}
                      name="scheduleId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Урок</FormLabel>
                          <Select
                            onValueChange={(value) => field.onChange(parseInt(value))}
                            value={field.value?.toString()}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Выберите урок" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {schedules
                                .filter(s => s.subjectId === subjectId && 
                                             (subgroupId ? s.subgroupId === subgroupId : true) &&
                                             s.status === 'conducted')
                                .map(schedule => (
                                  <SelectItem key={schedule.id} value={schedule.id.toString()}>
                                    {format(new Date(schedule.scheduleDate || ''), "dd.MM.yyyy", { locale: ru })} - {schedule.startTime}
                                    {schedule.subgroupId && ` (${allSubgroups.find(sg => sg.id === schedule.subgroupId)?.name || 'Подгруппа'})`}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
                <DialogFooter className="flex justify-between">
                  {editingAssignmentId && (
                    <Button 
                      type="button" 
                      variant="destructive"
                      onClick={() => {
                        if (window.confirm("Вы уверены, что хотите удалить это задание? Все связанные оценки будут удалены.")) {
                          deleteAssignmentMutation.mutate(editingAssignmentId);
                          setIsAssignmentDialogOpen(false);
                        }
                      }}
                      disabled={deleteAssignmentMutation.isPending}
                    >
                      {deleteAssignmentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Удалить
                    </Button>
                  )}
                  <Button 
                    type="submit" 
                    disabled={editingAssignmentId 
                      ? updateAssignmentMutation.isPending 
                      : addAssignmentMutation.isPending}
                  >
                    {(editingAssignmentId 
                      ? updateAssignmentMutation.isPending 
                      : addAssignmentMutation.isPending) && 
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editingAssignmentId ? "Сохранить изменения" : "Создать задание"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        
        {/* Dialog for adding a grade */}
        <Dialog open={isGradeDialogOpen} onOpenChange={setIsGradeDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingGradeId ? "Редактировать оценку" : "Добавить оценку"}</DialogTitle>
              <DialogDescription>
                {selectedStudentId ? 
                  `${editingGradeId ? "Редактирование" : "Добавление"} оценки для ученика: ${
                    filteredStudents.find(s => s.id === selectedStudentId)?.lastName || ""
                  } ${
                    filteredStudents.find(s => s.id === selectedStudentId)?.firstName || ""
                  }${selectedDate ? ` (${selectedDate})` : ""}` : 
                  `${editingGradeId ? "Редактирование" : "Добавление"} оценки`
                }
              </DialogDescription>
            </DialogHeader>
            
            <Form {...gradeForm}>
              <form onSubmit={gradeForm.handleSubmit(onGradeSubmit)} className="space-y-4">
                {!selectedStudentId && (
                  <FormField
                    control={gradeForm.control}
                    name="studentId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ученик</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(parseInt(value))}
                          defaultValue={field.value?.toString()}
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
                )}
                
                {/* Разные элементы формы в зависимости от системы оценивания */}
                {classData?.gradingSystem === GradingSystemEnum.CUMULATIVE ? (
                  <>
                    {/* Форма выбора задания для накопительной системы */}
                    <FormField
                      control={gradeForm.control}
                      name="assignmentId"
                      render={({ field }) => {
                        // Получаем задания для этого урока
                        const scheduleId = gradeForm.getValues().scheduleId;
                        const slot = lessonSlots.find(s => s.scheduleId === scheduleId);
                        const availableAssignments = slot?.assignments || [];
                        
                        return (
                          <FormItem>
                            <FormLabel>Задание</FormLabel>
                            <Select
                              onValueChange={(value) => {
                                // При выборе задания обновляем selectedAssignment
                                const assignmentId = parseInt(value);
                                field.onChange(assignmentId);
                                const assignment = availableAssignments.find(a => a.id === assignmentId);
                                if (assignment) {
                                  setSelectedAssignment(assignment);
                                  setSelectedAssignmentId(assignment.id);
                                  // Автоматически устанавливаем тип оценки на основе типа задания
                                  gradeForm.setValue('gradeType', assignment.assignmentType);
                                }
                              }}
                              defaultValue={field.value?.toString()}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Выберите задание" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {availableAssignments.length > 0 ? (
                                  availableAssignments.map((assignment) => (
                                    <SelectItem key={assignment.id} value={assignment.id.toString()}>
                                      {getAssignmentTypeName(assignment.assignmentType)} ({assignment.maxScore} б.)
                                    </SelectItem>
                                  ))
                                ) : (
                                  <SelectItem disabled value="none">
                                    Нет доступных заданий
                                  </SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                    
                    {/* Поле для ввода баллов */}
                    {selectedAssignment ? (
                      <FormField
                        control={gradeForm.control}
                        name="grade"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Балл (макс. {selectedAssignment.maxScore})</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                max={selectedAssignment.maxScore.toString()}
                                {...field}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value);
                                  const maxScore = parseFloat(selectedAssignment.maxScore.toString());
                                  if (value > maxScore) {
                                    // Ограничиваем значение максимальным баллом
                                    field.onChange(maxScore);
                                    toast({
                                      title: "Внимание",
                                      description: `Максимальный балл для этого задания: ${maxScore}`,
                                    });
                                  } else {
                                    field.onChange(value);
                                  }
                                }}
                                placeholder={`Введите балл (от 0 до ${selectedAssignment.maxScore})`}
                              />
                            </FormControl>
                            <FormDescription>
                              Тип задания: {getAssignmentTypeName(selectedAssignment.assignmentType)}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : (
                      <div className="text-sm text-muted-foreground mb-4">
                        Выберите задание для выставления баллов
                      </div>
                    )}
                  </>
                ) : (
                  <FormField
                    control={gradeForm.control}
                    name="grade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Оценка</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(parseInt(value))}
                          defaultValue={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Выберите оценку" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {[1, 2, 3, 4, 5].map((grade) => (
                              <SelectItem key={grade} value={grade.toString()}>
                                {grade}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                
                {/* Скрытое поле для типа оценки, автоматически заполняется при выборе задания */}
                <input 
                  type="hidden" 
                  name="gradeType" 
                  value={gradeForm.getValues().gradeType || "Текущая"} 
                />
                
                {/* Информационное поле о типе оценки */}
                {selectedAssignment && (
                  <div className="text-sm text-muted-foreground mb-2 rounded-md p-2 bg-muted">
                    <p className="font-medium">Тип работы: {getAssignmentTypeName(selectedAssignment.assignmentType)}</p>
                  </div>
                )}
                
                {!selectedAssignment && (
                  <div className="text-sm text-muted-foreground mb-2 rounded-md p-2 bg-muted">
                    <p className="font-medium">Тип оценки: Текущая</p>
                    <p>Выберите задание чтобы изменить тип оценки</p>
                  </div>
                )}
                
                <FormField
                  control={gradeForm.control}
                  name="comment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Комментарий</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Комментарий к оценке"
                          className="resize-none"
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {selectedDate && (
                  <div className="space-y-2">
                    <FormLabel>Дата урока</FormLabel>
                    <Input 
                      type="date" 
                      value={selectedDate || ''} 
                      disabled 
                    />
                    <p className="text-xs text-gray-500">
                      Оценка будет привязана к текущей дате
                    </p>
                  </div>
                )}
                
                <DialogFooter>
                  <Button type="submit" disabled={addGradeMutation.isPending || updateGradeMutation.isPending}>
                    {addGradeMutation.isPending || updateGradeMutation.isPending 
                      ? 'Сохранение...' 
                      : editingGradeId 
                        ? 'Обновить' 
                        : 'Сохранить'
                    }
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}