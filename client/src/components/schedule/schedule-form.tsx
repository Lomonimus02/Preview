import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage,
  FormDescription
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { CalendarIcon, ClockIcon } from "lucide-react";
import { ru } from "date-fns/locale";
import { Schedule, User, Subject, Class, Subgroup } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";

// Схема для добавления расписания
const scheduleFormSchema = z.object({
  classId: z.number({
    required_error: "Выберите класс",
  }),
  subjectId: z.number({
    required_error: "Выберите предмет",
  }),
  teacherId: z.number({
    required_error: "Выберите учителя",
  }),
  dayOfWeek: z.number({
    required_error: "Выберите день недели",
  }),
  scheduleDate: z.date({
    required_error: "Выберите дату урока",
  }),
  startTime: z.string().min(1, "Укажите время начала"),
  endTime: z.string().min(1, "Укажите время окончания"),
  room: z.string().optional(),
  subgroupId: z.number().optional(), // Опциональная привязка к подгруппе
});

type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;

interface ScheduleFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: ScheduleFormValues) => void;
  defaultDate?: Date;
  classes: Class[];
  subjects: Subject[];
  teachers: User[];
  isSubmitting: boolean;
  scheduleToEdit?: Schedule | null;
}

export const ScheduleForm: React.FC<ScheduleFormProps> = ({
  isOpen,
  onClose,
  onSubmit,
  defaultDate,
  classes,
  subjects,
  teachers,
  isSubmitting,
  scheduleToEdit
}) => {
  // State для хранения подгрупп выбранного класса
  const [subgroups, setSubgroups] = useState<Subgroup[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | undefined>(scheduleToEdit?.classId);
  
  // Запрос на получение подгрупп для выбранного класса
  const { data: subgroupsData = [] } = useQuery({
    queryKey: ['subgroups/class', selectedClassId],
    queryFn: async () => {
      if (!selectedClassId) return [];
      console.log(`Fetching subgroups with params: classId=${selectedClassId}`);
      const response = await fetch(`/api/subgroups/class/${selectedClassId}`);
      if (!response.ok) throw new Error('Не удалось загрузить подгруппы');
      const data = await response.json();
      console.log('Received subgroups:', data);
      return data;
    },
    enabled: !!selectedClassId, // Запрос выполняется только если выбран класс
  });
  
  // Обновляем список подгрупп при получении данных
  useEffect(() => {
    if (subgroupsData) {
      setSubgroups(subgroupsData);
    }
  }, [subgroupsData]);

  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: {
      classId: scheduleToEdit?.classId || undefined,
      subjectId: scheduleToEdit?.subjectId || undefined,
      teacherId: scheduleToEdit?.teacherId || undefined,
      dayOfWeek: scheduleToEdit ? scheduleToEdit.dayOfWeek : (defaultDate ? (defaultDate.getDay() === 0 ? 7 : defaultDate.getDay()) : undefined),
      scheduleDate: scheduleToEdit ? (scheduleToEdit.scheduleDate ? new Date(scheduleToEdit.scheduleDate) : defaultDate) : (defaultDate || undefined),
      startTime: scheduleToEdit?.startTime || "",
      endTime: scheduleToEdit?.endTime || "",
      room: scheduleToEdit?.room || "",
      subgroupId: scheduleToEdit?.subgroupId || undefined,
    },
  });

  // Функция для синхронизации дня недели с выбранной датой
  const syncDayOfWeekWithDate = (date: Date) => {
    // getDay() возвращает 0 для воскресенья, 1 для понедельника и т.д.
    // Нужно преобразовать к нашему формату, где 1 - понедельник, 7 - воскресенье
    let dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();
    form.setValue("dayOfWeek", dayOfWeek);
    return dayOfWeek;
  };

  // Получаем дни недели на русском
  const getDayName = (day: number) => {
    const days = [
      "Понедельник", "Вторник", "Среда", "Четверг", 
      "Пятница", "Суббота", "Воскресенье"
    ];
    return days[day - 1];
  };

  // Очистка формы при закрытии
  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{scheduleToEdit ? "Редактировать урок" : "Добавить урок в расписание"}</DialogTitle>
          <DialogDescription>
            {scheduleToEdit 
              ? "Обновите информацию об уроке" 
              : "Заполните информацию о новом уроке"
            }
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="scheduleDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Дата урока</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`}
                        >
                          {field.value ? (
                            format(field.value, "PPP", { locale: ru })
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
                        selected={field.value}
                        onSelect={(date) => {
                          if (date) {
                            field.onChange(date);
                            // Автоматически устанавливаем день недели по дате
                            syncDayOfWeekWithDate(date);
                          }
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
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
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Время начала</FormLabel>
                    <FormControl>
                      <div className="flex items-center">
                        <ClockIcon className="h-4 w-4 mr-2 text-gray-400" />
                        <Input type="time" {...field} />
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
                        <ClockIcon className="h-4 w-4 mr-2 text-gray-400" />
                        <Input type="time" {...field} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="classId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Класс</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      const valueNum = parseInt(value);
                      field.onChange(valueNum);
                      // Обновляем выбранный класс, чтобы загрузить его подгруппы
                      setSelectedClassId(valueNum);
                      // Сбрасываем выбранную подгруппу при смене класса
                      form.setValue("subgroupId", undefined);
                    }}
                    value={field.value?.toString()}
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
                  <FormLabel>Номер кабинета</FormLabel>
                  <FormControl>
                    <Input placeholder="Например: 101" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Выбор подгруппы (опционально) */}
            {selectedClassId && subgroups.length > 0 && (
              <FormField
                control={form.control}
                name="subgroupId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Подгруппа (необязательно)</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)}
                      value={field.value?.toString() || ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите подгруппу (если требуется)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">Весь класс (без подгруппы)</SelectItem>
                        {subgroups.map((subgroup) => (
                          <SelectItem key={subgroup.id} value={subgroup.id.toString()}>
                            {subgroup.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Оставьте пустым, если урок предназначен для всего класса
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Отмена
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Сохранение..." : "Сохранить"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};