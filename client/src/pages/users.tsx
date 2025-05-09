import { useState } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import { UserRoleEnum, User, insertUserSchema, Class, ParentStudent } from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Plus, Search, Filter, BookOpen, UsersIcon, UserIcon, UserPlusIcon, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { 
  FormDescription
} from "@/components/ui/form";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// Extended user schema with validation
const userFormSchema = insertUserSchema.extend({
  username: z.string().min(3, "Логин должен содержать минимум 3 символа"),
  password: z.string().min(6, "Пароль должен содержать минимум 6 символов"),
  firstName: z.string().min(1, "Имя обязательно"),
  lastName: z.string().min(1, "Фамилия обязательна"),
  email: z.string().email("Введите корректный email"),
  role: z.enum([
    UserRoleEnum.SUPER_ADMIN,
    UserRoleEnum.SCHOOL_ADMIN,
    UserRoleEnum.TEACHER,
    UserRoleEnum.STUDENT,
    UserRoleEnum.PARENT,
    UserRoleEnum.PRINCIPAL,
    UserRoleEnum.VICE_PRINCIPAL,
    UserRoleEnum.CLASS_TEACHER
  ]),
  confirmPassword: z.string().min(1, "Подтвердите пароль"),
  // Дополнительные поля для привязок
  classIds: z.array(z.number()).default([]),
  parentIds: z.array(z.number()).default([]),
  childIds: z.array(z.number()).default([]),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Пароли не совпадают",
  path: ["confirmPassword"],
});

type UserFormData = z.infer<typeof userFormSchema>;

