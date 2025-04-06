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
import { CalendarIcon, BookOpenIcon, GraduationCapIcon, Loader2 } from "lucide-react";
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
  date: z.string().optional(),
});

export default function ClassGradeDetailsPage() {
  const params = useParams();
  const classId = parseInt(params.classId);
  const subjectId = parseInt(params.subjectId);
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { isTeacher, isSchoolAdmin, isSuperAdmin } = useRoleCheck();
  const canEditGrades = isTeacher() || isSchoolAdmin() || isSuperAdmin();
  
  const [isGradeDialogOpen, setIsGradeDialogOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  
  // Fetch class details
  const { data: classData, isLoading: isClassLoading } = useQuery<ClassType>({
    queryKey: ["/api/classes", classId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/classes/${classId}`);
      return res.json();
    },
    enabled: !!classId && !!user,
  });
  
  // Fetch subject details
  const { data: subjectData, isLoading: isSubjectLoading } = useQuery<Subject>({
    queryKey: ["/api/subjects", subjectId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/subjects/${subjectId}`);
      return res.json();
    },
    enabled: !!subjectId && !!user,
  });
  
  // Fetch students in class
  const { data: students = [], isLoading: isStudentsLoading } = useQuery<User[]>({
    queryKey: ["/api/students-by-class", classId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/students-by-class/${classId}`);
      return res.json();
    },
    enabled: !!classId && !!user,
  });
  
  // Fetch schedules for this class and subject
  const { data: schedules = [], isLoading: isSchedulesLoading } = useQuery<Schedule[]>({
    queryKey: ["/api/schedules", { classId, subjectId }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/schedules?classId=${classId}&subjectId=${subjectId}`);
      return res.json();
    },
    enabled: !!classId && !!subjectId && !!user,
  });
  
  // Получаем расписание для текущего учителя (все предметы)
  const { data: teacherSchedules = [], isLoading: isTeacherSchedulesLoading } = useQuery<Schedule[]>({
    queryKey: ["/api/schedules", { teacherId: user?.id }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/schedules?teacherId=${user?.id}`);
      return res.json();
    },
    enabled: !!user?.id,
  });
  
  // Fetch grades for this class and subject
  const { data: grades = [], isLoading: isGradesLoading } = useQuery<Grade[]>({
    queryKey: ["/api/grades", { classId, subjectId }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/grades?classId=${classId}&subjectId=${subjectId}`);
      return res.json();
    },
    enabled: !!classId && !!subjectId && !!user,
  });
  
  // Get unique dates from schedules for this class and subject
  const lessonDates = useMemo(() => {
    // Фильтруем расписания и получаем даты
    const dates = schedules
      .filter(s => s.scheduleDate && s.subjectId === subjectId) // Filter schedules for this subject only
      .map(s => s.scheduleDate as string) // Уточняем тип, так как мы отфильтровали null значения выше
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    
    // Remove duplicates using Array.from + Set
    return Array.from(new Set(dates));
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
    },
  });
  
  // Mutation to add grade
  const addGradeMutation = useMutation({
    mutationFn: async (data: z.infer<typeof gradeFormSchema>) => {
      const res = await apiRequest("POST", "/api/grades", data);
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
      let createdAt = new Date();
      
      // Если у нас есть selectedDate, используем его вместо текущей даты
      if (selectedDate) {
        // Правильная обработка строки даты - убеждаемся, что у нас всегда строка
        const dateString = selectedDate || '';
        if (dateString.trim() !== '') {
          createdAt = new Date(dateString);
        }
      }
      
      // Создаём временную оценку для оптимистичного обновления интерфейса
      const tempGrade: Grade = {
        id: Date.now(), // Временный ID для локального отображения
        studentId: newGradeData.studentId!, 
        subjectId: newGradeData.subjectId!,
        classId: newGradeData.classId!,
        teacherId: newGradeData.teacherId!,
        grade: newGradeData.grade!,
        comment: newGradeData.comment || "",
        gradeType: newGradeData.gradeType || "Текущая",
        // Используем строковое представление даты для отображения в UI
        // В БД сама дата будет приведена к нужному типу
        createdAt: createdAt.toISOString(),
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
        description: error.message || "Не удалось добавить оценку",
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
      const res = await apiRequest("PUT", `/api/grades/${id}`, data);
      return res.json();
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
        description: error.message || "Не удалось обновить оценку",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grades"] });
    },
  });
  
  // Mutation to delete grade
  const deleteGradeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/grades/${id}`);
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
      // Обновляем кеш после успешного удаления
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
        description: error.message || "Не удалось удалить оценку",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grades"] });
    },
  });
  
  // Track if we're editing an existing grade
  const [editingGradeId, setEditingGradeId] = useState<number | null>(null);
  
  // Handle grade form submission
  const onGradeSubmit = (values: z.infer<typeof gradeFormSchema>) => {
    if (editingGradeId) {
      // Update existing grade
      updateGradeMutation.mutate({ 
        id: editingGradeId, 
        data: values 
      });
    } else {
      // Add new grade
      addGradeMutation.mutate(values);
    }
  };
  
  // Open grade dialog for a specific student and date
  const openGradeDialog = (studentId: number, date?: string) => {
    setSelectedStudentId(studentId);
    setSelectedDate(date || null);
    setEditingGradeId(null);
    
    gradeForm.reset({
      studentId: studentId,
      subjectId: subjectId,
      classId: classId,
      teacherId: user?.id,
      grade: undefined,
      comment: "",
      gradeType: "Текущая",
      date: date, // Важно: передаем дату в форму
    });
    
    setIsGradeDialogOpen(true);
  };
  
  // Open grade dialog to edit existing grade
  const openEditGradeDialog = (grade: Grade) => {
    setSelectedStudentId(grade.studentId);
    setSelectedDate(null);
    setEditingGradeId(grade.id);
    
    gradeForm.reset({
      studentId: grade.studentId,
      subjectId: grade.subjectId,
      classId: grade.classId, 
      teacherId: grade.teacherId,
      grade: grade.grade,
      comment: grade.comment || "",
      gradeType: grade.gradeType || "Текущая",
    });
    
    setIsGradeDialogOpen(true);
  };
  
  // Handle grade deletion
  const handleDeleteGrade = (gradeId: number) => {
    if (confirm("Вы уверены, что хотите удалить эту оценку?")) {
      deleteGradeMutation.mutate(gradeId);
    }
  };
  
  // Get student grades for a specific date for the current subject
  const getStudentGradeForDate = (studentId: number, date: string) => {
    // Преобразуем дату в строку формата "YYYY-MM-DD" для более надежного сравнения
    const formatDateForCompare = (dateInput: string | Date) => {
      // Если передали null или undefined
      if (!dateInput) return ''; 
      
      // Если передали дату как объект
      const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
      
      // Проверяем, что дата действительна
      if (isNaN(d.getTime())) return '';
      
      // Форматируем дату в строку формата YYYY-MM-DD
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    
    const formattedDate = formatDateForCompare(date);
    
    // Фильтруем оценки по студенту, предмету и дате
    return grades.filter(g => 
      g.studentId === studentId && 
      g.subjectId === subjectId && // Добавляем фильтр по предмету
      g.createdAt && formatDateForCompare(g.createdAt) === formattedDate
    );
  };
  
  // Calculate average grade for a student for the current subject
  const calculateAverageGrade = (studentId: number) => {
    // Фильтруем только оценки для текущего предмета
    const studentGrades = grades.filter(g => 
      g.studentId === studentId && 
      g.subjectId === subjectId
    );
    
    if (studentGrades.length === 0) return "-";
    
    const sum = studentGrades.reduce((total, g) => total + g.grade, 0);
    return (sum / studentGrades.length).toFixed(1);
  };
  
  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, "dd.MM", { locale: ru });
    } catch (e) {
      return dateString;
    }
  };
  
  // Fetch all subjects taught by this teacher
  const { data: subjectsData = [] } = useQuery({
    queryKey: ["/api/subjects"],
    enabled: !!user?.id,
  });
  
  const isLoading = isClassLoading || isSubjectLoading || isStudentsLoading || 
                    isSchedulesLoading || isGradesLoading || isTeacherSchedulesLoading;
  
  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <h3 className="text-lg font-medium">Загрузка данных...</h3>
          </div>
        </div>
      </MainLayout>
    );
  }
  
  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate("/schedule")}
              className="mb-2"
            >
              <CalendarIcon className="h-4 w-4 mr-2" />
              Вернуться к расписанию
            </Button>
            <h1 className="text-2xl font-bold">
              {classData?.name} - Журнал оценок
            </h1>
            <p className="text-gray-500">
              Таблицы оценок учеников по предметам
            </p>
          </div>
          
          {canEditGrades && (
            <Button onClick={() => setIsGradeDialogOpen(true)}>
              Добавить оценку
            </Button>
          )}
        </div>
        
        {students.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Нет учеников</CardTitle>
              <CardDescription>В этом классе нет учеников или данные еще не загружены.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          // Создаем таблицу для каждого предмета
          <div className="space-y-8">
            {/* Текущий предмет (из URL) */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center">
                  <BookOpenIcon className="h-5 w-5 mr-2" />
                  {subjectData?.name}
                </CardTitle>
                <CardDescription>
                  Оценки учеников по предмету "{subjectData?.name}" в классе {classData?.name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px] bg-muted/50">Ученик</TableHead>
                        {lessonDates.map((date) => (
                          <TableHead key={date} className="text-center">
                            {formatDate(date)}
                          </TableHead>
                        ))}
                        <TableHead className="text-center sticky right-0 bg-muted/50">
                          Средний балл
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {students.map((student) => (
                        <TableRow key={student.id}>
                          <TableCell className="font-medium bg-muted/20">
                            {student.lastName} {student.firstName}
                          </TableCell>
                          {lessonDates.map((date) => {
                            const studentGrades = getStudentGradeForDate(student.id, date);
                            return (
                              <TableCell key={date} className="text-center">
                                {studentGrades.length > 0 ? (
                                  <div className="flex flex-wrap justify-center gap-1 items-center">
                                    {studentGrades.map((grade) => (
                                      <div key={grade.id} className="relative group">
                                        <span 
                                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary text-primary-foreground cursor-help"
                                          title={grade.comment || ""}
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
                                    {/* Кнопка "+" для добавления еще одной оценки в тот же день */}
                                    {canEditGrades && (
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-5 w-5 p-0 rounded-full ml-1"
                                        onClick={() => openGradeDialog(student.id, date)}
                                        title="Добавить еще одну оценку"
                                      >
                                        +
                                      </Button>
                                    )}
                                  </div>
                                ) : canEditGrades ? (
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 w-7 p-0 rounded-full"
                                    onClick={() => openGradeDialog(student.id, date)}
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
        
        {/* Dialog for adding a grade */}
        <Dialog open={isGradeDialogOpen} onOpenChange={setIsGradeDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingGradeId ? "Редактировать оценку" : "Добавить оценку"}</DialogTitle>
              <DialogDescription>
                {selectedStudentId ? 
                  `${editingGradeId ? "Редактирование" : "Добавление"} оценки для ученика: ${
                    students.find(s => s.id === selectedStudentId)?.lastName || ""
                  } ${
                    students.find(s => s.id === selectedStudentId)?.firstName || ""
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
                            {students.map((student) => (
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
                          <SelectItem value="Текущая">Текущая</SelectItem>
                          <SelectItem value="Контрольная">Контрольная</SelectItem>
                          <SelectItem value="Экзамен">Экзамен</SelectItem>
                          <SelectItem value="Практическая">Практическая</SelectItem>
                          <SelectItem value="Домашняя">Домашняя</SelectItem>
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