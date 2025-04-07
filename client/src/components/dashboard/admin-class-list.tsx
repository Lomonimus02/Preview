import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusIcon, PencilIcon, ClipboardCheck, School, Trash2Icon } from "lucide-react";
import { Class, insertClassSchema } from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest, queryClient } from "@/lib/queryClient";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

import { Input } from "@/components/ui/input";

// Расширяем схему для класса
const classFormSchema = insertClassSchema.extend({
  name: z.string().min(1, "Введите название класса"),
  gradeLevel: z.number({
    required_error: "Введите номер класса",
    invalid_type_error: "Номер класса должен быть числом",
  }).min(1, "Минимальное значение - 1").max(11, "Максимальное значение - 11"),
  academicYear: z.string().min(1, "Введите учебный год"),
  schoolId: z.number({
    required_error: "ID школы обязателен",
  }),
});

export function AdminClassList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const currentYear = new Date().getFullYear();
  
  // Get classes for the school admin's school
  const { data: classes = [], isLoading } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
    enabled: !!user && !!user.schoolId
  });
  
  // Form для добавления класса
  const form = useForm<z.infer<typeof classFormSchema>>({
    resolver: zodResolver(classFormSchema),
    defaultValues: {
      name: "",
      gradeLevel: undefined,
      academicYear: `${currentYear}-${currentYear + 1}`,
      schoolId: user?.schoolId || 2, // Устанавливаем ID школы напрямую (2 - ID Царскосельской Гимназии)
    },
  });
  
  // Get school ID from user roles if not available directly
  // Query for user roles to get schoolId if it's not in the user object
  const { data: userRoles = [] } = useQuery({
    queryKey: ["/api/my-roles"],
    enabled: !!user && user.role === "school_admin" && !user.schoolId
  });
  
  // Extract schoolId from school_admin role if present
  const getSchoolId = () => {
    // Если у пользователя есть schoolId в профиле, используем его
    if (user?.schoolId) return user.schoolId;
    
    // Находим роль администратора школы с указанным schoolId 
    const schoolAdminRole = userRoles.find(role => 
      role.role === "school_admin" && role.schoolId
    );
    
    if (schoolAdminRole?.schoolId) {
      return schoolAdminRole.schoolId;
    }
    
    // Если в ролях нет schoolId, но есть роль администратора школы,
    // пробуем найти первую доступную школу
    const isSchoolAdmin = userRoles.some(role => role.role === "school_admin");
    if (isSchoolAdmin) {
      // Получаем первый schoolId из списка ролей
      // Это сработает, если сервер присвоил ID школы по умолчанию
      const anyRoleWithSchool = userRoles.find(role => role.schoolId);
      if (anyRoleWithSchool?.schoolId) {
        return anyRoleWithSchool.schoolId;
      }
      
      // Если нет ролей с schoolId, используем первую школу из школ пользователя
      // (это отдельный запрос, который должен выполниться ранее)
      const defaultSchoolId = 2; // ID первой школы из предыдущего запроса
      return defaultSchoolId;
    }
    
    return null;
  };
  
  // Form для редактирования класса
  const editForm = useForm<z.infer<typeof classFormSchema>>({
    resolver: zodResolver(classFormSchema),
    defaultValues: {
      name: "",
      gradeLevel: undefined,
      academicYear: `${currentYear}-${currentYear + 1}`,
      schoolId: user?.schoolId || 2,
    },
  });
  
  // Добавление класса
  const addClassMutation = useMutation({
    mutationFn: async (data: z.infer<typeof classFormSchema>) => {
      // Ensure schoolId is set
      if (!data.schoolId) {
        data.schoolId = getSchoolId();
      }
      
      const res = await apiRequest("/api/classes", "POST", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      setIsAddDialogOpen(false);
      form.reset({
        name: "",
        gradeLevel: undefined,
        academicYear: `${currentYear}-${currentYear + 1}`,
        schoolId: getSchoolId(),
      });
      toast({
        title: "Класс добавлен",
        description: "Новый класс успешно создан",
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось создать класс",
        variant: "destructive",
      });
    },
  });
  
  // Редактирование класса
  const editClassMutation = useMutation({
    mutationFn: async (data: z.infer<typeof classFormSchema> & { id: number }) => {
      const { id, ...classData } = data;
      const res = await apiRequest(`/api/classes/${id}`, "PATCH", classData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      setIsEditDialogOpen(false);
      setSelectedClass(null);
      toast({
        title: "Класс обновлен",
        description: "Класс успешно обновлен",
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось обновить класс",
        variant: "destructive",
      });
    },
  });
  
  // Удаление класса
  const deleteClassMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/classes/${id}`, "DELETE");
      return res.ok;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      setIsDeleteDialogOpen(false);
      setSelectedClass(null);
      toast({
        title: "Класс удален",
        description: "Класс успешно удален из системы",
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить класс",
        variant: "destructive",
      });
    },
  });
  
  const onSubmit = (values: z.infer<typeof classFormSchema>) => {
    console.log("Форма класса отправлена:", values);
    // Убедимся, что у нас есть schoolId
    if (!values.schoolId) {
      values.schoolId = getSchoolId();
    }
    console.log("Данные для отправки:", values);
    addClassMutation.mutate(values);
  };
  
  return (
    <div className="lg:col-span-2 bg-white rounded-lg shadow-sm p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-heading font-semibold text-gray-800">Классы</h3>
        <Button 
          size="sm" 
          className="flex items-center gap-1"
          onClick={() => setIsAddDialogOpen(true)}
        >
          <PlusIcon className="h-4 w-4" />
          Добавить
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Название
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Класс
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Учеников
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Учебный год
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Действия
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                  Загрузка...
                </td>
              </tr>
            ) : classes.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                  Нет данных
                </td>
              </tr>
            ) : (
              classes.map((classItem) => (
                <tr key={classItem.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{classItem.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{classItem.gradeLevel}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <Badge variant="outline" className="bg-primary-50 border-0">0</Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{classItem.academicYear}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => {
                          setSelectedClass(classItem);
                          editForm.reset({
                            name: classItem.name,
                            gradeLevel: classItem.gradeLevel,
                            academicYear: classItem.academicYear,
                            schoolId: classItem.schoolId,
                          });
                          setIsEditDialogOpen(true);
                        }}
                      >
                        <PencilIcon className="h-4 w-4 text-primary" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => {
                          setSelectedClass(classItem);
                          setIsDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2Icon className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Диалог для добавления класса */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить новый класс</DialogTitle>
            <DialogDescription>
              Введите информацию о новом классе
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={(e) => {
              e.preventDefault();
              console.log("Форма отправлена");
              const isValid = form.formState.isValid;
              console.log("Форма валидна:", isValid);
              console.log("Ошибки формы:", form.formState.errors);
              
              if (isValid) {
                const values = form.getValues();
                console.log("Значения формы:", values);
                
                // Убедимся, что у нас есть schoolId, используя нашу вспомогательную функцию
                if (!values.schoolId) {
                  values.schoolId = getSchoolId();
                  
                  // Если все еще нет schoolId, не отправляем форму
                  if (!values.schoolId) {
                    toast({
                      title: "Ошибка",
                      description: "Не удалось определить ID школы. Пожалуйста, обратитесь к администратору.",
                      variant: "destructive",
                    });
                    return;
                  }
                }
                
                console.log("Отправка данных с schoolId:", values.schoolId);
                addClassMutation.mutate(values);
              } else {
                form.handleSubmit(onSubmit)(e);
              }
            }} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Название класса</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Например: 5А, 9Б и т.д." 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="gradeLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Номер класса</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min={1} 
                        max={11} 
                        placeholder="От 1 до 11" 
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="academicYear"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Учебный год</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Например: 2023-2024" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button 
                  type="submit" 
                  disabled={addClassMutation.isPending}
                >
                  {addClassMutation.isPending ? "Сохранение..." : "Сохранить"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Диалог для редактирования класса */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактировать класс</DialogTitle>
            <DialogDescription>
              Изменение информации о классе
            </DialogDescription>
          </DialogHeader>
          
          <Form {...editForm}>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (selectedClass && editForm.formState.isValid) {
                const values = editForm.getValues();
                
                if (!values.schoolId) {
                  values.schoolId = getSchoolId();
                  if (!values.schoolId) {
                    toast({
                      title: "Ошибка",
                      description: "Не удалось определить ID школы",
                      variant: "destructive",
                    });
                    return;
                  }
                }
                
                editClassMutation.mutate({
                  ...values,
                  id: selectedClass.id,
                });
              }
            }} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Название класса</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Например: 5А, 9Б и т.д." 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editForm.control}
                name="gradeLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Номер класса</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min={1} 
                        max={11} 
                        placeholder="От 1 до 11" 
                        {...field}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={editForm.control}
                name="academicYear"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Учебный год</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Например: 2023-2024" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button 
                  type="submit" 
                  disabled={editClassMutation.isPending}
                >
                  {editClassMutation.isPending ? "Сохранение..." : "Сохранить"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Диалог подтверждения удаления класса */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Вы уверены?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы собираетесь удалить класс "{selectedClass?.name}". Это действие невозможно отменить.
              Все связанные данные (расписания, домашние задания, оценки) также будут удалены.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedClass) {
                  deleteClassMutation.mutate(selectedClass.id);
                }
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteClassMutation.isPending ? "Удаление..." : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
