import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Schedule as ScheduleType, Subject, Class, User, UserRoleEnum } from "@shared/schema";
import { Book, Check, Clock, GraduationCap, MapPin, Plus, Trash2, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface DayCardProps {
  day: number;
  date?: Date;
  schedules: ScheduleType[];
  subjects: Subject[];
  classes: Class[];
  users: User[];
  onScheduleDeleted?: () => void; // Колбэк при удалении урока
  onLessonClick?: (schedule: ScheduleType) => void; // Колбэк при клике на урок
}

export function DayCard({
  day,
  date,
  schedules,
  subjects,
  classes,
  users,
  onScheduleDeleted,
  onLessonClick,
}: DayCardProps) {
  // Состояние для отслеживания наведения курсора
  const [isHovered, setIsHovered] = useState(false);
  
  // Состояние для диалога подтверждения удаления
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState<number | null>(null);
  
  // Проверка прав на удаление
  const { user } = useAuth();
  const roleCheck = useRoleCheck();
  const isAdmin = roleCheck.isAdmin();
  
  // Мутация для удаления урока
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: async (scheduleId: number) => {
      const res = await apiRequest("DELETE", `/api/schedules/${scheduleId}`);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Урок удален",
        description: "Урок был успешно удален из расписания",
      });
      
      // Обновляем кэш запросов расписания
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      
      // Вызываем колбэк, если он определен
      if (onScheduleDeleted) {
        onScheduleDeleted();
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка при удалении урока",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Получаем название дня недели
  const dayName = useMemo(() => {
    const days = [
      "Понедельник", "Вторник", "Среда", "Четверг", 
      "Пятница", "Суббота", "Воскресенье"
    ];
    // Проверяем что индекс дня действительно в диапазоне 1-7
    const validDay = day >= 1 && day <= 7 ? day : 1;
    return days[validDay - 1];
  }, [day]);

  // Форматируем дату
  const formattedDate = useMemo(() => {
    if (!date) return "";
    return format(date, "dd.MM", { locale: ru });
  }, [date]);

  // Сортируем расписание по времени начала
  const sortedSchedules = useMemo(() => {
    return [...schedules].sort((a, b) => {
      const timeA = a.startTime.split(':').map(Number);
      const timeB = b.startTime.split(':').map(Number);
      
      if (timeA[0] !== timeB[0]) return timeA[0] - timeB[0];
      return timeA[1] - timeB[1];
    });
  }, [schedules]);

  // Получение имени предмета
  const getSubjectName = (id: number) => {
    const subject = subjects.find(s => s.id === id);
    return subject ? subject.name : `Предмет ${id}`;
  };

  // Получение номера кабинета
  const getTeacherName = (id: number) => {
    const teacher = users.find(u => u.id === id);
    return teacher ? `${teacher.lastName} ${teacher.firstName.charAt(0)}.` : `Учитель ${id}`;
  };

  // Рассчитываем, сколько всего уроков
  const lessonsCount = sortedSchedules.length;

  // Обработчик удаления урока
  const handleDeleteSchedule = () => {
    if (scheduleToDelete) {
      deleteMutation.mutate(scheduleToDelete);
      setDeleteDialogOpen(false);
    }
  };

  return (
    <>
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить урок?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Урок будет удален из расписания.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSchedule}
              className="bg-destructive hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <motion.div
        className="h-full w-full"
        whileHover={{ 
          scale: 1.03,
          transition: { 
            type: "spring", 
            stiffness: 500, 
            damping: 17 
          } 
        }}
        onHoverStart={() => setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
      >
      <Card 
        className={`h-full overflow-hidden transition-all duration-200 ${
          isHovered ? "border-primary border-2" : "border"
        }`}
      >
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl">{dayName}</CardTitle>
            {formattedDate && (
              <Badge variant="secondary" className="font-normal">
                {formattedDate}
              </Badge>
            )}
          </div>
          <div className="text-sm opacity-80">{lessonsCount} уроков</div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            {sortedSchedules.length === 0 ? (
              <div className="text-center py-6 text-sm opacity-70">
                Нет запланированных уроков
              </div>
            ) : (
              sortedSchedules.map((schedule) => (
                <div 
                  key={schedule.id} 
                  className="p-2 rounded-md transition-colors bg-muted hover:bg-muted/70 cursor-pointer"
                  onClick={() => onLessonClick && onLessonClick(schedule)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-medium">
                      {schedule.startTime} - {schedule.endTime}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs opacity-80">
                        Кабинет: {schedule.room || "—"}
                      </div>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive hover:bg-red-100"
                          onClick={(e) => {
                            e.stopPropagation(); // Предотвращаем всплытие события клика
                            setScheduleToDelete(schedule.id);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="font-semibold">
                    {getSubjectName(schedule.subjectId)}
                  </div>
                  <div className="text-sm opacity-80 mt-1">
                    {getTeacherName(schedule.teacherId)}
                  </div>
                  <div className="flex items-center justify-end mt-1">
                    {/* Здесь можно добавить иконки статуса */}
                    {Math.random() > 0.5 ? (
                      <Badge variant="outline" className="text-xs h-5">
                        <Check className="h-3 w-3 mr-1" />
                        Выполнено
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs h-5">
                        <Plus className="h-3 w-3 mr-1" />
                        Домашнее задание
                      </Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
    </>
  );
}