import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusIcon, PencilIcon, ClipboardCheck, School } from "lucide-react";
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
      schoolId: user?.schoolId,
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
    if (user?.schoolId) return user.schoolId;
    
    // Find schoolId from user roles
    const schoolAdminRole = userRoles.find(role => 
      role.role === "school_admin" && role.schoolId
    );
    
    return schoolAdminRole?.schoolId || null;
  };
  
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
                    <a href="#" className="text-primary hover:text-primary-dark">
                      <PencilIcon className="h-4 w-4 inline" />
                    </a>
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
    </div>
  );
}
