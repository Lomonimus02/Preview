import { motion } from "framer-motion";
import { Schedule } from "@shared/schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CalendarIcon, ClockIcon, HomeIcon, BookOpenIcon, UserIcon, XIcon } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface ScheduleItemDetailsProps {
  schedule: Schedule;
  className: string;
  subject: string;
  teacher: string;
  onClose: () => void;
}

export function ScheduleItemDetails({
  schedule,
  className,
  subject,
  teacher,
  onClose,
}: ScheduleItemDetailsProps) {
  const getDayName = (day: number) => {
    const days = [
      "Понедельник", "Вторник", "Среда", "Четверг", 
      "Пятница", "Суббота", "Воскресенье"
    ];
    return days[day - 1];
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <BookOpenIcon className="mr-2 h-5 w-5 text-primary" />
            <span>{subject}</span>
          </DialogTitle>
          <DialogDescription className="flex items-center">
            Урок для класса <Badge variant="outline" className="ml-2">{className}</Badge>
          </DialogDescription>
        </DialogHeader>
        
        <Separator />
        
        <div className="space-y-4 py-2">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center"
          >
            <div className="w-28 font-medium text-muted-foreground">День недели:</div>
            <div className="flex items-center">
              <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
              {getDayName(schedule.dayOfWeek)}
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-center"
          >
            <div className="w-28 font-medium text-muted-foreground">Предмет:</div>
            <div className="flex items-center">
              <BookOpenIcon className="mr-2 h-4 w-4 text-primary" />
              {subject}
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex items-center"
          >
            <div className="w-28 font-medium text-muted-foreground">Класс:</div>
            <div className="flex items-center">
              <Badge variant="outline">{className}</Badge>
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex items-center"
          >
            <div className="w-28 font-medium text-muted-foreground">Время:</div>
            <div className="flex items-center">
              <ClockIcon className="mr-2 h-4 w-4 text-primary" />
              {schedule.startTime} - {schedule.endTime}
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex items-center"
          >
            <div className="w-28 font-medium text-muted-foreground">Учитель:</div>
            <div className="flex items-center">
              <UserIcon className="mr-2 h-4 w-4 text-primary" />
              {teacher}
            </div>
          </motion.div>
          
          {schedule.room && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex items-center"
            >
              <div className="w-28 font-medium text-muted-foreground">Кабинет:</div>
              <div className="flex items-center">
                <HomeIcon className="mr-2 h-4 w-4 text-primary" />
                {schedule.room}
              </div>
            </motion.div>
          )}
          
          {schedule.scheduleDate && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="flex items-center"
            >
              <div className="w-28 font-medium text-muted-foreground">Дата:</div>
              <div className="flex items-center">
                <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                {format(new Date(schedule.scheduleDate), "dd MMMM yyyy", { locale: ru })}
              </div>
            </motion.div>
          )}
        </div>
        
        <DialogFooter>
          <Button onClick={onClose}>Закрыть</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}