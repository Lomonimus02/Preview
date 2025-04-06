import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Schedule, Class, Subject, User } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, ClockIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface AdminScheduleFormProps {
  isOpen: boolean;
  onClose: () => void;
  classes: Class[];
  subjects: Subject[];
  teachers: User[];
  selectedSchedule?: Schedule | null;
  mode?: 'add' | 'edit';
}

// Form schema
const scheduleFormSchema = z.object({
  classId: z.coerce.number().positive("Класс обязателен"),
  subjectId: z.coerce.number().positive("Предмет обязателен"),
  teacherId: z.coerce.number().positive("Учитель обязателен"),
  dayOfWeek: z.coerce.number().min(1).max(7, "День недели должен быть от 1 до 7"),
  scheduleDate: z.date().optional(),
  startTime: z.string().min(1, "Время начала обязательно"),
  endTime: z.string().min(1, "Время окончания обязательно"),
  room: z.string().optional(),
});

type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;

export function AdminScheduleForm({
  isOpen,
  onClose,
  classes,
  subjects,
  teachers,
  selectedSchedule,
  mode = 'add',
}: AdminScheduleFormProps) {
  const { toast } = useToast();
  const [date, setDate] = useState<Date | undefined>(
    selectedSchedule?.scheduleDate ? new Date(selectedSchedule.scheduleDate) : undefined
  );

  // Initialize form
  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: {
      classId: selectedSchedule?.classId || undefined,
      subjectId: selectedSchedule?.subjectId || undefined,
      teacherId: selectedSchedule?.teacherId || undefined,
      dayOfWeek: selectedSchedule?.dayOfWeek || new Date().getDay() || 7,
      scheduleDate: selectedSchedule?.scheduleDate ? new Date(selectedSchedule.scheduleDate) : undefined,
      startTime: selectedSchedule?.startTime || "",
      endTime: selectedSchedule?.endTime || "",
      room: selectedSchedule?.room || "",
    }
  });

  // Reset form when selectedSchedule changes
  useEffect(() => {
    if (selectedSchedule) {
      form.reset({
        classId: selectedSchedule.classId,
        subjectId: selectedSchedule.subjectId,
        teacherId: selectedSchedule.teacherId,
        dayOfWeek: selectedSchedule.dayOfWeek,
        scheduleDate: selectedSchedule.scheduleDate ? new Date(selectedSchedule.scheduleDate) : undefined,
        startTime: selectedSchedule.startTime,
        endTime: selectedSchedule.endTime,
        room: selectedSchedule.room || undefined,
      });
      
      if (selectedSchedule.scheduleDate) {
        setDate(new Date(selectedSchedule.scheduleDate));
      }
    } else {
      form.reset({
        classId: undefined,
        subjectId: undefined,
        teacherId: undefined,
        dayOfWeek: new Date().getDay() || 7,
        scheduleDate: undefined,
        startTime: "",
        endTime: "",
        room: "",
      });
      setDate(undefined);
    }
  }, [selectedSchedule, form]);

  // Sync day of week with date
  const syncDayOfWeekWithDate = (date: Date) => {
    const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();
    form.setValue("dayOfWeek", dayOfWeek);
    form.setValue("scheduleDate", date);
    setDate(date);
  };

  // Create schedule mutation
  const createMutation = useMutation({
    mutationFn: async (data: ScheduleFormValues) => {
      const response = await apiRequest("POST", "/api/schedules", data);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Ошибка при создании расписания");
      }
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Успешно",
        description: "Урок добавлен в расписание",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Update schedule mutation
  const updateMutation = useMutation({
    mutationFn: async (data: ScheduleFormValues & { id: number }) => {
      const response = await apiRequest("PATCH", `/api/schedules/${data.id}`, data);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Ошибка при обновлении расписания");
      }
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Успешно",
        description: "Расписание обновлено",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Handle form submission
  const onSubmit = (values: ScheduleFormValues) => {
    if (mode === 'edit' && selectedSchedule) {
      updateMutation.mutate({ ...values, id: selectedSchedule.id });
    } else {
      createMutation.mutate(values);
    }
  };

  // Get day name from day number
  const getDayName = (day: number) => {
    const days = [
      "Понедельник", "Вторник", "Среда", "Четверг", 
      "Пятница", "Суббота", "Воскресенье"
    ];
    return days[day - 1];
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'add' ? "Добавить урок" : "Редактировать урок"}
          </DialogTitle>
          <DialogDescription>
            Заполните форму для {mode === 'add' ? "добавления нового урока" : "редактирования урока"} в расписании.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="classId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Класс</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      value={field.value?.toString()}
                      disabled={isLoading}
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
                      value={field.value?.toString()}
                      disabled={isLoading}
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
                      value={field.value?.toString()}
                      disabled={isLoading}
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
                      <Input {...field} placeholder="Номер кабинета" disabled={isLoading} />
                    </FormControl>
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
                      value={field.value?.toString()}
                      disabled={isLoading}
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

              <FormField
                control={form.control}
                name="scheduleDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Дата (опционально)</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "pl-3 text-left font-normal",
                              !date && "text-muted-foreground"
                            )}
                            disabled={isLoading}
                          >
                            {date ? (
                              format(date, "PPP", { locale: ru })
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
                          selected={date}
                          onSelect={(date) => date && syncDayOfWeekWithDate(date)}
                          disabled={isLoading}
                          locale={ru}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>
                      При выборе даты будет автоматически установлен день недели
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Время начала</FormLabel>
                    <FormControl>
                      <div className="flex items-center">
                        <ClockIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          {...field} 
                          type="time" 
                          disabled={isLoading} 
                        />
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
                        <ClockIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          {...field} 
                          type="time" 
                          disabled={isLoading} 
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose}
                disabled={isLoading}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === 'add' ? "Добавить" : "Сохранить"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}