import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/main-layout';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Pencil, Trash2, User, Search } from 'lucide-react';
import { useRoleCheck } from '@/hooks/use-role-check';
import { Subgroup, Class, User as UserType, InsertSubgroup } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Schema for the subgroup form validation
const subgroupFormSchema = z.object({
  name: z.string().min(1, { message: "Название подгруппы обязательно" }),
  description: z.string().optional(),
  classId: z.string().min(1, { message: "Выберите класс" }),
  schoolId: z.string().min(1, { message: "Выберите школу" }),
});

type SubgroupFormData = z.infer<typeof subgroupFormSchema>;

// Schema for the student assignment form validation
const studentAssignmentSchema = z.object({
  studentId: z.string().min(1, { message: "Выберите ученика" }),
});

type StudentAssignmentData = z.infer<typeof studentAssignmentSchema>;

export default function SubgroupsPage() {
  const { isAdmin, isSuperAdmin } = useRoleCheck();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<string | null>(null);
  const [selectedSubgroup, setSelectedSubgroup] = useState<Subgroup | null>(null);
  const [activeTab, setActiveTab] = useState("subgroups");
  
  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isStudentAssignDialogOpen, setIsStudentAssignDialogOpen] = useState(false);
  
  // Only Super admin and School admin can access this page
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
  
  // Fetch subgroups
  const {
    data: subgroups = [],
    isLoading: isLoadingSubgroups,
    refetch: refetchSubgroups
  } = useQuery<Subgroup[]>({
    queryKey: ['/api/subgroups', selectedSchool, selectedClass],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedSchool) params.append('schoolId', selectedSchool);
      if (selectedClass) params.append('classId', selectedClass);
      
      const response = await fetch(`/api/subgroups?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch subgroups');
      }
      
      return response.json();
    }
  });
  
  // Fetch classes for dropdown
  const { data: classes = [], isLoading: isLoadingClasses } = useQuery<Class[]>({
    queryKey: ['/api/classes', selectedSchool],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedSchool) params.append('schoolId', selectedSchool);
      
      const response = await fetch(`/api/classes?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch classes');
      }
      
      return response.json();
    }
  });
  
  // Fetch schools for dropdown
  const { data: schools = [], isLoading: isLoadingSchools } = useQuery({
    queryKey: ['/api/schools'],
  });
  
  // Fetch students for the student assignment dialog
  const { data: students = [], isLoading: isLoadingStudents } = useQuery<UserType[]>({
    queryKey: ['/api/users', 'student', selectedClass],
    queryFn: async () => {
      if (!selectedClass) return [];
      
      const response = await fetch(`/api/users?role=student&classId=${selectedClass}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch students');
      }
      
      return response.json();
    },
    enabled: !!selectedClass && isStudentAssignDialogOpen
  });
  
  // Fetch students already in the selected subgroup
  const {
    data: subgroupStudents = [],
    isLoading: isLoadingSubgroupStudents,
    refetch: refetchSubgroupStudents
  } = useQuery<UserType[]>({
    queryKey: ['/api/student-subgroups', selectedSubgroup?.id],
    queryFn: async () => {
      if (!selectedSubgroup) return [];
      
      const response = await fetch(`/api/student-subgroups?subgroupId=${selectedSubgroup.id}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch subgroup students');
      }
      
      // Extract student IDs from the response
      const studentSubgroups = await response.json();
      const studentIds = studentSubgroups.map((item: any) => item.studentId);
      
      // If there are no students, return empty array
      if (studentIds.length === 0) return [];
      
      // Fetch the actual student objects
      const studentsResponse = await fetch(`/api/users?ids=${studentIds.join(',')}`);
      
      if (!studentsResponse.ok) {
        throw new Error('Failed to fetch student details');
      }
      
      return studentsResponse.json();
    },
    enabled: !!selectedSubgroup && activeTab === "students"
  });
  
  // Filter subgroups by search query
  const filteredSubgroups = subgroups.filter(subgroup => {
    const matchesSearch = subgroup.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (subgroup.description && subgroup.description.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesClass = !selectedClass || subgroup.classId.toString() === selectedClass;
    const matchesSchool = !selectedSchool || subgroup.schoolId.toString() === selectedSchool;
    
    return matchesSearch && matchesClass && matchesSchool;
  });
  
  // Create subgroup mutation
  const createSubgroupMutation = useMutation({
    mutationFn: (data: Partial<InsertSubgroup>) => 
      apiRequest('/api/subgroups', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/subgroups'] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Успешно",
        description: "Подгруппа создана",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось создать подгруппу",
        variant: "destructive"
      });
    }
  });
  
  // Update subgroup mutation
  const updateSubgroupMutation = useMutation({
    mutationFn: ({ id, data }: { id: number, data: Partial<InsertSubgroup> }) => 
      apiRequest(`/api/subgroups/${id}`, 'PATCH', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/subgroups'] });
      setIsEditDialogOpen(false);
      toast({
        title: "Успешно",
        description: "Подгруппа обновлена",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось обновить подгруппу",
        variant: "destructive"
      });
    }
  });
  
  // Delete subgroup mutation
  const deleteSubgroupMutation = useMutation({
    mutationFn: (id: number) => 
      apiRequest(`/api/subgroups/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/subgroups'] });
      setIsDeleteDialogOpen(false);
      setSelectedSubgroup(null);
      toast({
        title: "Успешно",
        description: "Подгруппа удалена",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить подгруппу",
        variant: "destructive"
      });
    }
  });
  
  // Add student to subgroup mutation
  const addStudentToSubgroupMutation = useMutation({
    mutationFn: (data: { studentId: number, subgroupId: number }) => 
      apiRequest('/api/student-subgroups', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/student-subgroups', selectedSubgroup?.id] });
      setIsStudentAssignDialogOpen(false);
      toast({
        title: "Успешно",
        description: "Ученик добавлен в подгруппу",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось добавить ученика в подгруппу",
        variant: "destructive"
      });
    }
  });
  
  // Remove student from subgroup mutation
  const removeStudentFromSubgroupMutation = useMutation({
    mutationFn: (data: { studentId: number, subgroupId: number }) => 
      apiRequest('/api/student-subgroups', 'DELETE', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/student-subgroups', selectedSubgroup?.id] });
      toast({
        title: "Успешно",
        description: "Ученик удален из подгруппы",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить ученика из подгруппы",
        variant: "destructive"
      });
    }
  });
  
  // Form for creating and editing subgroups
  const subgroupForm = useForm<SubgroupFormData>({
    resolver: zodResolver(subgroupFormSchema),
    defaultValues: {
      name: "",
      description: "",
      classId: "",
      schoolId: "",
    }
  });
  
  // Form for assigning students to subgroups
  const studentAssignmentForm = useForm<StudentAssignmentData>({
    resolver: zodResolver(studentAssignmentSchema),
    defaultValues: {
      studentId: "",
    }
  });
  
  // Reset and set up the form for creating a new subgroup
  const handleCreateSubgroup = () => {
    subgroupForm.reset({
      name: "",
      description: "",
      classId: selectedClass || "",
      schoolId: selectedSchool || "",
    });
    setIsCreateDialogOpen(true);
  };
  
  // Reset and set up the form for editing a subgroup
  const handleEditSubgroup = (subgroup: Subgroup) => {
    setSelectedSubgroup(subgroup);
    subgroupForm.reset({
      name: subgroup.name,
      description: subgroup.description || "",
      classId: subgroup.classId.toString(),
      schoolId: subgroup.schoolId.toString(),
    });
    setIsEditDialogOpen(true);
  };
  
  // Set up for deleting a subgroup
  const handleDeleteSubgroup = (subgroup: Subgroup) => {
    setSelectedSubgroup(subgroup);
    setIsDeleteDialogOpen(true);
  };
  
  // Set up for assigning students to a subgroup
  const handleAssignStudents = (subgroup: Subgroup) => {
    setSelectedSubgroup(subgroup);
    setSelectedClass(subgroup.classId.toString());
    studentAssignmentForm.reset({
      studentId: "",
    });
    setActiveTab("students");
    setIsStudentAssignDialogOpen(true);
  };
  
  // Handle form submission for creating a new subgroup
  const onCreateSubgroup = (data: SubgroupFormData) => {
    createSubgroupMutation.mutate({
      name: data.name,
      description: data.description,
      classId: parseInt(data.classId),
      schoolId: parseInt(data.schoolId),
    });
  };
  
  // Handle form submission for editing a subgroup
  const onEditSubgroup = (data: SubgroupFormData) => {
    if (!selectedSubgroup) return;
    
    updateSubgroupMutation.mutate({
      id: selectedSubgroup.id,
      data: {
        name: data.name,
        description: data.description,
        classId: parseInt(data.classId),
        schoolId: parseInt(data.schoolId),
      }
    });
  };
  
  // Handle form submission for assigning a student to a subgroup
  const onAssignStudent = (data: StudentAssignmentData) => {
    if (!selectedSubgroup) return;
    
    addStudentToSubgroupMutation.mutate({
      studentId: parseInt(data.studentId),
      subgroupId: selectedSubgroup.id
    });
  };
  
  // Handle removing a student from a subgroup
  const handleRemoveStudent = (studentId: number) => {
    if (!selectedSubgroup) return;
    
    removeStudentFromSubgroupMutation.mutate({
      studentId,
      subgroupId: selectedSubgroup.id
    });
  };
  
  // Get class name by ID
  const getClassName = (classId: number) => {
    const cls = classes.find(c => c.id === classId);
    return cls ? cls.name : `Класс ${classId}`;
  };
  
  // Get school name by ID
  const getSchoolName = (schoolId: number) => {
    const school = schools.find(s => s.id === schoolId);
    return school ? school.name : `Школа ${schoolId}`;
  };
  
  // Check if a student is already in the selected subgroup
  const isStudentInSubgroup = (studentId: number) => {
    return subgroupStudents.some(student => student.id === studentId);
  };

  return (
    <MainLayout>
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Управление подгруппами</h1>
        </div>
        
        <div className="grid grid-cols-1 gap-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Фильтры</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4">
              <div className="flex-1">
                <Select
                  value={selectedSchool || "all"}
                  onValueChange={(value) => {
                    setSelectedSchool(value === "all" ? null : value);
                    setSelectedClass(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите школу" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все школы</SelectItem>
                    {schools.map((school) => (
                      <SelectItem key={school.id} value={school.id.toString()}>
                        {school.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex-1">
                <Select
                  value={selectedClass || "all"}
                  onValueChange={(value) => setSelectedClass(value === "all" ? null : value)}
                  disabled={!selectedSchool}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите класс" />
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
              </div>
              
              <div className="flex-1 relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Поиск подгрупп..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              <Button onClick={handleCreateSubgroup}>
                <Plus className="mr-2 h-4 w-4" />
                Создать подгруппу
              </Button>
            </CardContent>
          </Card>
          
          {/* Subgroups list */}
          <Card>
            <CardHeader>
              <CardTitle>Подгруппы</CardTitle>
              <CardDescription>
                Здесь отображаются все подгруппы с возможностью управления
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingSubgroups ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : filteredSubgroups.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-muted-foreground">Подгруппы не найдены</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Название</TableHead>
                      <TableHead>Описание</TableHead>
                      <TableHead>Класс</TableHead>
                      <TableHead>Школа</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubgroups.map((subgroup) => (
                      <TableRow key={subgroup.id}>
                        <TableCell className="font-medium">{subgroup.name}</TableCell>
                        <TableCell>{subgroup.description || "—"}</TableCell>
                        <TableCell>{getClassName(subgroup.classId)}</TableCell>
                        <TableCell>{getSchoolName(subgroup.schoolId)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end space-x-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleAssignStudents(subgroup)}
                              title="Управление учениками"
                            >
                              <User className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleEditSubgroup(subgroup)}
                              title="Редактировать"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleDeleteSubgroup(subgroup)}
                              title="Удалить"
                            >
                              <Trash2 className="h-4 w-4" />
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
          
          {/* Subgroup details with students tab (visible when a subgroup is selected) */}
          {selectedSubgroup && (
            <Card>
              <CardHeader>
                <CardTitle>{selectedSubgroup.name}</CardTitle>
                <CardDescription>
                  {selectedSubgroup.description || "Нет описания"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="students" value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="students">Ученики подгруппы</TabsTrigger>
                    <TabsTrigger value="details">Детали подгруппы</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="students">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-medium">Ученики в подгруппе</h3>
                      <Button onClick={() => setIsStudentAssignDialogOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Добавить ученика
                      </Button>
                    </div>
                    
                    {isLoadingSubgroupStudents ? (
                      <div className="flex justify-center py-6">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    ) : subgroupStudents.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-muted-foreground">В подгруппе нет учеников</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>ФИО</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead className="text-right">Действия</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {subgroupStudents.map((student) => (
                            <TableRow key={student.id}>
                              <TableCell className="font-medium">
                                {student.lastName} {student.firstName}
                              </TableCell>
                              <TableCell>{student.email}</TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRemoveStudent(student.id)}
                                >
                                  Удалить из подгруппы
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="details">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-lg font-medium mb-2">Информация о подгруппе</h3>
                        <dl className="grid grid-cols-2 gap-2">
                          <dt className="font-medium">Название:</dt>
                          <dd>{selectedSubgroup.name}</dd>
                          
                          <dt className="font-medium">Описание:</dt>
                          <dd>{selectedSubgroup.description || "—"}</dd>
                          
                          <dt className="font-medium">Класс:</dt>
                          <dd>{getClassName(selectedSubgroup.classId)}</dd>
                          
                          <dt className="font-medium">Школа:</dt>
                          <dd>{getSchoolName(selectedSubgroup.schoolId)}</dd>
                          
                          <dt className="font-medium">Создана:</dt>
                          <dd>
                            {new Date(selectedSubgroup.createdAt).toLocaleDateString('ru-RU')}
                          </dd>
                        </dl>
                      </div>
                      
                      <div className="flex flex-col space-y-4">
                        <Button
                          variant="outline"
                          onClick={() => handleEditSubgroup(selectedSubgroup)}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Редактировать подгруппу
                        </Button>
                        
                        <Button
                          variant="destructive"
                          onClick={() => handleDeleteSubgroup(selectedSubgroup)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Удалить подгруппу
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      
      {/* Create Subgroup Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Создать новую подгруппу</DialogTitle>
            <DialogDescription>
              Заполните информацию для создания новой подгруппы
            </DialogDescription>
          </DialogHeader>
          
          <Form {...subgroupForm}>
            <form onSubmit={subgroupForm.handleSubmit(onCreateSubgroup)} className="space-y-4">
              <FormField
                control={subgroupForm.control}
                name="schoolId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Школа</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isLoadingSchools}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите школу" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {schools.map((school) => (
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
              
              <FormField
                control={subgroupForm.control}
                name="classId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Класс</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isLoadingClasses || !subgroupForm.watch("schoolId")}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите класс" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {classes
                          .filter(cls => 
                            !subgroupForm.watch("schoolId") || 
                            cls.schoolId.toString() === subgroupForm.watch("schoolId")
                          )
                          .map((cls) => (
                            <SelectItem key={cls.id} value={cls.id.toString()}>
                              {cls.name}
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={subgroupForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Название подгруппы</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={subgroupForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Описание</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Введите описание подгруппы (необязательно)"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Отмена
                </Button>
                <Button type="submit" disabled={createSubgroupMutation.isPending}>
                  {createSubgroupMutation.isPending ? "Создание..." : "Создать подгруппу"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Edit Subgroup Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Редактировать подгруппу</DialogTitle>
            <DialogDescription>
              Измените информацию о подгруппе
            </DialogDescription>
          </DialogHeader>
          
          <Form {...subgroupForm}>
            <form onSubmit={subgroupForm.handleSubmit(onEditSubgroup)} className="space-y-4">
              <FormField
                control={subgroupForm.control}
                name="schoolId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Школа</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isLoadingSchools}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите школу" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {schools.map((school) => (
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
              
              <FormField
                control={subgroupForm.control}
                name="classId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Класс</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isLoadingClasses || !subgroupForm.watch("schoolId")}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите класс" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {classes
                          .filter(cls => 
                            !subgroupForm.watch("schoolId") || 
                            cls.schoolId.toString() === subgroupForm.watch("schoolId")
                          )
                          .map((cls) => (
                            <SelectItem key={cls.id} value={cls.id.toString()}>
                              {cls.name}
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={subgroupForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Название подгруппы</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={subgroupForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Описание</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Введите описание подгруппы (необязательно)"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Отмена
                </Button>
                <Button type="submit" disabled={updateSubgroupMutation.isPending}>
                  {updateSubgroupMutation.isPending ? "Сохранение..." : "Сохранить изменения"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Удаление подгруппы</DialogTitle>
            <DialogDescription>
              Вы уверены, что хотите удалить подгруппу "{selectedSubgroup?.name}"?
              Это действие нельзя отменить.
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => selectedSubgroup && deleteSubgroupMutation.mutate(selectedSubgroup.id)}
              disabled={deleteSubgroupMutation.isPending}
            >
              {deleteSubgroupMutation.isPending ? "Удаление..." : "Удалить подгруппу"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Student Assignment Dialog */}
      <Dialog open={isStudentAssignDialogOpen} onOpenChange={setIsStudentAssignDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Добавить ученика в подгруппу</DialogTitle>
            <DialogDescription>
              Выберите ученика из класса {getClassName(selectedSubgroup?.classId || 0)} для добавления в подгруппу "{selectedSubgroup?.name}"
            </DialogDescription>
          </DialogHeader>
          
          <Form {...studentAssignmentForm}>
            <form onSubmit={studentAssignmentForm.handleSubmit(onAssignStudent)} className="space-y-4">
              <FormField
                control={studentAssignmentForm.control}
                name="studentId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ученик</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isLoadingStudents}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите ученика" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {students
                          .filter(student => !isStudentInSubgroup(student.id))
                          .map((student) => (
                            <SelectItem key={student.id} value={student.id.toString()}>
                              {student.lastName} {student.firstName}
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Отображаются только ученики, которые еще не добавлены в эту подгруппу.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsStudentAssignDialogOpen(false)}
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  disabled={addStudentToSubgroupMutation.isPending || 
                            students.filter(student => !isStudentInSubgroup(student.id)).length === 0}
                >
                  {addStudentToSubgroupMutation.isPending ? "Добавление..." : "Добавить ученика"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}