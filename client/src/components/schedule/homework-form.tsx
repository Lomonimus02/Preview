import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query";
import { useToast } from "@/hooks/use-toast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Schedule, insertHomeworkSchema } from "@shared/schema";

interface HomeworkFormProps {
  schedule: Schedule;
  onClose: () => void;
}

// Компонент формы для создания домашнего задания
export const HomeworkForm: React.FC<HomeworkFormProps> = ({ schedule, onClose }) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Расширяем схему валидации с дополнительной проверкой
  const formSchema = insertHomeworkSchema.extend({
    title: insertHomeworkSchema.shape.title.min(3, {
      message: "Название должно содержать минимум 3 символа",
    }),
    description: insertHomeworkSchema.shape.description.min(10, {
      message: "Описание должно содержать минимум 10 символов",
    }),
  });
  
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      dueDate: format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"), // Срок через неделю
      classId: schedule.classId,
      subjectId: schedule.subjectId,
      teacherId: schedule.teacherId,
      scheduleId: schedule.id
    },
  });
  
  const submitHomework = async (data: any) => {
    try {
      // Создаем новое домашнее задание через API
      await apiRequest('/api/homework', 'POST', data);
      
      // Сбрасываем кэш для обновления данных на других страницах
      queryClient.invalidateQueries({ queryKey: ['/api/homework'] });
      
      // Закрываем диалог
      onClose();
      
      // Уведомляем пользователя
      toast({
        title: "Домашнее задание создано",
        description: "Задание успешно добавлено к расписанию",
      });
    } catch (error) {
      console.error('Ошибка при создании домашнего задания:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось создать домашнее задание",
        variant: "destructive",
      });
    }
  };
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submitHomework)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Название</FormLabel>
              <FormControl>
                <Input placeholder="Введите название задания" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Описание</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Введите подробное описание задания" 
                  className="min-h-[100px]"
                  {...field} 
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="dueDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Срок выполнения</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit">
            Создать задание
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
};