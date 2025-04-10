import { useEffect, useMemo, useState } from "react";
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
  User
} from "@shared/schema";
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
import { CalendarIcon, BookOpenIcon, GraduationCapIcon, Loader2, AlertCircle, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// Схема для добавления оценки
const gradeFormSchema = z.object({
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
  grade: z.number({
    required_error: "Укажите оценку",
  }).min(1, "Минимальная оценка - 1").max(5, "Максимальная оценка - 5"),
  comment: z.string().nullable().optional(),
  gradeType: z.string({
    required_error: "Укажите тип оценки",
  }),
  // Добавляем поле для даты (необязательное, будет устанавливаться программно)
  date: z.string().optional().nullable(),
  // Добавляем поле scheduleId для связи с конкретным уроком
  scheduleId: z.number().optional().nullable(),
});

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
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [editingGradeId, setEditingGradeId] = useState<number | null>(null);
  
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
  
  // Get unique lesson slots (date + scheduleId pairs) from schedules for this class and subject
  const lessonSlots = useMemo(() => {
    // Фильтруем расписания для текущего предмета
    return schedules
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
        formattedDate: format(new Date(s.scheduleDate as string), "dd.MM", { locale: ru })
      }));
  }, [schedules, subjectId]);
  
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
  
  // Grade form
  const gradeForm = useForm<z.infer<typeof gradeFormSchema>>({
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
    },
  });
  
  // Mutation to add grade
  const addGradeMutation = useMutation({
    mutationFn: async (data: z.infer<typeof gradeFormSchema>) => {
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
      queryClient.invalidateQueries({ queryKey: ["/api/grades"] });
      
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
      queryClient.invalidateQueries({ queryKey: ["/api/grades"] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grades"] });
      
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
      queryClient.invalidateQueries({ queryKey: ["/api/grades"] });
    },
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
      queryClient.invalidateQueries({ queryKey: ["/api/grades"] });
      
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
      queryClient.invalidateQueries({ queryKey: ["/api/grades"] });
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
  
  // Open grade dialog to edit existing grade
  const openEditGradeDialog = (grade: Grade) => {
    setSelectedStudentId(grade.studentId);
    setSelectedDate(null);
    setEditingGradeId(grade.id);
    
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
    });
    
    setIsGradeDialogOpen(true);
  };
  
  // Open grade dialog to add new grade
  const openGradeDialog = (studentId: number, date?: string, scheduleId?: number) => {
    setSelectedStudentId(studentId);
    setSelectedDate(date || null);
    setEditingGradeId(null);
    
    // Find schedule by ID to check its status
    let canAddGrade = true;
    
    if (scheduleId) {
      const schedule = getScheduleById(scheduleId);
      if (schedule && schedule.status !== 'conducted') {
        toast({
          title: "Невозможно добавить оценку",
          description: "Урок не отмечен как проведенный. Отметьте урок как проведенный, чтобы добавить оценки.",
          variant: "destructive",
        });
        canAddGrade = false;
      }
    }
    
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
      // Adding new grade - обеспечиваем, что scheduleId всегда будет установлен,
      // так как это критически важно для правильного отображения оценок
      const finalData = {
        ...data,
        scheduleId: data.scheduleId || null
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
    if (!subgroupId) {
      // Если подгруппа не указана, возвращаем все оценки
      return grades;
    }
    
    // Если подгруппа указана:
    // 1. Получаем все расписания для этой подгруппы
    const subgroupScheduleIds = schedules
      .filter(schedule => schedule.subgroupId === subgroupId)
      .map(schedule => schedule.id);
    
    // 2. Фильтруем оценки, чтобы показать только те, которые:
    // - относятся к урокам этой подгруппы (по scheduleId)
    // - или не привязаны к расписанию, но принадлежат студентам из подгруппы
    return grades.filter(grade => {
      // Если оценка привязана к уроку подгруппы, показываем её
      if (grade.scheduleId && subgroupScheduleIds.includes(grade.scheduleId)) {
        return true;
      }
      
      // Если оценка не привязана к уроку, проверяем, принадлежит ли студент к подгруппе
      if (!grade.scheduleId && filteredStudents.some(student => student.id === grade.studentId)) {
        return true;
      }
      
      return false;
    });
    
  }, [grades, subgroupId, schedules, filteredStudents]);

  // Calculate average grade for a student with weight based on grade type
  const calculateAverageGrade = (studentId: number) => {
    const studentGrades = filteredGrades.filter(g => g.studentId === studentId);
    if (studentGrades.length === 0) return "-";
    
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
  };
  
  // Determine if a lesson is conducted
  const isLessonConducted = (scheduleId: number) => {
    const schedule = schedules.find(s => s.id === scheduleId);
    return schedule?.status === 'conducted';
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
    if (!classData || !subjectData || !students.length) return;
    
    // Создаем заголовок таблицы
    let csvContent = "Ученик,";
    
    // Добавляем даты уроков в заголовок
    lessonSlots.forEach(slot => {
      csvContent += `${slot.formattedDate},`;
    });
    
    csvContent += "Средний балл\n";
    
    // Добавляем данные по каждому ученику
    students.forEach(student => {
      const studentName = `${student.lastName} ${student.firstName}`;
      csvContent += `${studentName},`;
      
      // Добавляем оценки по каждому уроку
      lessonSlots.forEach(slot => {
        const grades = getStudentGradeForSlot(student.id, slot);
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
          <Button
            variant="outline"
            className="gap-2"
            onClick={exportToCSV}
            disabled={isLoading || !students.length}
          >
            <Download className="h-4 w-4" />
            Экспорт
          </Button>
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
                        <p className="text-lg text-muted-foreground">{students.length}</p>
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
                              onClick={() => canEditGrades ? openStatusDialog(slot.scheduleId) : null}
                            >
                              <div className="flex flex-col items-center justify-center">
                                {slot.formattedDate}
                                {slot.startTime && <span className="text-xs">({slot.startTime.slice(0, 5)})</span>}
                                {isLessonConducted && (
                                  <span className="text-green-600 ml-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                  </span>
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
                            const studentGrades = getStudentGradeForSlot(student.id, slot);
                            return (
                              <TableCell key={`${slot.date}-${slot.scheduleId}`} className="text-center">
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
                                    {canEditGrades && isLessonConducted(slot.scheduleId) && (
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
                                ) : canEditGrades && isLessonConducted(slot.scheduleId) ? (
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
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Внимание</AlertTitle>
                    <AlertDescription>
                      Урок еще не завершился. Отметить урок как проведенный можно только после его окончания.
                    </AlertDescription>
                  </Alert>
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
                
                <FormField
                  control={gradeForm.control}
                  name="gradeType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Тип оценки</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Выберите тип оценки" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Текущая">Текущая оценка</SelectItem>
                          <SelectItem value="test">Контрольная работа</SelectItem>
                          <SelectItem value="exam">Экзамен</SelectItem>
                          <SelectItem value="classwork">Классная работа</SelectItem>
                          <SelectItem value="homework">Домашняя работа</SelectItem>
                          <SelectItem value="project">Проект</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
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