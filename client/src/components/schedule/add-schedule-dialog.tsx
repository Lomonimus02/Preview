import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2 } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, getDayOfWeek } from "@/lib/date-utils";
import { Schedule, Subject, User } from "@shared/schema";
import { cn } from "@/lib/utils";

interface AddScheduleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date;
  classId: number;
  schedule?: Schedule;
  subjects: Subject[];
  teachers: User[];
  onSuccess: () => void;
}

// Схема валидации для формы добавления расписания
const scheduleFormSchema = z.object({
  dayOfWeek: z.number().min(1).max(7),
  startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Время должно быть в формате ЧЧ:ММ"),
  endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Время должно быть в формате ЧЧ:ММ"),
  subjectId: z.number().positive("Выберите предмет"),
  teacherId: z.number().positive("Выберите учителя"),
  room: z.string().min(1, "Укажите кабинет"),
  subgroupId: z.number().optional(),
  status: z.string().default("not_conducted")
});

type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;

export function AddScheduleDialog({
  isOpen,
  onClose,
  selectedDate,
  classId,
  schedule,
  subjects,
  teachers,
  onSuccess
}: AddScheduleDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Определяем день недели для выбранной даты
  const dayOfWeek = getDayOfWeek(selectedDate);

  // Значения по умолчанию для формы
  const defaultValues: Partial<ScheduleFormValues> = {
    dayOfWeek: dayOfWeek,
    startTime: schedule?.startTime || "08:30",
    endTime: schedule?.endTime || "09:15",
    subjectId: schedule?.subjectId || 0,
    teacherId: schedule?.teacherId || 0,
    room: schedule?.room || "",
    status: schedule?.status || "not_conducted"
  };

  // Инициализируем форму с помощью React Hook Form
  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues
  });

  // Обработчик отправки формы
  const onSubmit = async (data: ScheduleFormValues) => {
    setIsSubmitting(true);

    try {
      // Определяем endpoint и HTTP метод в зависимости от того, редактируем ли существующее расписание или создаем новое
      const endpoint = schedule ? `/api/schedules/${schedule.id}` : "/api/schedules";
      const method = schedule ? "PATCH" : "POST";

      // Подготавливаем данные для отправки на сервер
      const scheduleData = {
        ...data,
        classId: classId
      };

      // Отправляем запрос
      const response = await apiRequest(endpoint, {
        method,
        data: scheduleData
      });

      // Инвалидируем кеш запросов расписания
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      
      // Показываем сообщение об успехе
      toast({
        title: schedule ? "Расписание обновлено" : "Расписание добавлено",
        description: `Урок ${response.subjectId} в ${response.startTime} успешно ${schedule ? "обновлен" : "добавлен"}.`,
        variant: "default"
      });

      // Вызываем колбэк успешного добавления
      onSuccess();
    } catch (error) {
      console.error("Ошибка при сохранении расписания:", error);
      
      // Показываем сообщение об ошибке
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить расписание. Пожалуйста, попробуйте снова.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Фильтруем учителей, оставляя только тех, у кого есть роль TEACHER
  const teachersList = teachers.filter(teacher => 
    teacher.roles?.some(role => role.role === "teacher" || role.role === "TEACHER")
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{schedule ? "Редактирование" : "Добавление"} урока</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {formatDate(selectedDate)} (День недели: {dayOfWeek})
              </span>
            </div>
            
            {/* Поле выбора предмета */}
            <FormField
              control={form.control}
              name="subjectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Предмет</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(parseInt(value))}
                    defaultValue={field.value !== 0 ? field.value?.toString() : undefined}
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
            
            {/* Поле выбора учителя */}
            <FormField
              control={form.control}
              name="teacherId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Учитель</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(parseInt(value))}
                    defaultValue={field.value !== 0 ? field.value?.toString() : undefined}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите учителя" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {teachersList.map((teacher) => (
                        <SelectItem key={teacher.id} value={teacher.id.toString()}>
                          {teacher.lastName} {teacher.firstName} {teacher.middleName || ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Время начала и окончания */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Время начала</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
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
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Кабинет */}
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
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose}
                disabled={isSubmitting}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  "Сохранить"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}