import { useState } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import { 
  UserRoleEnum, 
  Schedule as ScheduleType, 
  insertScheduleSchema, 
  Class, 
  Subject, 
  User,
  insertGradeSchema,
  Grade,
  ParentStudent
} from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CalendarIcon, PlusIcon, ClockIcon, GraduationCapIcon, UsersIcon, FilterIcon } from "lucide-react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { ScheduleCarousel } from "@/components/schedule/schedule-carousel";

const scheduleFormSchema = insertScheduleSchema.extend({
  classId: z.number({
    required_error: "Выберите класс",
  }),
  subjectId: z.number({
    required_error: "Выберите предмет",
  }),
  teacherId: z.number({
    required_error: "Выберите учителя",
  }),
  dayOfWeek: z.number({
    required_error: "Выберите день недели",
  }),
  scheduleDate: z.date({
    required_error: "Выберите дату урока",
  }),
  startTime: z.string().min(1, "Укажите время начала"),
  endTime: z.string().min(1, "Укажите время окончания"),
  room: z.string().optional(),
});

// Схема для создания оценок
const gradeFormSchema = insertGradeSchema.extend({
  studentId: z.number({
    required_error: "Выберите ученика",
  }),
  grade: z.number({
    required_error: "Укажите оценку",
  }).min(1, "Минимальная оценка - 1").max(5, "Максимальная оценка - 5"),
  comment: z.string().nullable().optional(),
  gradeType: z.string({
    required_error: "Укажите тип оценки",
  }),
});