export default function UsersPage() {
  const { user } = useAuth();
  const { isAdmin, canEdit, isPrincipal } = useRoleCheck();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRoleEnum | "all">("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  
  // Only Super admin, School admin and Principal can access this page
  if (!isAdmin()) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Доступ запрещен</h2>
            <p className="text-gray-600">У вас нет прав для просмотра этой страницы</p>
          </div>
        </div>
      </MainLayout>
    );
  }
  
  // Fetch users
  const { data: users = [], isLoading, error, refetch } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isAdmin(),
    retry: 1,
    // Use the error handler safely, TypeScript might complain but this works at runtime
    onError: (err: any) => {
      console.error("Ошибка загрузки пользователей:", err);
      toast({
        title: "Ошибка загрузки пользователей",
        description: err.message || "Не удалось загрузить список пользователей",
        variant: "destructive",
      });
    },
    // Add staleTime to prevent unnecessary refetches
    staleTime: 10 * 1000, // 10 seconds
    // Make sure data is refetched when tab regains focus
    refetchOnWindowFocus: true
  });
  
  // Fetch schools for dropdown
  const { isSuperAdmin } = useRoleCheck();
  const { data: schools = [] } = useQuery({
    queryKey: ["/api/schools"],
    enabled: isSuperAdmin()
  });
  
  // Filter users based on search query and role filter
  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    
    return matchesSearch && matchesRole;
  });
  
  // Form for adding/editing users
  const form = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      username: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      role: UserRoleEnum.STUDENT,
      schoolId: null,
      classIds: [],
      parentIds: [],
      childIds: [],
    },
  });
  
  // Reset form when dialog closes
  const resetForm = () => {
    form.reset({
      username: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      role: UserRoleEnum.STUDENT,
      schoolId: user?.schoolId || null,
      classIds: [],
      parentIds: [],
      childIds: [],
    });
  };
  
  // Set form values when editing
  const setFormForEdit = (user: User) => {
    console.log("Начало редактирования пользователя:", user);
    
    // Загружаем классы для ученика при редактировании
    if (user.role === UserRoleEnum.STUDENT) {
      fetchStudentClassesForEdit(user.id);
    }
    
    // Загружаем связи родитель-ребенок при редактировании
    if (user.role === UserRoleEnum.PARENT) {
      fetchParentStudentsForEdit(user.id);
    } else if (user.role === UserRoleEnum.STUDENT) {
      fetchStudentParentsForEdit(user.id);
    }
    
    // Устанавливаем начальные значения для массивов
    const initialValues = {
      username: user.username,
      password: "", // Don't include password when editing
      confirmPassword: "",
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone || "",
      role: user.role,
      schoolId: user.schoolId,
      classIds: [], // Будет заполнено после загрузки данных
      parentIds: [], // Будет заполнено после загрузки данных
      childIds: [], // Будет заполнено после загрузки данных
    };
    
    console.log("Устанавливаем начальные значения формы:", initialValues);
    form.reset(initialValues);
  };
  
  // Get role display name
  const getRoleName = (role: UserRoleEnum) => {
    const roleNames = {
      [UserRoleEnum.SUPER_ADMIN]: "Супер-администратор",
      [UserRoleEnum.SCHOOL_ADMIN]: "Администратор школы",
      [UserRoleEnum.TEACHER]: "Учитель",
      [UserRoleEnum.STUDENT]: "Ученик",
      [UserRoleEnum.PARENT]: "Родитель",
      [UserRoleEnum.PRINCIPAL]: "Директор",
      [UserRoleEnum.VICE_PRINCIPAL]: "Завуч",
      [UserRoleEnum.CLASS_TEACHER]: "Классный руководитель"
    };
    
    return roleNames[role] || role;
  };
  
  // Add user mutation
  const addUserMutation = useMutation({
    mutationFn: async (data: UserFormData) => {
      const { confirmPassword, ...userData } = data;
      const res = await apiRequest("/api/users", "POST", userData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsAddDialogOpen(false);
      resetForm();
      toast({
        title: "Пользователь добавлен",
        description: "Новый пользователь успешно зарегистрирован",
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось добавить пользователя",
        variant: "destructive",
      });
    },
  });
  
  // Edit user mutation
  const editUserMutation = useMutation({
    mutationFn: async (data: { id: number; user: Partial<UserFormData> }) => {
      const { confirmPassword, ...userData } = data.user;
      const res = await apiRequest(`/api/users/${data.id}`, "PUT", userData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsEditDialogOpen(false);
      setSelectedUser(null);
      resetForm();
      toast({
        title: "Пользователь обновлен",
        description: "Информация о пользователе успешно обновлена",
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось обновить информацию о пользователе",
        variant: "destructive",
      });
    },
  });
  
  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/users/${id}`, "DELETE");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsDeleteDialogOpen(false);
      setSelectedUser(null);
      toast({
        title: "Пользователь удален",
        description: "Пользователь был успешно удален из системы",
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить пользователя",
        variant: "destructive",
      });
    },
  });
  
  const onSubmitAdd = (values: UserFormData) => {
    addUserMutation.mutate(values);
  };
  
  const onSubmitEdit = (values: UserFormData) => {
    if (selectedUser) {
      // Only include password if it was changed
      const userData = { ...values } as Partial<UserFormData>;
      if (!userData.password) {
        userData.password = undefined; // Используем undefined вместо delete
      }
      
      // Добавляем более детальное логирование отправляемых данных
      console.log("Отправляемые данные пользователя:", userData);
      console.log("ClassIds (тип):", typeof userData.classIds, Array.isArray(userData.classIds));
      console.log("ClassIds (значение):", userData.classIds);
      
      // Проверяем содержимое данных формы перед отправкой
      const formValues = form.getValues();
      console.log("Значения формы перед отправкой:", formValues);
      console.log("Значение classIds в форме:", formValues.classIds);
      
      // Проверка - если это массив и он пуст, заменяем на [] 
      if (userData.classIds === undefined) {
        userData.classIds = [];
        console.log("ClassIds было undefined, установлено в []");
      }
      
      // Проверка - для поддержки обратной совместимости с classId
      if (userData.role === UserRoleEnum.STUDENT && Array.isArray(userData.classIds) && userData.classIds.length > 0) {
        console.log(`Устанавливаем classId=${userData.classIds[0]} для обратной совместимости`);
      }
      
      editUserMutation.mutate({
        id: selectedUser.id,
        user: userData,
      });
    }
  };
  
  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setFormForEdit(user);
    setIsEditDialogOpen(true);
  };
  
  const handleDelete = (user: User) => {
    setSelectedUser(user);
    setIsDeleteDialogOpen(true);
  };
  
  const confirmDelete = () => {
    if (selectedUser) {
      deleteUserMutation.mutate(selectedUser.id);
    }
  };
  
  // States for student-class management
  const [selectedStudent, setSelectedStudent] = useState<number | null>(null);
  const [searchStudentTerm, setSearchStudentTerm] = useState("");
  
  // States for parent-student management
  const [selectedParent, setSelectedParent] = useState<number | null>(null);
  const [searchParentTerm, setSearchParentTerm] = useState("");
  
  // Функции для загрузки данных при редактировании
  const fetchStudentClassesForEdit = async (studentId: number) => {
    try {
      console.log(`Загрузка классов для ученика ID=${studentId}`);
      const res = await fetch(`/api/student-classes?studentId=${studentId}`);
      if (!res.ok) throw new Error("Failed to fetch student classes");
      const studentClassConnections = await res.json();
      console.log(`Получены классы ученика:`, studentClassConnections);
      
      // Извлекаем идентификаторы классов из связей студент-класс
      // В каждой записи есть поле classId с идентификатором класса
      const classIds = studentClassConnections.map((connection: { classId: number }) => connection.classId);
      console.log(`Извлеченные classIds:`, classIds);
      
      // Фильтруем null или undefined значения
      const validClassIds = classIds.filter(id => id !== null && id !== undefined);
      console.log(`Отфильтрованные classIds:`, validClassIds);
      
      // Устанавливаем значение в форме
      form.setValue("classIds", validClassIds);
      
      // Проверяем, что значение действительно установлено
      console.log(`Текущее значение classIds в форме после установки:`, form.getValues("classIds"));
    } catch (error) {
      console.error("Error fetching student classes:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить классы ученика",
        variant: "destructive",
      });
    }
  };
  
  const fetchParentStudentsForEdit = async (parentId: number) => {
    try {
      const res = await fetch(`/api/parent-students?parentId=${parentId}`);
      if (!res.ok) throw new Error("Failed to fetch parent-student connections");
      const connections = await res.json();
      form.setValue("childIds", connections.map((c: ParentStudent) => c.studentId));
    } catch (error) {
      console.error("Error fetching parent-student connections:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить связи родитель-ученик",
        variant: "destructive",
      });
    }
  };
  
  const fetchStudentParentsForEdit = async (studentId: number) => {
    try {
      const res = await fetch(`/api/student-parents?studentId=${studentId}`);
      if (!res.ok) throw new Error("Failed to fetch student-parent connections");
      const connections = await res.json();
      form.setValue("parentIds", connections.map((c: ParentStudent) => c.parentId));
    } catch (error) {
      console.error("Error fetching student-parent connections:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить связи ученик-родитель",
        variant: "destructive",
      });
    }
  };
  
  // Fetch classes for student assignment
  const { data: classes = [] } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
    enabled: isAdmin()
  });
  
  // Fetch student classes for selected student
  const { data: studentClasses = [], isLoading: studentClassesLoading, refetch: refetchStudentClasses } = useQuery<Class[]>({
    queryKey: ["/api/student-classes", selectedStudent],
    queryFn: async ({ queryKey }) => {
      const studentId = queryKey[1];
      if (!studentId) return [];
      const res = await fetch(`/api/student-classes?studentId=${studentId}`);
      if (!res.ok) throw new Error("Failed to fetch student classes");
      return res.json();
    },
    enabled: !!selectedStudent
  });
  
  // Fetch parent-student connections for selected parent
  const { data: parentStudents = [], isLoading: parentStudentsLoading, refetch: refetchParentStudents } = useQuery<ParentStudent[]>({
    queryKey: ["/api/parent-students", selectedParent],
    queryFn: async ({ queryKey }) => {
      const parentId = queryKey[1];
      if (!parentId) return [];
      const res = await fetch(`/api/parent-students?parentId=${parentId}`);
      if (!res.ok) throw new Error("Failed to fetch parent-student connections");
      return res.json();
    },
    enabled: !!selectedParent
  });
  
  // Filter students and parents
  const students = users.filter(u => u.role === UserRoleEnum.STUDENT);
  const parents = users.filter(u => u.role === UserRoleEnum.PARENT);
  
  const filteredStudents = searchStudentTerm 
    ? students.filter(student => 
        `${student.firstName} ${student.lastName} ${student.username}`.toLowerCase().includes(searchStudentTerm.toLowerCase()))
    : students;
    
  const filteredParents = searchParentTerm
    ? parents.filter(parent => 
        `${parent.firstName} ${parent.lastName} ${parent.username}`.toLowerCase().includes(searchParentTerm.toLowerCase()))
    : parents;
  
  // Form for adding student to class
  const studentClassForm = useForm({
    defaultValues: {
      studentId: "",
      classId: ""
    },
    resolver: zodResolver(
      z.object({
        studentId: z.string({
          required_error: "Выберите ученика"
        }),
        classId: z.string({
          required_error: "Выберите класс"
        })
      })
    )
  });
  
  // Form for connecting parent and student
  const parentStudentForm = useForm({
    defaultValues: {
      parentId: "",
      studentId: ""
    },
    resolver: zodResolver(
      z.object({
        parentId: z.string({
          required_error: "Выберите родителя"
        }),
        studentId: z.string({
          required_error: "Выберите ученика"
        })
      })
    )
  });
  
  // Add student to class mutation
  const addStudentToClassMutation = useMutation({
    mutationFn: async (data: { studentId: number, classId: number }) => {
      const res = await apiRequest("/api/student-classes", "POST", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Успешно",
        description: "Ученик добавлен в класс",
        variant: "default",
      });
      studentClassForm.reset({ 
        studentId: selectedStudent?.toString() || "", 
        classId: "" 
      });
      if (selectedStudent) {
        refetchStudentClasses();
      }
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось добавить ученика в класс",
        variant: "destructive",
      });
    },
  });
  
  // Add parent-student connection mutation
  const addParentStudentMutation = useMutation({
    mutationFn: async (data: { parentId: number, studentId: number }) => {
      const res = await apiRequest("/api/parent-students", "POST", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Успешно",
        description: "Родитель связан с учеником",
        variant: "default",
      });
      parentStudentForm.reset({ 
        parentId: selectedParent?.toString() || "", 
        studentId: "" 
      });
      if (selectedParent) {
        refetchParentStudents();
      }
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось связать родителя с учеником",
        variant: "destructive",
      });
    },
  });
  
  // Handlers for student-class management
  const handleStudentSelect = (studentId: number) => {
    setSelectedStudent(studentId);
    studentClassForm.setValue("studentId", studentId.toString());
  };
  
  const onSubmitStudentClass = (values: any) => {
    addStudentToClassMutation.mutate({
      studentId: parseInt(values.studentId),
      classId: parseInt(values.classId)
    });
  };
  
  // Handlers for parent-student management
  const handleParentSelect = (parentId: number) => {
    setSelectedParent(parentId);
    parentStudentForm.setValue("parentId", parentId.toString());
  };
  
  const onSubmitParentStudent = (values: any) => {
    addParentStudentMutation.mutate({
      parentId: parseInt(values.parentId),
      studentId: parseInt(values.studentId)
    });
  };
  
  // Helper functions
  const getStudentName = (id: number) => {
    const student = users.find(s => s.id === id);
    return student ? `${student.lastName} ${student.firstName}` : `Ученик ${id}`;
  };
  
  const getClassName = (id: number) => {
    const cls = classes.find(c => c.id === id);
    return cls ? cls.name : `Класс ${id}`;
  };
  
  const isStudentInClass = (studentId: number, classId: number) => {
    if (!selectedStudent || selectedStudent !== studentId) return false;
    return studentClasses.some(cls => cls.id === classId);
  };
  
  const isStudentConnectedToParent = (parentId: number, studentId: number) => {
    if (!selectedParent || selectedParent !== parentId) return false;
    return parentStudents.some(ps => ps.studentId === studentId);
  };
  
  const getConnectedStudents = () => {
    if (!selectedParent) return [];
    
    return parentStudents.map(ps => {
      const student = users.find(u => u.id === ps.studentId);
      return {
        id: ps.id,
        studentId: ps.studentId,
        name: student ? `${student.lastName} ${student.firstName}` : `Ученик ${ps.studentId}`,
        email: student?.email
      };
    });
  };

  return (
    <MainLayout>
      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Удаление пользователя</DialogTitle>
            <DialogDescription>
              Вы уверены, что хотите удалить пользователя {selectedUser?.firstName} {selectedUser?.lastName}?
              Это действие нельзя будет отменить.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Удаление...
                </>
              ) : (
                <>Удалить</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Tabs defaultValue="users" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="users" className="flex items-center">
            <UsersIcon className="mr-2 h-4 w-4" />
            Пользователи
          </TabsTrigger>
          <TabsTrigger value="student-classes" className="flex items-center">
            <BookOpen className="mr-2 h-4 w-4" />
            Ученики и классы
          </TabsTrigger>
          <TabsTrigger value="parent-students" className="flex items-center">
            <UserPlusIcon className="mr-2 h-4 w-4" />
            Родители и дети
          </TabsTrigger>
        </TabsList>
        
        {/* Users Tab */}
        <TabsContent value="users">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-heading font-bold text-gray-800">Пользователи</h2>
            {!isPrincipal() && (
              <Button onClick={() => { resetForm(); setIsAddDialogOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" /> Добавить пользователя
              </Button>
            )}
          </div>
          
          {/* Search and filters */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-grow">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Поиск пользователей..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="w-full md:w-64">
              <Select
                value={roleFilter}
                onValueChange={(value) => setRoleFilter(value as UserRoleEnum | "all")}
              >
                <SelectTrigger>
                  <div className="flex items-center">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Фильтр по роли" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все роли</SelectItem>
                  {Object.values(UserRoleEnum).map((role) => (
                    <SelectItem key={role} value={role}>
                      {getRoleName(role as UserRoleEnum)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Users Table */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Имя</TableHead>
                  <TableHead>Логин</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Роль</TableHead>
                  <TableHead>Школа</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6">
                      Загрузка...
                    </TableCell>
                  </TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6">
                      {searchQuery || roleFilter !== "all" ? "Пользователи не найдены" : "Нет пользователей"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.firstName} {u.lastName}</TableCell>
                      <TableCell>{u.username}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{getRoleName(u.role)}</TableCell>
                      <TableCell>{u.schoolId || '-'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {canEdit() && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => handleEdit(u)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => handleDelete(u)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        
        {/* Student-Classes Tab */}
        <TabsContent value="student-classes">
          <div className="mb-6">
            <h2 className="text-2xl font-heading font-bold text-gray-800">Управление учениками в классах</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Список студентов */}
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle>Ученики</CardTitle>
                <CardDescription>Выберите ученика для просмотра его классов</CardDescription>
                <div className="relative mt-2">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Поиск ученика..."
                    className="pl-8"
                    value={searchStudentTerm}
                    onChange={(e) => setSearchStudentTerm(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[400px] overflow-y-auto">
                  {isLoading ? (
                    <div className="text-center p-4">Загрузка учеников...</div>
                  ) : filteredStudents.length === 0 ? (
                    <div className="text-center p-4 text-gray-500">Ученики не найдены</div>
                  ) : (
                    <ul className="space-y-2">
                      {filteredStudents.map((student) => (
                        <li key={student.id}>
                          <Button
                            variant={selectedStudent === student.id ? "default" : "outline"}
                            className="w-full justify-start"
                            onClick={() => handleStudentSelect(student.id)}
                          >
                            <UserPlusIcon className="h-4 w-4 mr-2" />
                            {student.lastName} {student.firstName}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Форма добавления в класс и список классов ученика */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>
                  {selectedStudent ? (
                    <>Классы ученика: {getStudentName(selectedStudent)}</>
                  ) : (
                    <>Выберите ученика</>
                  )}
                </CardTitle>
                <CardDescription>
                  {selectedStudent ? "Управление классами для выбранного ученика" : "Для управления классами сначала выберите ученика из списка слева"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedStudent && (
                  <>
                    <Form {...studentClassForm}>
                      <form onSubmit={studentClassForm.handleSubmit(onSubmitStudentClass)} className="space-y-4 mb-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={studentClassForm.control}
                            name="studentId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Ученик</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={selectedStudent?.toString() || field.value}
                                  defaultValue={selectedStudent?.toString()}
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
                          <FormField
                            control={studentClassForm.control}
                            name="classId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Класс</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Выберите класс" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {classes.map((cls) => (
                                      <SelectItem 
                                        key={cls.id} 
                                        value={cls.id.toString()}
                                        disabled={isStudentInClass(selectedStudent, cls.id)}
                                      >
                                        {cls.name} {isStudentInClass(selectedStudent, cls.id) && "(уже добавлен)"}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <Button type="submit" disabled={addStudentToClassMutation.isPending}>
                          {addStudentToClassMutation.isPending ? "Добавление..." : "Добавить в класс"}
                        </Button>
                      </form>
                    </Form>

                    <div className="mt-6">
                      <h3 className="text-lg font-medium mb-4">Текущие классы ученика</h3>
                      {studentClassesLoading ? (
                        <div className="text-center p-4">Загрузка классов...</div>
                      ) : studentClasses.length === 0 ? (
                        <div className="text-center p-4 text-gray-500">Ученик не добавлен ни в один класс</div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Класс</TableHead>
                              <TableHead>Учебный год</TableHead>
                              <TableHead>Уровень</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {studentClasses.map((cls) => (
                              <TableRow key={cls.id}>
                                <TableCell className="font-medium">{cls.name}</TableCell>
                                <TableCell>{cls.academicYear}</TableCell>
                                <TableCell>{cls.gradeLevel}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </>
                )}

                {!selectedStudent && (
                  <div className="text-center py-8 text-gray-500">
                    <BookOpen className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                    <p>Для управления классами выберите ученика из списка слева</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Parent-Students Tab */}
        <TabsContent value="parent-students">
          <div className="mb-6">
            <h2 className="text-2xl font-heading font-bold text-gray-800">Управление связями родитель-ученик</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Список родителей */}
            <Card className="md:col-span-1">
              <CardHeader>
                <CardTitle>Родители</CardTitle>
                <CardDescription>Выберите родителя для управления связями с учениками</CardDescription>
                <div className="relative mt-2">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Поиск родителя..."
                    className="pl-8"
                    value={searchParentTerm}
                    onChange={(e) => setSearchParentTerm(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[400px] overflow-y-auto">
                  {isLoading ? (
                    <div className="text-center p-4">Загрузка родителей...</div>
                  ) : filteredParents.length === 0 ? (
                    <div className="text-center p-4 text-gray-500">Родители не найдены</div>
                  ) : (
                    <ul className="space-y-2">
                      {filteredParents.map((parent) => (
                        <li key={parent.id}>
                          <Button
                            variant={selectedParent === parent.id ? "default" : "outline"}
                            className="w-full justify-start"
                            onClick={() => handleParentSelect(parent.id)}
                          >
                            <UserIcon className="h-4 w-4 mr-2" />
                            {parent.lastName} {parent.firstName}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Форма добавления и список детей */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>
                  {selectedParent ? (
                    <>Дети родителя: {getStudentName(selectedParent)}</>
                  ) : (
                    <>Выберите родителя</>
                  )}
                </CardTitle>
                <CardDescription>
                  {selectedParent 
                    ? "Управление связями для выбранного родителя" 
                    : "Для управления связями сначала выберите родителя из списка слева"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedParent && (
                  <>
                    <Form {...parentStudentForm}>
                      <form onSubmit={parentStudentForm.handleSubmit(onSubmitParentStudent)} className="space-y-4 mb-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={parentStudentForm.control}
                            name="parentId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Родитель</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  defaultValue={selectedParent?.toString()}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Выберите родителя" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {parents.map((parent) => (
                                      <SelectItem key={parent.id} value={parent.id.toString()}>
                                        {parent.lastName} {parent.firstName}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={parentStudentForm.control}
                            name="studentId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Ученик</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  defaultValue={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Выберите ученика" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {students.map((student) => (
                                      <SelectItem 
                                        key={student.id} 
                                        value={student.id.toString()}
                                        disabled={isStudentConnectedToParent(selectedParent, student.id)}
                                      >
                                        {student.lastName} {student.firstName} 
                                        {isStudentConnectedToParent(selectedParent, student.id) && " (уже связан)"}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <Button type="submit" disabled={addParentStudentMutation.isPending}>
                          {addParentStudentMutation.isPending ? "Добавление..." : "Добавить ребенка"}
                        </Button>
                      </form>
                    </Form>

                    <div className="mt-6">
                      <h3 className="text-lg font-medium mb-4">Дети родителя</h3>
                      {parentStudentsLoading ? (
                        <div className="text-center p-4">Загрузка связей...</div>
                      ) : parentStudents.length === 0 ? (
                        <div className="text-center p-4 text-gray-500">У родителя нет связанных учеников</div>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Ученик</TableHead>
                              <TableHead>Email</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {getConnectedStudents().map((connection) => (
                              <TableRow key={connection.id}>
                                <TableCell className="font-medium">{connection.name}</TableCell>
                                <TableCell>{connection.email || "-"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </>
                )}

                {!selectedParent && (
                  <div className="text-center py-8 text-gray-500">
                    <UsersIcon className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                    <p>Для управления связями выберите родителя из списка слева</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Add User Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-md max-w-[95vw] w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Добавить пользователя</DialogTitle>
            <DialogDescription>
              Введите информацию о новом пользователе
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitAdd)} className="space-y-4">
              <div className="grid sm:grid-cols-2 grid-cols-1 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Имя</FormLabel>
                      <FormControl>
                        <Input placeholder="Имя" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Фамилия</FormLabel>
                      <FormControl>
                        <Input placeholder="Фамилия" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Логин</FormLabel>
                    <FormControl>
                      <Input placeholder="Логин" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="Email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Телефон</FormLabel>
                    <FormControl>
                      <Input placeholder="Телефон" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid sm:grid-cols-2 grid-cols-1 gap-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Пароль</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Пароль" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Подтверждение</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Повторите пароль" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Роль</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите роль" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {isSuperAdmin() && (
                          <SelectItem value={UserRoleEnum.SUPER_ADMIN}>Супер-администратор</SelectItem>
                        )}
                        {isAdmin() && (
                          <>
                            <SelectItem value={UserRoleEnum.SCHOOL_ADMIN}>Администратор школы</SelectItem>
                            <SelectItem value={UserRoleEnum.PRINCIPAL}>Директор</SelectItem>
                            <SelectItem value={UserRoleEnum.VICE_PRINCIPAL}>Завуч</SelectItem>
                          </>
                        )}
                        <SelectItem value={UserRoleEnum.TEACHER}>Учитель</SelectItem>
                        <SelectItem value={UserRoleEnum.CLASS_TEACHER}>Классный руководитель</SelectItem>
                        <SelectItem value={UserRoleEnum.STUDENT}>Ученик</SelectItem>
                        <SelectItem value={UserRoleEnum.PARENT}>Родитель</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {isSuperAdmin() && (
                <FormField
                  control={form.control}
                  name="schoolId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Школа</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value === "null" ? null : parseInt(value))}
                        value={field.value === null ? "null" : field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Выберите школу" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="null">Не выбрано</SelectItem>
                          {Array.isArray(schools) && schools.map((school: any) => (
                            <SelectItem key={school.id} value={school.id.toString()}>
                              {school.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              {/* Управление классом для классного руководителя */}
              {form.watch("role") === UserRoleEnum.CLASS_TEACHER && (
                <FormField
                  control={form.control}
                  name="classIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Класс</FormLabel>
                      <FormDescription>
                        Выберите класс, которым будет руководить классный руководитель
                      </FormDescription>
                      <div className="mt-2">
                        {classes.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Нет доступных классов</p>
                        ) : (
                          <Select
                            onValueChange={(value) => {
                              const classId = parseInt(value);
                              field.onChange([classId]); // Устанавливаем только один класс
                            }}
                            value={field.value?.[0]?.toString() || ""}
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
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              {/* Управление классами для студента */}
              {form.watch("role") === UserRoleEnum.STUDENT && (
                <FormField
                  control={form.control}
                  name="classIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Классы</FormLabel>
                      <FormDescription>
                        Выберите классы, в которые будет добавлен ученик
                      </FormDescription>
                      <div className="mt-2 max-h-32 overflow-y-auto">
                        {classes.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Нет доступных классов</p>
                        ) : (
                          <div className="space-y-2">
                            {classes.map((cls) => (
                              <div key={cls.id} className="flex items-center">
                                <Checkbox
                                  id={`add-class-${cls.id}`}
                                  checked={field.value?.includes(cls.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      field.onChange([...(field.value || []), cls.id]);
                                    } else {
                                      field.onChange(
                                        field.value?.filter((id) => id !== cls.id) || []
                                      );
                                    }
                                  }}
                                />
                                <Label
                                  htmlFor={`add-class-${cls.id}`}
                                  className="ml-2 text-sm font-medium cursor-pointer"
                                >
                                  {cls.name}
                                </Label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              {/* Управление связями родитель-ученик для родителя */}
              {form.watch("role") === UserRoleEnum.PARENT && (
                <FormField
                  control={form.control}
                  name="childIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Дети</FormLabel>
                      <FormDescription>
                        Выберите учеников, с которыми будет связан родитель
                      </FormDescription>
                      <div className="mt-2 max-h-32 overflow-y-auto">
                        {students.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Нет доступных учеников</p>
                        ) : (
                          <div className="space-y-2">
                            {students.map((student) => (
                              <div key={student.id} className="flex items-center">
                                <Checkbox
                                  id={`add-student-${student.id}`}
                                  checked={field.value?.includes(student.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      field.onChange([...(field.value || []), student.id]);
                                    } else {
                                      field.onChange(
                                        field.value?.filter((id) => id !== student.id) || []
                                      );
                                    }
                                  }}
                                />
                                <Label
                                  htmlFor={`add-student-${student.id}`}
                                  className="ml-2 text-sm font-medium cursor-pointer"
                                >
                                  {student.lastName} {student.firstName}
                                </Label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              {/* Управление связями ученик-родитель для ученика */}
              {form.watch("role") === UserRoleEnum.STUDENT && (
                <FormField
                  control={form.control}
                  name="parentIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Родители</FormLabel>
                      <FormDescription>
                        Выберите родителей для ученика
                      </FormDescription>
                      <div className="mt-2 max-h-32 overflow-y-auto">
                        {parents.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Нет доступных родителей</p>
                        ) : (
                          <div className="space-y-2">
                            {parents.map((parent) => (
                              <div key={parent.id} className="flex items-center">
                                <Checkbox
                                  id={`add-parent-${parent.id}`}
                                  checked={field.value?.includes(parent.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      field.onChange([...(field.value || []), parent.id]);
                                    } else {
                                      field.onChange(
                                        field.value?.filter((id) => id !== parent.id) || []
                                      );
                                    }
                                  }}
                                />
                                <Label
                                  htmlFor={`add-parent-${parent.id}`}
                                  className="ml-2 text-sm font-medium cursor-pointer"
                                >
                                  {parent.lastName} {parent.firstName}
                                </Label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              <DialogFooter>
                <Button type="submit" disabled={addUserMutation.isPending}>
                  {addUserMutation.isPending ? "Добавление..." : "Добавить пользователя"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md max-w-[95vw] w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Редактировать пользователя</DialogTitle>
            <DialogDescription>
              Измените информацию о пользователе
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitEdit)} className="space-y-4">
              <div className="grid sm:grid-cols-2 grid-cols-1 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Имя</FormLabel>
                      <FormControl>
                        <Input placeholder="Имя" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Фамилия</FormLabel>
                      <FormControl>
                        <Input placeholder="Фамилия" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Логин</FormLabel>
                    <FormControl>
                      <Input placeholder="Логин" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="Email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Телефон</FormLabel>
                    <FormControl>
                      <Input placeholder="Телефон" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid sm:grid-cols-2 grid-cols-1 gap-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Новый пароль (не обязательно)</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Оставьте пустым, чтобы не менять" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Подтверждение пароля</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Подтверждение пароля" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {isSuperAdmin() && (
                <>
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Роль</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Выберите роль" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={UserRoleEnum.SUPER_ADMIN}>Супер-администратор</SelectItem>
                            <SelectItem value={UserRoleEnum.SCHOOL_ADMIN}>Администратор школы</SelectItem>
                            <SelectItem value={UserRoleEnum.PRINCIPAL}>Директор</SelectItem>
                            <SelectItem value={UserRoleEnum.VICE_PRINCIPAL}>Завуч</SelectItem>
                            <SelectItem value={UserRoleEnum.TEACHER}>Учитель</SelectItem>
                            <SelectItem value={UserRoleEnum.CLASS_TEACHER}>Классный руководитель</SelectItem>
                            <SelectItem value={UserRoleEnum.STUDENT}>Ученик</SelectItem>
                            <SelectItem value={UserRoleEnum.PARENT}>Родитель</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="schoolId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Школа</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(value === "null" ? null : parseInt(value))}
                          value={field.value === null ? "null" : field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Выберите школу" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="null">Не выбрано</SelectItem>
                            {Array.isArray(schools) && schools.map((school: any) => (
                              <SelectItem key={school.id} value={school.id.toString()}>
                                {school.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
              
              {/* Управление классом для классного руководителя */}
              {form.watch("role") === UserRoleEnum.CLASS_TEACHER && (
                <FormField
                  control={form.control}
                  name="classIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Класс</FormLabel>
                      <FormDescription>
                        Выберите класс, которым будет руководить классный руководитель
                      </FormDescription>
                      <div className="mt-2">
                        {classes.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Нет доступных классов</p>
                        ) : (
                          <Select
                            onValueChange={(value) => {
                              const classId = parseInt(value);
                              field.onChange([classId]); // Устанавливаем только один класс
                            }}
                            value={field.value?.[0]?.toString() || ""}
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
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              {/* Управление классами для студента */}
              {form.watch("role") === UserRoleEnum.STUDENT && (
                <FormField
                  control={form.control}
                  name="classIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Классы</FormLabel>
                      <FormDescription>
                        Выберите классы, в которые добавлен ученик
                      </FormDescription>
                      <div className="mt-2 max-h-32 overflow-y-auto">
                        {classes.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Нет доступных классов</p>
                        ) : (
                          <div className="space-y-2">
                            {classes.map((cls) => (
                              <div key={cls.id} className="flex items-center">
                                <Checkbox
                                  id={`edit-class-${cls.id}`}
                                  checked={field.value?.includes(cls.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      field.onChange([...(field.value || []), cls.id]);
                                    } else {
                                      field.onChange(
                                        field.value?.filter((id) => id !== cls.id) || []
                                      );
                                    }
                                  }}
                                />
                                <Label
                                  htmlFor={`edit-class-${cls.id}`}
                                  className="ml-2 text-sm font-medium cursor-pointer"
                                >
                                  {cls.name}
                                </Label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              {/* Управление связями родитель-ученик для родителя */}
              {form.watch("role") === UserRoleEnum.PARENT && (
                <FormField
                  control={form.control}
                  name="childIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Дети</FormLabel>
                      <FormDescription>
                        Выберите учеников, с которыми связан родитель
                      </FormDescription>
                      <div className="mt-2 max-h-32 overflow-y-auto">
                        {students.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Нет доступных учеников</p>
                        ) : (
                          <div className="space-y-2">
                            {students.map((student) => (
                              <div key={student.id} className="flex items-center">
                                <Checkbox
                                  id={`edit-student-${student.id}`}
                                  checked={field.value?.includes(student.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      field.onChange([...(field.value || []), student.id]);
                                    } else {
                                      field.onChange(
                                        field.value?.filter((id) => id !== student.id) || []
                                      );
                                    }
                                  }}
                                />
                                <Label
                                  htmlFor={`edit-student-${student.id}`}
                                  className="ml-2 text-sm font-medium cursor-pointer"
                                >
                                  {student.lastName} {student.firstName}
                                </Label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              {/* Управление связями ученик-родитель для ученика */}
              {form.watch("role") === UserRoleEnum.STUDENT && (
                <FormField
                  control={form.control}
                  name="parentIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Родители</FormLabel>
                      <FormDescription>
                        Выберите родителей для ученика
                      </FormDescription>
                      <div className="mt-2 max-h-32 overflow-y-auto">
                        {parents.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Нет доступных родителей</p>
                        ) : (
                          <div className="space-y-2">
                            {parents.map((parent) => (
                              <div key={parent.id} className="flex items-center">
                                <Checkbox
                                  id={`edit-parent-${parent.id}`}
                                  checked={field.value?.includes(parent.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      field.onChange([...(field.value || []), parent.id]);
                                    } else {
                                      field.onChange(
                                        field.value?.filter((id) => id !== parent.id) || []
                                      );
                                    }
                                  }}
                                />
                                <Label
                                  htmlFor={`edit-parent-${parent.id}`}
                                  className="ml-2 text-sm font-medium cursor-pointer"
                                >
                                  {parent.lastName} {parent.firstName}
                                </Label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              <DialogFooter>
                <Button type="submit" disabled={editUserMutation.isPending}>
                  {editUserMutation.isPending ? "Сохранение..." : "Сохранить изменения"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}