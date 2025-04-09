import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Trash2, Edit, Plus, UsersRound, School } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "@/hooks/use-toast";
import { Subgroup, Class, User } from "@shared/schema";
import { useRoleCheck } from "@/hooks/use-role-check";
import { UserRoleEnum } from "@shared/schema";

// Схемы для форм
const createSubgroupSchema = z.object({
  name: z.string().min(1, "Необходимо указать название подгруппы"),
  description: z.string().optional(),
});

const assignClassSchema = z.object({
  classId: z.string().min(1, "Выберите класс"),
});

const assignStudentSchema = z.object({
  studentId: z.string().min(1, "Выберите ученика"),
});

type CreateSubgroupValues = z.infer<typeof createSubgroupSchema>;
type AssignClassValues = z.infer<typeof assignClassSchema>;
type AssignStudentValues = z.infer<typeof assignStudentSchema>;

export default function SubgroupsManagement() {
  const { isAdmin, isLoading: roleCheckLoading } = useRoleCheck([UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedSubgroup, setSelectedSubgroup] = useState<Subgroup | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const queryClient = useQueryClient();

  // Загрузка данных
  const { data: subgroups = [], isLoading: subgroupsLoading } = useQuery({
    queryKey: ["/api/subgroups"],
    enabled: isAdmin,
  });

  const { data: classes = [], isLoading: classesLoading } = useQuery({
    queryKey: ["/api/classes"],
    enabled: isAdmin,
  });

  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["/api/users/students"],
    enabled: isAdmin,
  });

  // Загрузка классов для конкретной подгруппы
  const { data: subgroupClasses = [], isLoading: subgroupClassesLoading } = useQuery({
    queryKey: ["/api/subgroups", selectedSubgroup?.id, "classes"],
    enabled: !!selectedSubgroup,
  });

  // Загрузка студентов для конкретной подгруппы
  const { data: subgroupStudents = [], isLoading: subgroupStudentsLoading } = useQuery({
    queryKey: ["/api/subgroups", selectedSubgroup?.id, "students"],
    enabled: !!selectedSubgroup,
  });

  // Мутации для CRUD операций
  const createSubgroupMutation = useMutation({
    mutationFn: (data: CreateSubgroupValues) => {
      return apiRequest("/api/subgroups", {
        method: "POST",
        data
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subgroups"] });
      toast({
        title: "Подгруппа создана",
        description: "Новая подгруппа успешно создана",
      });
      setIsCreateDialogOpen(false);
      createForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error?.message || "Не удалось создать подгруппу",
        variant: "destructive",
      });
    }
  });

  const updateSubgroupMutation = useMutation({
    mutationFn: (data: CreateSubgroupValues & { id: number }) => {
      return apiRequest(`/api/subgroups/${data.id}`, {
        method: "PATCH",
        data: {
          name: data.name,
          description: data.description,
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subgroups"] });
      toast({
        title: "Подгруппа обновлена",
        description: "Информация о подгруппе успешно обновлена",
      });
      setIsEditDialogOpen(false);
      setSelectedSubgroup(null);
      editForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error?.message || "Не удалось обновить подгруппу",
        variant: "destructive",
      });
    }
  });

  const deleteSubgroupMutation = useMutation({
    mutationFn: (id: number) => {
      return apiRequest(`/api/subgroups/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subgroups"] });
      toast({
        title: "Подгруппа удалена",
        description: "Подгруппа успешно удалена",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error?.message || "Не удалось удалить подгруппу",
        variant: "destructive",
      });
    }
  });

  const assignClassMutation = useMutation({
    mutationFn: (data: { subgroupId: number, classId: number }) => {
      return apiRequest(`/api/subgroups/${data.subgroupId}/classes`, {
        method: "POST",
        data: {
          classId: data.classId,
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subgroups", selectedSubgroup?.id, "classes"] });
      toast({
        title: "Класс добавлен",
        description: "Класс успешно добавлен к подгруппе",
      });
      assignClassForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error?.message || "Не удалось добавить класс к подгруппе",
        variant: "destructive",
      });
    }
  });

  const removeClassMutation = useMutation({
    mutationFn: (data: { subgroupId: number, classId: number }) => {
      return apiRequest(`/api/subgroups/${data.subgroupId}/classes/${data.classId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subgroups", selectedSubgroup?.id, "classes"] });
      toast({
        title: "Класс удален",
        description: "Класс успешно удален из подгруппы",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error?.message || "Не удалось удалить класс из подгруппы",
        variant: "destructive",
      });
    }
  });

  const assignStudentMutation = useMutation({
    mutationFn: (data: { subgroupId: number, studentId: number }) => {
      return apiRequest(`/api/subgroups/${data.subgroupId}/students`, {
        method: "POST",
        data: {
          studentId: data.studentId,
        }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subgroups", selectedSubgroup?.id, "students"] });
      toast({
        title: "Ученик добавлен",
        description: "Ученик успешно добавлен в подгруппу",
      });
      assignStudentForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error?.message || "Не удалось добавить ученика в подгруппу",
        variant: "destructive",
      });
    }
  });

  const removeStudentMutation = useMutation({
    mutationFn: (data: { subgroupId: number, studentId: number }) => {
      return apiRequest(`/api/subgroups/${data.subgroupId}/students/${data.studentId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subgroups", selectedSubgroup?.id, "students"] });
      toast({
        title: "Ученик удален",
        description: "Ученик успешно удален из подгруппы",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error?.message || "Не удалось удалить ученика из подгруппы",
        variant: "destructive",
      });
    }
  });

  // Формы
  const createForm = useForm<CreateSubgroupValues>({
    resolver: zodResolver(createSubgroupSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const editForm = useForm<CreateSubgroupValues>({
    resolver: zodResolver(createSubgroupSchema),
    defaultValues: {
      name: selectedSubgroup?.name || "",
      description: selectedSubgroup?.description || "",
    },
  });

  const assignClassForm = useForm<AssignClassValues>({
    resolver: zodResolver(assignClassSchema),
    defaultValues: {
      classId: "",
    },
  });

  const assignStudentForm = useForm<AssignStudentValues>({
    resolver: zodResolver(assignStudentSchema),
    defaultValues: {
      studentId: "",
    },
  });

  // Обработчики
  const handleCreateSubmit = (data: CreateSubgroupValues) => {
    createSubgroupMutation.mutate(data);
  };

  const handleEditSubmit = (data: CreateSubgroupValues) => {
    if (!selectedSubgroup) return;
    updateSubgroupMutation.mutate({
      ...data,
      id: selectedSubgroup.id,
    });
  };

  const handleAssignClassSubmit = (data: AssignClassValues) => {
    if (!selectedSubgroup) return;
    assignClassMutation.mutate({
      subgroupId: selectedSubgroup.id,
      classId: parseInt(data.classId),
    });
  };

  const handleAssignStudentSubmit = (data: AssignStudentValues) => {
    if (!selectedSubgroup) return;
    assignStudentMutation.mutate({
      subgroupId: selectedSubgroup.id,
      studentId: parseInt(data.studentId),
    });
  };

  const handleDeleteSubgroup = (id: number) => {
    if (window.confirm("Вы уверены, что хотите удалить эту подгруппу?")) {
      deleteSubgroupMutation.mutate(id);
    }
  };

  const handleRemoveClass = (classId: number) => {
    if (!selectedSubgroup) return;
    if (window.confirm("Вы уверены, что хотите удалить этот класс из подгруппы?")) {
      removeClassMutation.mutate({
        subgroupId: selectedSubgroup.id,
        classId,
      });
    }
  };

  const handleRemoveStudent = (studentId: number) => {
    if (!selectedSubgroup) return;
    if (window.confirm("Вы уверены, что хотите удалить этого ученика из подгруппы?")) {
      removeStudentMutation.mutate({
        subgroupId: selectedSubgroup.id,
        studentId,
      });
    }
  };

  const handleEditSubgroup = (subgroup: Subgroup) => {
    setSelectedSubgroup(subgroup);
    editForm.reset({
      name: subgroup.name,
      description: subgroup.description || "",
    });
    setIsEditDialogOpen(true);
  };

  const openSubgroupDetails = (subgroup: Subgroup) => {
    setSelectedSubgroup(subgroup);
    setActiveTab("details");
  };

  // Если проверка ролей еще идет или данные загружаются, показываем загрузку
  if (roleCheckLoading || subgroupsLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Если пользователь не админ, показываем сообщение
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] space-y-4">
        <h1 className="text-2xl font-bold">Доступ запрещен</h1>
        <p className="text-muted-foreground">
          У вас нет прав для доступа к управлению подгруппами.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Управление подгруппами</h1>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Создать подгруппу
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="all">Все подгруппы</TabsTrigger>
          {selectedSubgroup && (
            <TabsTrigger value="details">
              Подгруппа: {selectedSubgroup.name}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="all" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Список подгрупп</CardTitle>
              <CardDescription>
                Управление подгруппами для более детального распределения учеников.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {subgroups.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-muted-foreground">
                    Пока нет созданных подгрупп. Создайте первую подгруппу.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Название</TableHead>
                      <TableHead>Описание</TableHead>
                      <TableHead>Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subgroups.map((subgroup: Subgroup) => (
                      <TableRow key={subgroup.id}>
                        <TableCell className="font-medium">
                          <Button
                            variant="link"
                            onClick={() => openSubgroupDetails(subgroup)}
                          >
                            {subgroup.name}
                          </Button>
                        </TableCell>
                        <TableCell>{subgroup.description || "—"}</TableCell>
                        <TableCell className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleEditSubgroup(subgroup)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleDeleteSubgroup(subgroup.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {selectedSubgroup && (
          <TabsContent value="details" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle>Подгруппа: {selectedSubgroup.name}</CardTitle>
                    <CardDescription>
                      {selectedSubgroup.description || "Без описания"}
                    </CardDescription>
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={() => handleEditSubgroup(selectedSubgroup)}
                  >
                    <Edit className="h-4 w-4 mr-2" /> Редактировать
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4 mt-4">
                    <div>
                      <h3 className="font-medium flex items-center">
                        <School className="h-4 w-4 mr-2" /> Привязанные классы
                      </h3>
                      {subgroupClassesLoading ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      ) : subgroupClasses.length > 0 ? (
                        <ul className="mt-2 space-y-2">
                          {subgroupClasses.map((cls: Class) => (
                            <li key={cls.id} className="flex justify-between items-center border p-2 rounded">
                              <span>{cls.name}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveClass(cls.id)}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-2">
                          Нет привязанных классов
                        </p>
                      )}
                      
                      <Form {...assignClassForm}>
                        <form onSubmit={assignClassForm.handleSubmit(handleAssignClassSubmit)} className="mt-4 space-y-4">
                          <FormField
                            control={assignClassForm.control}
                            name="classId"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Добавить класс</FormLabel>
                                <Select
                                  onValueChange={field.onChange}
                                  value={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Выберите класс" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {classes
                                      .filter((cls: Class) => 
                                        !subgroupClasses.some((sc: Class) => sc.id === cls.id)
                                      )
                                      .map((cls: Class) => (
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
                          <Button 
                            type="submit" 
                            size="sm"
                            disabled={assignClassMutation.isPending}
                          >
                            {assignClassMutation.isPending && (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            )}
                            Добавить класс
                          </Button>
                        </form>
                      </Form>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Ученики в подгруппе</CardTitle>
                  <CardDescription>
                    Управление составом учеников в подгруппе
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {subgroupStudentsLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : subgroupStudents.length > 0 ? (
                    <div className="space-y-2">
                      {subgroupStudents.map((student: User) => (
                        <div key={student.id} className="flex justify-between items-center border p-2 rounded">
                          <div className="flex items-center">
                            <UsersRound className="h-4 w-4 mr-2 text-muted-foreground" />
                            <span>
                              {student.lastName} {student.firstName}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveStudent(student.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mb-4">
                      В подгруппе пока нет учеников
                    </p>
                  )}

                  <Form {...assignStudentForm}>
                    <form onSubmit={assignStudentForm.handleSubmit(handleAssignStudentSubmit)} className="mt-4 space-y-4">
                      <FormField
                        control={assignStudentForm.control}
                        name="studentId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Добавить ученика</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Выберите ученика" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {students
                                  .filter((student: User) => 
                                    !subgroupStudents.some((ss: User) => ss.id === student.id) &&
                                    // Проверяем, что ученик принадлежит к одному из классов подгруппы
                                    subgroupClasses.some((cls: Class) => 
                                      student.classIds?.includes(cls.id)
                                    )
                                  )
                                  .map((student: User) => (
                                    <SelectItem key={student.id} value={student.id.toString()}>
                                      {student.lastName} {student.firstName}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              Показаны только ученики из привязанных классов
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button 
                        type="submit" 
                        size="sm"
                        disabled={assignStudentMutation.isPending}
                      >
                        {assignStudentMutation.isPending && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        Добавить ученика
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Диалог создания подгруппы */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать новую подгруппу</DialogTitle>
            <DialogDescription>
              Заполните информацию о новой подгруппе
            </DialogDescription>
          </DialogHeader>
          
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(handleCreateSubmit)} className="space-y-4">
              <FormField
                control={createForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Название подгруппы</FormLabel>
                    <FormControl>
                      <Input placeholder="Введите название" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={createForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Описание (необязательно)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Введите описание подгруппы"
                        className="resize-none" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit" disabled={createSubgroupMutation.isPending}>
                  {createSubgroupMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Создать
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Диалог редактирования подгруппы */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактировать подгруппу</DialogTitle>
            <DialogDescription>
              Измените информацию о подгруппе
            </DialogDescription>
          </DialogHeader>
          
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Название подгруппы</FormLabel>
                    <FormControl>
                      <Input placeholder="Введите название" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Описание (необязательно)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Введите описание подгруппы"
                        className="resize-none" 
                        {...field} 
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Отмена
                </Button>
                <Button type="submit" disabled={updateSubgroupMutation.isPending}>
                  {updateSubgroupMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Сохранить
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}