export default function SchedulePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isSuperAdmin, isSchoolAdmin, isTeacher, isParent } = useRoleCheck();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isGradeDialogOpen, setIsGradeDialogOpen] = useState(false);
  const [isClassStudentsDialogOpen, setIsClassStudentsDialogOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState("1"); // 1 to 7 for days of week
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleType | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  
  // Check access permissions
  const canEditSchedule = isSuperAdmin() || isSchoolAdmin();
  
  // Fetch all schedules once - без привязки к selectedDate
  const { data: schedules = [], isLoading } = useQuery<ScheduleType[]>({
    queryKey: ["/api/schedules"],
    queryFn: async () => {
      const res = await fetch("/api/schedules");
      if (!res.ok) throw new Error("Failed to fetch schedules");
      return res.json();
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000 // Кэшируем на 5 минут
  });
  
  // Fetch parent-children relationships for parent users
  const { data: parentStudentRelations = [] } = useQuery<ParentStudent[]>({
    queryKey: ["/api/parent-students"],
    queryFn: async () => {
      const res = await fetch(`/api/parent-students?parentId=${user?.id}`);
      if (!res.ok) throw new Error("Failed to fetch parent-student relationships");
      return res.json();
    },
    enabled: !!user && isParent()
  });
  
  // Filter schedules for teacher
  const teacherSchedules = isTeacher() 
    ? schedules.filter(s => s.teacherId === user?.id)
    : schedules;
  
  // Fetch classes
  const { data: classes = [] } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
    enabled: !!user
  });
  
  // Fetch subjects
  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ["/api/subjects"],
    enabled: !!user
  });
  
  // Fetch teachers
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: !!user
  });
  
  // Fetch grades
  const { data: grades = [] } = useQuery<Grade[]>({
    queryKey: ["/api/grades"],
    enabled: !!user && isTeacher()
  });
  
  const teachers = users.filter(u => u.role === UserRoleEnum.TEACHER);
  const students = users.filter(u => u.role === UserRoleEnum.STUDENT);
  
  // Get students for a specific class
  const getClassStudents = (classId: number) => {
    return students.filter(student => {
      // В реальном приложении здесь должна быть логика связи студентов с классами
      // Для примера используем простую проверку по школе
      return student.schoolId === user?.schoolId;
    });
  };
  
  // Form for adding schedule
  const form = useForm<z.infer<typeof scheduleFormSchema>>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: {
      classId: undefined,
      subjectId: undefined,
      teacherId: undefined,
      dayOfWeek: undefined,
      scheduleDate: undefined,
      startTime: "",
      endTime: "",
      room: "",
    },
  });
  
  // Функция для синхронизации дня недели с выбранной датой
  const syncDayOfWeekWithDate = (date: Date) => {
    // getDay() возвращает 0 для воскресенья, 1 для понедельника и т.д.
    // Нужно преобразовать к нашему формату, где 1 - понедельник, 7 - воскресенье
    let dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();
    form.setValue("dayOfWeek", dayOfWeek);
    return dayOfWeek;
  };
  
  // Add schedule mutation
  const addScheduleMutation = useMutation({
    mutationFn: async (data: z.infer<typeof scheduleFormSchema>) => {
      const res = await apiRequest("POST", "/api/schedules", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      setIsAddDialogOpen(false);
      form.reset();
      toast({
        title: "Расписание добавлено",
        description: "Новый урок успешно добавлен в расписание",
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось добавить урок в расписание",
        variant: "destructive",
      });
    },
  });
  
  const onSubmit = (values: z.infer<typeof scheduleFormSchema>) => {
    addScheduleMutation.mutate(values);
  };
  
  // Get day name
  const getDayName = (day: number) => {
    const days = [
      "Понедельник", "Вторник", "Среда", "Четверг", 
      "Пятница", "Суббота", "Воскресенье"
    ];
    return days[day - 1];
  };
  
  // Формa для добавления оценки
  const gradeForm = useForm<z.infer<typeof gradeFormSchema>>({
    resolver: zodResolver(gradeFormSchema),
    defaultValues: {
      studentId: undefined,
      grade: undefined,
      comment: "",
      gradeType: "Текущая",
      subjectId: selectedSchedule?.subjectId,
      classId: selectedSchedule?.classId,
      teacherId: user?.id,
    },
  });
  
  // Добавить оценку
  const addGradeMutation = useMutation({
    mutationFn: async (data: z.infer<typeof gradeFormSchema>) => {
      const res = await apiRequest("POST", "/api/grades", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grades"] });
      setIsGradeDialogOpen(false);
      gradeForm.reset();
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
  
  const onGradeSubmit = (values: z.infer<typeof gradeFormSchema>) => {
    addGradeMutation.mutate(values);
  };
  
  // Функция фильтрации расписания в зависимости от роли и выбранного ребенка
  const getFilteredSchedules = (): ScheduleType[] => {
    // Если пользователь - родитель и выбран ребенок
    if (isParent() && selectedChildId) {
      // Получаем классы выбранного ребенка
      const studentClasses = users.find(u => u.id === selectedChildId)?.schoolId
        ? classes.filter(c => c.schoolId === users.find(u => u.id === selectedChildId)?.schoolId)
        : [];
      
      // Фильтруем расписание по классам ребенка
      return schedules.filter(schedule => 
        studentClasses.some(cls => cls.id === schedule.classId)
      );
    }
    
    // Для учителей
    if (isTeacher()) {
      return teacherSchedules;
    }
    
    // Для всех остальных
    return schedules;
  };
  
  // Filter schedules by day
  const getSchedulesByDay = (day: number) => {
    // Используем отфильтрованное расписание
    let schedulesToFilter = getFilteredSchedules();
    
    return schedulesToFilter
      .filter(schedule => schedule.dayOfWeek === day)
      .sort((a, b) => {
        // Sort by start time
        const timeA = a.startTime.split(':').map(Number);
        const timeB = b.startTime.split(':').map(Number);
        
        if (timeA[0] !== timeB[0]) return timeA[0] - timeB[0];
        return timeA[1] - timeB[1];
      });
  };
  
  // Helper functions to get data
  const getClassName = (id: number) => {
    const cls = classes.find(c => c.id === id);
    return cls ? cls.name : `Класс ${id}`;
  };
  
  const getSubjectName = (id: number) => {
    const subject = subjects.find(s => s.id === id);
    return subject ? subject.name : `Предмет ${id}`;
  };
  
  const getTeacherName = (id: number) => {
    const teacher = users.find(u => u.id === id);
    return teacher ? `${teacher.lastName} ${teacher.firstName}` : `Учитель ${id}`;
  };
  
  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-heading font-bold text-gray-800">Расписание</h2>
        <div className="flex gap-2">
          {canEditSchedule && (
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <PlusIcon className="mr-2 h-4 w-4" /> Добавить урок
            </Button>
          )}
        </div>
      </div>
      
      {isLoading ? (
        <div className="text-center py-8">
          <CalendarIcon className="h-10 w-10 text-primary mx-auto mb-2 animate-pulse" />
          <p>Загрузка расписания...</p>
        </div>
      ) : (
        <div>
          {/* Выбор ребенка для родителей */}
          {isParent() && parentStudentRelations.length > 0 && (
            <Card className="mb-6 p-6 border-b-4 border-b-primary">
              <CardHeader className="p-0 mb-4">
                <CardTitle className="text-xl">Просмотр расписания ребенка</CardTitle>
                <CardDescription>
                  Выберите ребенка, чтобы посмотреть его расписание занятий
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="flex flex-wrap gap-4">
                  {parentStudentRelations.map(relation => {
                    const student = users.find(u => u.id === relation.studentId);
                    if (!student) return null;
                    
                    return (
                      <Button
                        key={relation.id}
                        variant={selectedChildId === student.id ? "default" : "outline"}
                        className="flex items-center gap-2"
                        onClick={() => setSelectedChildId(student.id)}
                      >
                        <UsersIcon className="h-4 w-4" />
                        {student.firstName} {student.lastName}
                      </Button>
                    );
                  })}
                  
                  {selectedChildId && (
                    <Button 
                      variant="outline" 
                      className="flex items-center gap-2 ml-auto"
                      onClick={() => setSelectedChildId(null)}
                    >
                      <FilterIcon className="h-4 w-4" />
                      Сбросить выбор
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          
          {/* Карусель расписания */}
          <Card className="mb-6 p-6">
            <ScheduleCarousel
              schedules={getFilteredSchedules()}
              subjects={subjects}
              classes={classes}
              users={users}
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
            />
          </Card>
          
          {/* Панель детализации */}
          {isTeacher() && selectedDate && (
            <Card className="p-6 border-t-4 border-t-primary">
              <CardHeader className="p-0 mb-4">
                <CardTitle className="text-xl">Детали уроков</CardTitle>
                <CardDescription>
                  {selectedDate ? format(selectedDate, "dd MMMM yyyy", { locale: ru }) : "Выберите дату для просмотра деталей"}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="p-0">
                {getSchedulesByDay(selectedDate.getDay() === 0 ? 7 : selectedDate.getDay()).length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <CalendarIcon className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                    <p>На этот день уроки не запланированы</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Время</TableHead>
                        <TableHead>Предмет</TableHead>
                        <TableHead>Класс</TableHead>
                        <TableHead>Кабинет</TableHead>
                        <TableHead>Действия</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getSchedulesByDay(selectedDate.getDay() === 0 ? 7 : selectedDate.getDay())
                        .filter(schedule => isTeacher() ? schedule.teacherId === user?.id : true)
                        .map((schedule) => (
                        <TableRow key={schedule.id}>
                          <TableCell className="font-medium">
                            {schedule.startTime} - {schedule.endTime}
                          </TableCell>
                          <TableCell>{getSubjectName(schedule.subjectId)}</TableCell>
                          <TableCell>{getClassName(schedule.classId)}</TableCell>
                          <TableCell>{schedule.room || "-"}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  setSelectedSchedule(schedule);
                                  setSelectedClassId(schedule.classId);
                                  setIsClassStudentsDialogOpen(true);
                                }}
                              >
                                <UsersIcon className="h-4 w-4 mr-1" /> Ученики
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  setSelectedSchedule(schedule);
                                  setIsGradeDialogOpen(true);
                                }}
                              >
                                <GraduationCapIcon className="h-4 w-4 mr-1" /> Оценки
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
      
      {/* Add Schedule Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить урок в расписание</DialogTitle>
            <DialogDescription>
              Заполните информацию о новом уроке
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="scheduleDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Дата урока</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`}
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: ru })
                            ) : (
                              <span>Выберите дату</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => {
                            if (date) {
                              field.onChange(date);
                              // Автоматически устанавливаем день недели по дате
                              syncDayOfWeekWithDate(date);
                            }
                          }}
                          initialFocus
                          disabled={false}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="dayOfWeek"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>День недели</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      defaultValue={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите день недели" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                          <SelectItem key={day} value={day.toString()}>
                            {getDayName(day)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Время начала</FormLabel>
                      <FormControl>
                        <div className="flex items-center">
                          <ClockIcon className="h-4 w-4 mr-2 text-gray-400" />
                          <Input type="time" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="endTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Время окончания</FormLabel>
                      <FormControl>
                        <div className="flex items-center">
                          <ClockIcon className="h-4 w-4 mr-2 text-gray-400" />
                          <Input type="time" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="classId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Класс</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      defaultValue={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите класс" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {classes.map((cls) => (
                          <SelectItem key={cls.id} value={cls.id.toString()}>
                            {cls.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="subjectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Предмет</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      defaultValue={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите предмет" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {subjects.map((subject) => (
                          <SelectItem key={subject.id} value={subject.id.toString()}>
                            {subject.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="teacherId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Учитель</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      defaultValue={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите учителя" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {teachers.map((teacher) => (
                          <SelectItem key={teacher.id} value={teacher.id.toString()}>
                            {teacher.lastName} {teacher.firstName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="room"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Кабинет</FormLabel>
                    <FormControl>
                      <Input placeholder="Номер кабинета" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button type="submit" disabled={addScheduleMutation.isPending}>
                  {addScheduleMutation.isPending ? 'Сохранение...' : 'Сохранить'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      {/* Students List Dialog */}
      <Dialog open={isClassStudentsDialogOpen} onOpenChange={setIsClassStudentsDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Список учеников класса</DialogTitle>
            <DialogDescription>
              {selectedClassId && getClassName(selectedClassId)}
            </DialogDescription>
          </DialogHeader>
          
          <div className="max-h-[60vh] overflow-y-auto">
            {selectedClassId && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Фамилия</TableHead>
                    <TableHead>Имя</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getClassStudents(selectedClassId).map((student) => (
                    <TableRow key={student.id}>
                      <TableCell>{student.lastName}</TableCell>
                      <TableCell>{student.firstName}</TableCell>
                      <TableCell>{student.email}</TableCell>
                      <TableCell>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setSelectedStudentId(student.id);
                            setIsGradeDialogOpen(true);
                            setIsClassStudentsDialogOpen(false);
                            
                            // Предзаполняем форму оценки
                            gradeForm.reset({
                              studentId: student.id,
                              grade: undefined,
                              comment: "",
                              gradeType: "Текущая",
                              classId: selectedClassId,
                              subjectId: selectedSchedule?.subjectId,
                              teacherId: user?.id,
                            });
                          }}
                        >
                          <GraduationCapIcon className="h-4 w-4 mr-1" /> Выставить оценку
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Grade Dialog */}
      <Dialog open={isGradeDialogOpen} onOpenChange={setIsGradeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Выставление оценки</DialogTitle>
            <DialogDescription>
              {selectedStudentId && 
                users.find(u => u.id === selectedStudentId)?.lastName + ' ' + 
                users.find(u => u.id === selectedStudentId)?.firstName
              }
            </DialogDescription>
          </DialogHeader>
          
          <Form {...gradeForm}>
            <form onSubmit={gradeForm.handleSubmit(onGradeSubmit)} className="space-y-4">
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
                      onValueChange={(value) => field.onChange(value)}
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
              
              <DialogFooter>
                <Button type="submit" disabled={addGradeMutation.isPending}>
                  {addGradeMutation.isPending ? 'Сохранение...' : 'Сохранить'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
