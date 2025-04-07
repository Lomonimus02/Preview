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
  
  // Добавление класса
  const addClassMutation = useMutation({
    mutationFn: async (data: z.infer<typeof classFormSchema>) => {
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
        schoolId: user?.schoolId,
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
    // Убедимся, что у нас есть schoolId
    if (!values.schoolId && user?.schoolId) {
      values.schoolId = user.schoolId;
    }
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
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
