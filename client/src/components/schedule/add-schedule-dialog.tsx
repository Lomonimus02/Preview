import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertScheduleSchema, Schedule, Subject, User } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, getDayOfWeek } from "@/lib/date-utils";

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

// Схема для валидации
const scheduleFormSchema = insertScheduleSchema.extend({
  subjectId: z.coerce.number().min(1, { message: "Выберите предмет" }),
  teacherId: z.coerce.number().min(1, { message: "Выберите учителя" }),
  startTime: z.string().min(1, { message: "Укажите время начала" }),
  endTime: z.string().min(1, { message: "Укажите время окончания" }),
  dayOfWeek: z.coerce.number(),
  subgroupId: z.coerce.number().optional(),
  roomNumber: z.string().optional()
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
  const isEditing = !!schedule;

  // Получаем день недели из выбранной даты
  const dayOfWeek = getDayOfWeek(selectedDate);

  // Настройка формы
  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: {
      classId: classId,
      subjectId: schedule?.subjectId || 0,
      teacherId: schedule?.teacherId || 0,
      startTime: schedule?.startTime || "08:00",
      endTime: schedule?.endTime || "08:45",
      dayOfWeek: schedule?.dayOfWeek || dayOfWeek,
      subgroupId: schedule?.subgroupId || 0,
      roomNumber: schedule?.roomNumber || ""
    }
  });

  // Обработчик отправки формы
  const onSubmit = async (data: ScheduleFormValues) => {
    setIsSubmitting(true);

    try {
      // Если это редактирование, отправляем PATCH запрос, иначе POST
      const url = isEditing 
        ? `/api/schedules/${schedule.id}` 
        : "/api/schedules";
      
      const method = isEditing ? "PATCH" : "POST";
      
      const response = await apiRequest(url, method, data);
      
      if (!response.ok) {
        throw new Error("Не удалось сохранить расписание");
      }
      
      onSuccess();
    } catch (error) {
      console.error("Error saving schedule:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Редактировать урок" : "Добавить новый урок"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="text-sm text-muted-foreground mb-2">
              Дата: {formatDate(selectedDate)}
            </div>

            {/* Предмет */}
            <FormField
              control={form.control}
              name="subjectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Предмет</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value.toString()}
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

            {/* Учитель */}
            <FormField
              control={form.control}
              name="teacherId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Учитель</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value.toString()}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите учителя" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {teachers
                        .filter(teacher => 
                          teacher.role === "teacher" || 
                          teacher.role === "class_teacher"
                        )
                        .map((teacher) => (
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

            {/* Номер кабинета */}
            <FormField
              control={form.control}
              name="roomNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Номер кабинета</FormLabel>
                  <FormControl>
                    <Input placeholder="Введите номер кабинета" {...field} />
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
                {isSubmitting 
                  ? "Сохранение..." 
                  : isEditing 
                    ? "Сохранить изменения" 
                    : "Добавить урок"
                }
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}