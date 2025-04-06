import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Schedule, Class, Subject, User } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";

interface AdminScheduleFormProps {
  isOpen: boolean;
  onClose: () => void;
  classes: Class[];
  subjects: Subject[];
  teachers: User[];
  selectedSchedule: Schedule | null;
  mode: "add" | "edit";
}

// Form schema
const formSchema = z.object({
  classId: z.coerce.number().positive("Класс должен быть выбран"),
  subjectId: z.coerce.number().positive("Предмет должен быть выбран"),
  teacherId: z.coerce.number().positive("Учитель должен быть выбран"),
  dayOfWeek: z.coerce.number().min(1).max(7),
  scheduleDate: z.date().nullable(),
  startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Формат времени должен быть HH:MM"),
  endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, "Формат времени должен быть HH:MM"),
  room: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

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
  
  // Initialize form
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      classId: 0,
      subjectId: 0,
      teacherId: 0,
      dayOfWeek: 1,
      scheduleDate: null,
      startTime: "08:00",
      endTime: "08:45",
      room: "",
      notes: "",
    },
  });
  
  // Populate form when editing
  useEffect(() => {
    if (selectedSchedule && mode === "edit") {
      const scheduleDate = selectedSchedule.scheduleDate
        ? new Date(selectedSchedule.scheduleDate)
        : null;
      
      form.reset({
        classId: selectedSchedule.classId,
        subjectId: selectedSchedule.subjectId,
        teacherId: selectedSchedule.teacherId,
        dayOfWeek: selectedSchedule.dayOfWeek,
        scheduleDate: scheduleDate,
        startTime: selectedSchedule.startTime,
        endTime: selectedSchedule.endTime,
        room: selectedSchedule.room || "",
        notes: selectedSchedule.notes || "",
      });
    } else {
      form.reset({
        classId: 0,
        subjectId: 0,
        teacherId: 0,
        dayOfWeek: 1,
        scheduleDate: null,
        startTime: "08:00",
        endTime: "08:45",
        room: "",
        notes: "",
      });
    }
  }, [selectedSchedule, mode, form]);
  
  // Create schedule mutation
  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await apiRequest("POST", "/api/schedules", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Расписание добавлено",
        description: "Урок был успешно добавлен в расписание",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      onClose();
    },
    onError: (error) => {
      console.error("Error creating schedule:", error);
      toast({
        title: "Ошибка",
        description: "Произошла ошибка при добавлении урока. Пожалуйста, попробуйте еще раз.",
        variant: "destructive",
      });
    },
  });
  
  // Update schedule mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: number; formData: FormData }) => {
      const res = await apiRequest("PUT", `/api/schedules/${data.id}`, data.formData);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Расписание обновлено",
        description: "Урок был успешно обновлен в расписании",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      onClose();
    },
    onError: (error) => {
      console.error("Error updating schedule:", error);
      toast({
        title: "Ошибка",
        description: "Произошла ошибка при обновлении урока. Пожалуйста, попробуйте еще раз.",
        variant: "destructive",
      });
    },
  });
  
  // Handle form submission
  const onSubmit = (data: FormData) => {
    if (mode === "edit" && selectedSchedule) {
      updateMutation.mutate({ id: selectedSchedule.id, formData: data });
    } else {
      createMutation.mutate(data);
    }
  };
  
  // Day of week options
  const daysOfWeek = [
    { value: 1, label: "Понедельник" },
    { value: 2, label: "Вторник" },
    { value: 3, label: "Среда" },
    { value: 4, label: "Четверг" },
    { value: 5, label: "Пятница" },
    { value: 6, label: "Суббота" },
    { value: 7, label: "Воскресенье" },
  ];
  
  // Handle dialog close
  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "add" ? "Добавить урок" : "Редактировать урок"}
          </DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "Заполните форму для добавления нового урока в расписание"
              : "Измените данные урока в расписании"}
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Class selection */}
              <FormField
                control={form.control}
                name="classId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Класс</FormLabel>
                    <Select
                      value={String(field.value)}
                      onValueChange={(value) => field.onChange(parseInt(value))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите класс" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {classes.map((cls) => (
                          <SelectItem key={cls.id} value={String(cls.id)}>
                            {cls.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Subject selection */}
              <FormField
                control={form.control}
                name="subjectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Предмет</FormLabel>
                    <Select
                      value={String(field.value)}
                      onValueChange={(value) => field.onChange(parseInt(value))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите предмет" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {subjects.map((subject) => (
                          <SelectItem key={subject.id} value={String(subject.id)}>
                            {subject.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Teacher selection */}
              <FormField
                control={form.control}
                name="teacherId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Учитель</FormLabel>
                    <Select
                      value={String(field.value)}
                      onValueChange={(value) => field.onChange(parseInt(value))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите учителя" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {teachers.map((teacher) => (
                          <SelectItem key={teacher.id} value={String(teacher.id)}>
                            {teacher.lastName} {teacher.firstName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Day of week selection */}
              <FormField
                control={form.control}
                name="dayOfWeek"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>День недели</FormLabel>
                    <Select
                      value={String(field.value)}
                      onValueChange={(value) => field.onChange(parseInt(value))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите день" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {daysOfWeek.map((day) => (
                          <SelectItem key={day.value} value={String(day.value)}>
                            {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Specific date selection */}
              <FormField
                control={form.control}
                name="scheduleDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Дата (необязательно)</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "pl-3 text-left font-normal",
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
                          selected={field.value || undefined}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date < new Date("1900-01-01")
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>
                      Выберите дату для создания разового занятия
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Room input */}
              <FormField
                control={form.control}
                name="room"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Кабинет (необязательно)</FormLabel>
                    <FormControl>
                      <Input placeholder="Например: 305" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Time inputs */}
              <div className="grid grid-cols-2 gap-2">
                <FormField
                  control={form.control}
                  name="startTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Время начала</FormLabel>
                      <FormControl>
                        <Input
                          type="time"
                          {...field}
                          onBlur={(e) => {
                            // Ensure proper format
                            if (e.target.value) {
                              field.onChange(e.target.value);
                            }
                          }}
                        />
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
                        <Input
                          type="time"
                          {...field}
                          onBlur={(e) => {
                            // Ensure proper format
                            if (e.target.value) {
                              field.onChange(e.target.value);
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
            
            {/* Notes textarea */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Заметки (необязательно)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Дополнительная информация о занятии..."
                      {...field}
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
                onClick={handleClose}
              >
                Отменить
              </Button>
              <Button 
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <span>Сохранение...</span>
                ) : mode === "add" ? (
                  "Добавить"
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