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
  
  // Fetch grades for this class and subject
  const { data: grades = [], isLoading: isGradesLoading } = useQuery<Grade[]>({
    queryKey: ["/api/grades", { classId, subjectId }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/grades?classId=${classId}&subjectId=${subjectId}`);
      return res.json();
    },
    enabled: !!classId && !!subjectId && !!user,
  });
  
  // Get unique dates from schedules
  const lessonDates = useMemo(() => {
    const dates = schedules
      .filter(s => s.scheduleDate) // Filter out schedules without date
      .map(s => s.scheduleDate)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    
    // Remove duplicates
    return [...new Set(dates)];
  }, [schedules]);
  
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grades"] });
      setIsGradeDialogOpen(false);
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
        description: "Оценка успешно добавлена",
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось добавить оценку",
        variant: "destructive",
      });
    },
  });
  
  // Handle grade form submission
  const onGradeSubmit = (values: z.infer<typeof gradeFormSchema>) => {
    addGradeMutation.mutate(values);
  };
  
  // Open grade dialog for a specific student and date
  const openGradeDialog = (studentId: number, date?: string) => {
    setSelectedStudentId(studentId);
    setSelectedDate(date || null);
    
    gradeForm.setValue("studentId", studentId);
    gradeForm.setValue("subjectId", subjectId);
    gradeForm.setValue("classId", classId);
    gradeForm.setValue("teacherId", user?.id || 0);
    
    setIsGradeDialogOpen(true);
  };
  
  // Get student grades for a specific date
  const getStudentGradeForDate = (studentId: number, date: string) => {
    const dateObj = new Date(date);
    // Сравниваем только дату (без времени)
    return grades.filter(g => 
      g.studentId === studentId && 
      g.createdAt && new Date(g.createdAt).toDateString() === dateObj.toDateString()
    );
  };
  
  // Calculate average grade for a student
  const calculateAverageGrade = (studentId: number) => {
    const studentGrades = grades.filter(g => g.studentId === studentId);
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
  
  const isLoading = isClassLoading || isSubjectLoading || isStudentsLoading || 
                    isSchedulesLoading || isGradesLoading;
  
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
              {classData?.name} - {subjectData?.name}
            </h1>
            <p className="text-gray-500">
              Таблица оценок учеников по предмету
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
                            <div className="flex flex-wrap justify-center gap-1">
                              {studentGrades.map((grade) => (
                                <span 
                                  key={grade.id} 
                                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary text-primary-foreground cursor-help"
                                  title={grade.comment || ""}
                                >
                                  {grade.grade}
                                </span>
                              ))}
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
        )}
        
        {/* Dialog for adding a grade */}
        <Dialog open={isGradeDialogOpen} onOpenChange={setIsGradeDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Добавить оценку</DialogTitle>
              <DialogDescription>
                {selectedStudentId ? 
                  `Добавление оценки для ученика: ${
                    students.find(s => s.id === selectedStudentId)?.lastName || ""
                  } ${
                    students.find(s => s.id === selectedStudentId)?.firstName || ""
                  }${selectedDate ? ` (${formatDate(selectedDate)})` : ""}` : 
                  "Добавление оценки"
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
                  <Button type="submit" disabled={addGradeMutation.isPending}>
                    {addGradeMutation.isPending ? 'Сохранение...' : 'Сохранить'}
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