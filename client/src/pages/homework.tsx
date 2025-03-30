import { useState } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { useAuth } from "@/hooks/use-auth";
import { UserRole, Homework, insertHomeworkSchema, Class, Subject, HomeworkSubmission } from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Filter, Search, Upload, Clock, CalendarIcon, FileUpIcon, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// Schema for homework creation
const homeworkFormSchema = insertHomeworkSchema.extend({
  title: z.string().min(1, "Название обязательно"),
  description: z.string().min(1, "Описание обязательно"),
  subjectId: z.number({
    required_error: "Выберите предмет",
  }),
  classId: z.number({
    required_error: "Выберите класс",
  }),
  dueDate: z.string().min(1, "Выберите срок сдачи"),
});

// Schema for homework submission
const submissionFormSchema = z.object({
  homeworkId: z.number(),
  submissionText: z.string().min(1, "Введите текст ответа"),
  fileUrl: z.string().optional(),
});

export default function HomeworkPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedClassId, setSelectedClassId] = useState<number | "all">("all");
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [selectedHomework, setSelectedHomework] = useState<Homework | null>(null);
  const [currentTab, setCurrentTab] = useState("active");

  // Determine if the user can create homework (only teachers)
  const canCreateHomework = user?.role === UserRole.TEACHER;
  // Determine if the user can submit homework (only students)
  const canSubmitHomework = user?.role === UserRole.STUDENT;

  // Fetch homework
  const { data: homework = [], isLoading: homeworkLoading } = useQuery<Homework[]>({
    queryKey: ["/api/homework"],
    enabled: !!user
  });

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

  // Fetch homework submissions (for students)
  const { data: submissions = [], isLoading: submissionsLoading } = useQuery<HomeworkSubmission[]>({
    queryKey: ["/api/homework-submissions"],
    enabled: !!user && canSubmitHomework
  });

  // Form for creating homework
  const homeworkForm = useForm<z.infer<typeof homeworkFormSchema>>({
    resolver: zodResolver(homeworkFormSchema),
    defaultValues: {
      title: "",
      description: "",
      subjectId: undefined,
      classId: undefined,
      dueDate: "",
    },
  });

  // Form for submitting homework
  const submissionForm = useForm<z.infer<typeof submissionFormSchema>>({
    resolver: zodResolver(submissionFormSchema),
    defaultValues: {
      homeworkId: 0,
      submissionText: "",
      fileUrl: "",
    },
  });

  // Create homework mutation
  const createHomeworkMutation = useMutation({
    mutationFn: async (data: z.infer<typeof homeworkFormSchema>) => {
      const res = await apiRequest("POST", "/api/homework", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/homework"] });
      setIsAddDialogOpen(false);
      homeworkForm.reset();
      toast({
        title: "Домашнее задание создано",
        description: "Новое домашнее задание успешно добавлено",
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось создать домашнее задание",
        variant: "destructive",
      });
    },
  });

  // Submit homework mutation
  const submitHomeworkMutation = useMutation({
    mutationFn: async (data: z.infer<typeof submissionFormSchema>) => {
      const res = await apiRequest("POST", "/api/homework-submissions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/homework-submissions"] });
      setIsSubmitDialogOpen(false);
      submissionForm.reset();
      setSelectedHomework(null);
      toast({
        title: "Ответ отправлен",
        description: "Ваш ответ на домашнее задание успешно отправлен",
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось отправить ответ",
        variant: "destructive",
      });
    },
  });

  const onSubmitHomework = (values: z.infer<typeof homeworkFormSchema>) => {
    createHomeworkMutation.mutate(values);
  };

  const onSubmitSubmission = (values: z.infer<typeof submissionFormSchema>) => {
    submitHomeworkMutation.mutate(values);
  };

  // Handler for opening the submission dialog
  const handleSubmitHomework = (homework: Homework) => {
    setSelectedHomework(homework);
    submissionForm.setValue("homeworkId", homework.id);
    setIsSubmitDialogOpen(true);
  };

  // Filter homework based on selected filters and search query
  const filteredHomework = homework.filter(hw => {
    const classMatches = selectedClassId === "all" || hw.classId === selectedClassId;
    const subjectMatches = selectedSubjectId === "all" || hw.subjectId === selectedSubjectId;
    const searchMatches = !searchQuery || 
      hw.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      hw.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Filter by status (active/completed)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(hw.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    
    const isPastDue = dueDate < today;
    const isActive = currentTab === "active" && !isPastDue;
    const isCompleted = currentTab === "completed" && isPastDue;
    
    return classMatches && subjectMatches && searchMatches && (isActive || isCompleted);
  });

  // Helper functions to get names
  const getClassName = (id: number) => {
    const cls = classes.find(c => c.id === id);
    return cls ? cls.name : `Класс ${id}`;
  };

  const getSubjectName = (id: number) => {
    const subject = subjects.find(s => s.id === id);
    return subject ? subject.name : `Предмет ${id}`;
  };

  // Check if homework is submitted by student
  const isHomeworkSubmitted = (homeworkId: number) => {
    return submissions.some(s => s.homeworkId === homeworkId);
  };

  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-heading font-bold text-gray-800">Домашние задания</h2>
        {canCreateHomework && (
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Создать задание
          </Button>
        )}
      </div>

      {/* Filters and search */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Поиск по названию или описанию..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Select
          value={selectedClassId.toString()}
          onValueChange={(value) => setSelectedClassId(value === "all" ? "all" : parseInt(value))}
        >
          <SelectTrigger>
            <div className="flex items-center">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Все классы" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все классы</SelectItem>
            {classes.map((cls) => (
              <SelectItem key={cls.id} value={cls.id.toString()}>
                {cls.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedSubjectId.toString()}
          onValueChange={(value) => setSelectedSubjectId(value === "all" ? "all" : parseInt(value))}
        >
          <SelectTrigger>
            <div className="flex items-center">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Все предметы" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все предметы</SelectItem>
            {subjects.map((subject) => (
              <SelectItem key={subject.id} value={subject.id.toString()}>
                {subject.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs for Active/Completed */}
      <Tabs defaultValue="active" value={currentTab} onValueChange={setCurrentTab} className="mb-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="active">Активные</TabsTrigger>
          <TabsTrigger value="completed">Завершенные</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Homework Cards */}
      {homeworkLoading ? (
        <div className="text-center py-12">
          <Clock className="h-12 w-12 text-primary mx-auto animate-spin" />
          <p className="mt-4 text-gray-500">Загрузка домашних заданий...</p>
        </div>
      ) : filteredHomework.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <CalendarIcon className="h-12 w-12 text-gray-300 mx-auto" />
          <p className="mt-4 text-gray-500">
            {currentTab === "active" ? "Нет активных домашних заданий" : "Нет завершенных домашних заданий"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredHomework.map((hw) => {
            const dueDate = new Date(hw.dueDate);
            const today = new Date();
            const isPastDue = dueDate < today;
            const isSubmitted = canSubmitHomework && isHomeworkSubmitted(hw.id);
            
            return (
              <Card key={hw.id} className={isPastDue ? "opacity-70" : ""}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-xl">{hw.title}</CardTitle>
                    <Badge variant={isPastDue ? "secondary" : "default"}>
                      {isPastDue ? "Завершено" : "Активно"}
                    </Badge>
                  </div>
                  <CardDescription className="flex items-center mt-2">
                    <CalendarIcon className="h-4 w-4 mr-1" />
                    Срок: {new Date(hw.dueDate).toLocaleDateString('ru-RU')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Badge variant="outline" className="bg-primary-50 border-0">
                      {getSubjectName(hw.subjectId)}
                    </Badge>
                    <Badge variant="outline" className="bg-primary-50 border-0">
                      {getClassName(hw.classId)}
                    </Badge>
                  </div>
                  <p className="text-gray-700">{hw.description}</p>
                </CardContent>
                <CardFooter className="flex justify-between">
                  {canSubmitHomework && !isPastDue && (
                    <Button 
                      onClick={() => handleSubmitHomework(hw)}
                      disabled={isSubmitted}
                      variant={isSubmitted ? "secondary" : "default"}
                      className="w-full"
                    >
                      {isSubmitted ? (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Выполнено
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Отправить ответ
                        </>
                      )}
                    </Button>
                  )}
                  {canCreateHomework && (
                    <Button variant="outline" className="w-full">
                      Просмотреть ответы
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Homework Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Создать домашнее задание</DialogTitle>
            <DialogDescription>
              Заполните информацию о новом домашнем задании
            </DialogDescription>
          </DialogHeader>
          
          <Form {...homeworkForm}>
            <form onSubmit={homeworkForm.handleSubmit(onSubmitHomework)} className="space-y-4">
              <FormField
                control={homeworkForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Название</FormLabel>
                    <FormControl>
                      <Input placeholder="Название задания" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={homeworkForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Описание</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Описание задания" 
                        className="resize-none" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={homeworkForm.control}
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
                  control={homeworkForm.control}
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
              </div>
              
              <FormField
                control={homeworkForm.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Срок выполнения</FormLabel>
                    <FormControl>
                      <div className="flex items-center">
                        <CalendarIcon className="h-4 w-4 mr-2 text-gray-400" />
                        <Input type="date" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button type="submit" disabled={createHomeworkMutation.isPending}>
                  {createHomeworkMutation.isPending ? 'Сохранение...' : 'Создать задание'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Submit Homework Dialog */}
      <Dialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Отправить ответ</DialogTitle>
            <DialogDescription>
              {selectedHomework?.title}
            </DialogDescription>
          </DialogHeader>
          
          <Form {...submissionForm}>
            <form onSubmit={submissionForm.handleSubmit(onSubmitSubmission)} className="space-y-4">
              <FormField
                control={submissionForm.control}
                name="submissionText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ответ</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Введите ваш ответ" 
                        className="resize-none min-h-[150px]" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={submissionForm.control}
                name="fileUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Прикрепить файл (опционально)</FormLabel>
                    <FormControl>
                      <div className="flex items-center">
                        <Input placeholder="URL файла" {...field} />
                        <Button type="button" variant="outline" className="ml-2">
                          <FileUpIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button type="submit" disabled={submitHomeworkMutation.isPending}>
                  {submitHomeworkMutation.isPending ? 'Отправка...' : 'Отправить ответ'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
