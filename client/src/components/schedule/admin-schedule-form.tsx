import React, { useState } from "react";
import { Schedule, Class, Subject, User, UserRoleEnum } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { format, parse } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarIcon, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface AdminScheduleFormProps {
  isOpen: boolean;
  onClose: () => void;
  classes: Class[];
  subjects: Subject[];
  teachers: User[];
  selectedSchedule?: Schedule | null;
  mode: "add" | "edit";
}

// Create the validation schema for the schedule form
const scheduleFormSchema = z.object({
  classId: z.coerce.number().min(1, "Класс обязателен"),
  subjectId: z.coerce.number().min(1, "Предмет обязателен"),
  teacherId: z.coerce.number().min(1, "Учитель обязателен"),
  dayOfWeek: z.coerce.number().min(1).max(7, "День недели должен быть от 1 до 7"),
  startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Неверный формат времени (HH:MM)"),
  endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Неверный формат времени (HH:MM)"),
  room: z.string().optional(),
  notes: z.string().optional(),
  isSpecificDate: z.boolean().default(false),
  scheduleDate: z.date().nullable().optional(),
});

// Derive the type from the schema
type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;

export function AdminScheduleForm({
  isOpen,
  onClose,
  classes,
  subjects,
  teachers,
  selectedSchedule,
  mode,
}: AdminScheduleFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSpecificDate, setIsSpecificDate] = useState(selectedSchedule?.scheduleDate ? true : false);

  // Define form
  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: {
      classId: selectedSchedule?.classId || 0,
      subjectId: selectedSchedule?.subjectId || 0,
      teacherId: selectedSchedule?.teacherId || 0,
      dayOfWeek: selectedSchedule?.dayOfWeek || new Date().getDay() || 1,
      startTime: selectedSchedule?.startTime || "08:00",
      endTime: selectedSchedule?.endTime || "08:45",
      room: selectedSchedule?.room || "",
      notes: selectedSchedule?.notes || "",
      isSpecificDate: selectedSchedule?.scheduleDate ? true : false,
      scheduleDate: selectedSchedule?.scheduleDate ? new Date(selectedSchedule.scheduleDate) : null,
    },
  });

  // Create/update schedule mutation
  const mutation = useMutation({
    mutationFn: async (data: ScheduleFormValues) => {
      // Convert data for API
      const scheduleData = {
        ...data,
        scheduleDate: data.isSpecificDate && data.scheduleDate ? data.scheduleDate.toISOString() : null,
      };

      // If editing, update the schedule
      if (mode === "edit" && selectedSchedule) {
        const res = await apiRequest("PATCH", `/api/schedules/${selectedSchedule.id}`, scheduleData);
        return await res.json();
      } else {
        // Otherwise, create a new schedule
        const res = await apiRequest("POST", "/api/schedules", scheduleData);
        return await res.json();
      }
    },
    onSuccess: () => {
      // Show success toast
      toast({
        title: mode === "edit" ? "Расписание обновлено" : "Расписание добавлено",
        description: mode === "edit" ? "Расписание успешно обновлено" : "Расписание успешно добавлено",
      });

      // Invalidate schedules query to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });

      // Close the dialog
      onClose();
    },
    onError: (error) => {
      console.error("Error submitting schedule:", error);
      toast({
        title: "Ошибка",
        description: "Произошла ошибка при сохранении расписания. Пожалуйста, попробуйте еще раз.",
        variant: "destructive",
      });
    },
  });

  // Delete schedule mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSchedule) return;
      const res = await apiRequest("DELETE", `/api/schedules/${selectedSchedule.id}`);
      return await res.json();
    },
    onSuccess: () => {
      // Show success toast
      toast({
        title: "Расписание удалено",
        description: "Расписание успешно удалено",
      });

      // Invalidate schedules query to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });

      // Close the dialog
      onClose();
    },
    onError: (error) => {
      console.error("Error deleting schedule:", error);
      toast({
        title: "Ошибка",
        description: "Произошла ошибка при удалении расписания. Пожалуйста, попробуйте еще раз.",
        variant: "destructive",
      });
    },
  });

  // Handle form submission
  const onSubmit = (values: ScheduleFormValues) => {
    if (!values.isSpecificDate) {
      values.scheduleDate = null;
    }
    mutation.mutate(values);
  };

  // Handle delete
  const handleDelete = () => {
    if (window.confirm("Вы уверены, что хотите удалить это расписание?")) {
      deleteMutation.mutate();
    }
  };

  // Day of week options
  const dayOfWeekOptions = [
    { value: "1", label: "Понедельник" },
    { value: "2", label: "Вторник" },
    { value: "3", label: "Среда" },
    { value: "4", label: "Четверг" },
    { value: "5", label: "Пятница" },
    { value: "6", label: "Суббота" },
    { value: "7", label: "Воскресенье" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Редактировать расписание" : "Добавить расписание"}
          </DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Редактируйте детали расписания урока"
              : "Заполните детали нового урока в расписании"}
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

              <FormField
                control={form.control}
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
                control={form.control}
                name="teacherId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Учитель</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      defaultValue={field.value?.toString()}
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

              <div>
                <FormField
                  control={form.control}
                  name="isSpecificDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md p-1">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => {
                            field.onChange(checked);
                            setIsSpecificDate(!!checked);
                          }}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Конкретная дата</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                {isSpecificDate ? (
                  <FormField
                    control={form.control}
                    name="scheduleDate"
                    render={({ field }) => (
                      <FormItem className="mt-2">
                        <FormLabel>Дата</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "d MMMM yyyy", { locale: ru })
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
                              selected={field.value as Date}
                              onSelect={field.onChange}
                              initialFocus
                              locale={ru}
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <FormField
                    control={form.control}
                    name="dayOfWeek"
                    render={({ field }) => (
                      <FormItem className="mt-2">
                        <FormLabel>День недели</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(parseInt(value))}
                          defaultValue={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Выберите день недели" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {dayOfWeekOptions.map((day) => (
                              <SelectItem key={day.value} value={day.value}>
                                {day.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Время начала</FormLabel>
                    <FormControl>
                      <Input placeholder="09:00" {...field} />
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
                      <Input placeholder="09:45" {...field} />
                    </FormControl>
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
                      <Input placeholder="101" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Заметки</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Дополнительная информация о занятии"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:space-x-0">
              {mode === "edit" && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Удалить
                </Button>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={mutation.isPending}
                >
                  Отмена
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {mode === "edit" ? "Сохранить" : "Добавить"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}