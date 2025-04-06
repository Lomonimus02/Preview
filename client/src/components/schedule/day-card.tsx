import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Schedule as ScheduleType, Subject, Class, User } from "@shared/schema";
import { Check, Plus } from "lucide-react";

interface DayCardProps {
  day: number;
  date?: Date;
  schedules: ScheduleType[];
  subjects: Subject[];
  classes: Class[];
  users: User[];
  isActive?: boolean;
  activeCardIndex?: number;
  cardIndex?: number;
}

export function DayCard({
  day,
  date,
  schedules,
  subjects,
  classes,
  users,
  isActive = false,
  activeCardIndex,
  cardIndex,
}: DayCardProps) {
  // Получаем название дня недели
  const dayName = useMemo(() => {
    const days = [
      "Понедельник", "Вторник", "Среда", "Четверг", 
      "Пятница", "Суббота", "Воскресенье"
    ];
    return days[day - 1];
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

  // Определяем цвет карточки
  const cardClass = isActive 
    ? "bg-primary text-primary-foreground border-primary" 
    : "bg-card";

  // Определяем анимацию карточки относительно активной карточки
  const getCardAnimation = () => {
    if (activeCardIndex === undefined || cardIndex === undefined) {
      return {
        scale: 1,
        opacity: 1,
        transition: { duration: 0.2, ease: "easeInOut" }
      };
    }

    const distance = cardIndex - activeCardIndex;
    return {
      scale: isActive ? 1 : 0.95 - Math.abs(distance) * 0.02,
      opacity: isActive ? 1 : 0.9 - Math.abs(distance) * 0.1,
      transition: { 
        duration: 0.25, 
        ease: "easeOut",
        opacity: { duration: 0.15 }
      }
    };
  };

  return (
    <motion.div
      className="h-full w-full"
      animate={getCardAnimation()}
    >
      <Card className={`h-full overflow-hidden transition-colors duration-300 ${cardClass}`}>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl">{dayName}</CardTitle>
            {formattedDate && (
              <Badge variant={isActive ? "outline" : "secondary"} className="font-normal">
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
                  className={`p-2 rounded-md transition-colors ${isActive ? 'bg-primary-foreground/10' : 'bg-muted'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-medium">
                      {schedule.startTime} - {schedule.endTime}
                    </div>
                    <div className="text-xs opacity-80">
                      Кабинет: {schedule.room || "—"}
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
                      <Badge variant={isActive ? "secondary" : "outline"} className="text-xs h-5">
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
  );
}