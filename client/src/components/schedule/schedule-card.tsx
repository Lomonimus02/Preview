import { useState } from "react";
import { motion } from "framer-motion";
import { Calendar, ClockIcon, UserIcon, HomeIcon, BookIcon } from "lucide-react";
import { Schedule, Class, Subject, User } from "@shared/schema";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { ScheduleItemDetails } from "./schedule-item-details";

interface ScheduleCardProps {
  date: Date;
  dayName: string;
  schedules: Schedule[];
  classes: Class[];
  subjects: Subject[];
  users: User[];
  isCurrentDate?: boolean;
}

export function ScheduleCard({
  date,
  dayName,
  schedules,
  classes,
  subjects,
  users,
  isCurrentDate = false,
}: ScheduleCardProps) {
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);

  // Sort schedules by start time
  const sortedSchedules = [...schedules].sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
  );

  // Helper functions to get names by IDs
  const getClassName = (classId: number) => {
    const cls = classes.find((c) => c.id === classId);
    return cls ? cls.name : "Неизвестный класс";
  };

  const getSubjectName = (subjectId: number) => {
    const subject = subjects.find((s) => s.id === subjectId);
    return subject ? subject.name : "Неизвестный предмет";
  };

  const getTeacherName = (teacherId: number) => {
    const teacher = users.find((u) => u.id === teacherId);
    return teacher
      ? `${teacher.lastName} ${teacher.firstName}`
      : "Неизвестный учитель";
  };

  // Format date for display
  const formattedDate = format(date, "d MMMM", { locale: ru });

  return (
    <>
      <Card
        className={cn(
          "w-[280px] h-[350px] flex flex-col transition-shadow hover:shadow-md",
          isCurrentDate && "border-primary shadow-sm"
        )}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex justify-between items-center">
            <span>{dayName}</span>
            {isCurrentDate && <Badge className="ml-2">Сегодня</Badge>}
          </CardTitle>
          <div className="text-sm text-muted-foreground flex items-center">
            <Calendar className="h-4 w-4 mr-1" />
            {formattedDate}
          </div>
        </CardHeader>

        <CardContent className="flex-grow overflow-y-auto scrollbar-thin py-1 space-y-3">
          {sortedSchedules.length > 0 ? (
            sortedSchedules.map((schedule, index) => (
              <motion.div
                key={schedule.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => setSelectedSchedule(schedule)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="font-medium text-sm">
                    {getSubjectName(schedule.subjectId)}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {getClassName(schedule.classId)}
                  </Badge>
                </div>

                <div className="flex items-center text-xs text-muted-foreground mb-1">
                  <ClockIcon className="h-3 w-3 mr-1" />
                  {schedule.startTime} - {schedule.endTime}
                </div>

                <div className="flex items-center text-xs text-muted-foreground mb-1">
                  <UserIcon className="h-3 w-3 mr-1" />
                  {getTeacherName(schedule.teacherId)}
                </div>

                {schedule.room && (
                  <div className="flex items-center text-xs text-muted-foreground">
                    <HomeIcon className="h-3 w-3 mr-1" />
                    Кабинет: {schedule.room}
                  </div>
                )}
              </motion.div>
            ))
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              Нет уроков на этот день
            </div>
          )}
        </CardContent>

        {sortedSchedules.length > 0 && (
          <CardFooter className="pt-2">
            <Button
              variant="secondary"
              size="sm"
              className="w-full text-xs"
              onClick={() => setSelectedSchedule(sortedSchedules[0])}
            >
              Показать детали
            </Button>
          </CardFooter>
        )}
      </Card>

      {selectedSchedule && (
        <ScheduleItemDetails
          schedule={selectedSchedule}
          className={getClassName(selectedSchedule.classId)}
          subject={getSubjectName(selectedSchedule.subjectId)}
          teacher={getTeacherName(selectedSchedule.teacherId)}
          onClose={() => setSelectedSchedule(null)}
        />
      )}
    </>
  );
}