import React, { useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
} from "@/components/ui/card";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FiClock, FiMapPin, FiUser, FiCheck, FiPlus } from "react-icons/fi";
import { Schedule, User, Subject, Class } from "@shared/schema";

interface ScheduleItemProps {
  schedule: Schedule;
  subject: Subject | undefined;
  teacherName: string;
  room: string;
  isCompleted?: boolean;
  onClick: () => void;
}

export const ScheduleItem: React.FC<ScheduleItemProps> = ({
  schedule,
  subject,
  teacherName,
  room,
  isCompleted = false,
  onClick,
}) => {
  return (
    <div 
      className={`
        mb-2 p-3 rounded-lg cursor-pointer transition-all duration-200
        ${isCompleted 
          ? 'bg-green-50 border border-green-100' 
          : 'bg-emerald-50 border border-emerald-100 hover:border-emerald-200'
        }
      `}
      onClick={onClick}
    >
      <div className="flex justify-between mb-1">
        <div className="text-emerald-700 font-medium">
          {schedule.startTime} - {schedule.endTime}
          <span className="ml-3 text-emerald-900">{subject?.name || "Предмет"}</span>
        </div>
        <div>
          {isCompleted ? (
            <FiCheck className="text-green-500 w-5 h-5" />
          ) : (
            <FiPlus className="text-orange-500 w-5 h-5" />
          )}
        </div>
      </div>
      <div className="text-sm text-gray-600">
        <div className="flex items-center gap-1 mb-1">
          <FiMapPin className="text-gray-400" size={14} />
          <span>Кабинет: {room || "—"}</span>
        </div>
        <div className="flex items-center gap-1">
          <FiUser className="text-gray-400" size={14} />
          <span>{teacherName}</span>
        </div>
      </div>
    </div>
  );
};

interface ScheduleDayCardProps {
  date: Date;
  dayName: string;
  schedules: Schedule[];
  subjects: Subject[];
  teachers: User[];
  classes: Class[];
  isAdmin?: boolean;
  onAddSchedule?: (date: Date) => void;
  onDeleteSchedule?: (scheduleId: number) => void;
}

export const ScheduleDayCard: React.FC<ScheduleDayCardProps> = ({
  date,
  dayName,
  schedules,
  subjects,
  teachers,
  classes,
  isAdmin = false,
  onAddSchedule,
  onDeleteSchedule,
}) => {
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const formattedDate = format(date, "dd.MM", { locale: ru });
  const sortedSchedules = [...schedules].sort((a, b) => {
    const timeA = a.startTime.split(":").map(Number);
    const timeB = b.startTime.split(":").map(Number);
    
    if (timeA[0] !== timeB[0]) return timeA[0] - timeB[0];
    return timeA[1] - timeB[1];
  });

  const getSubject = (subjectId: number) => {
    return subjects.find(s => s.id === subjectId);
  };

  const getTeacherName = (teacherId: number) => {
    const teacher = teachers.find(t => t.id === teacherId);
    return teacher ? `${teacher.lastName} ${teacher.firstName}` : "—";
  };

  const getClassName = (classId: number) => {
    const classObj = classes.find(c => c.id === classId);
    return classObj ? classObj.name : "—";
  };

  const handleScheduleClick = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setIsDetailsOpen(true);
  };

  return (
    <>
      <Card className="min-w-[320px] max-w-[380px] h-[600px] overflow-y-auto shadow-md">
        <CardHeader className="text-center py-4 bg-white sticky top-0 z-10">
          <CardTitle className="text-xl">{dayName}</CardTitle>
          <div className="text-gray-500">{formattedDate}</div>
          {schedules.length > 0 && (
            <div className="text-sm text-gray-500 mt-1">
              {schedules.length} {schedules.length === 1 ? 'урок' : 
                schedules.length < 5 ? 'урока' : 'уроков'}
            </div>
          )}
        </CardHeader>
        <CardContent className="px-4 pt-0 pb-4">
          {sortedSchedules.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <FiClock className="w-12 h-12 mb-4" />
              <p className="text-center">На этот день уроки не запланированы</p>
              {isAdmin && (
                <Button 
                  className="mt-4" 
                  variant="outline" 
                  onClick={() => onAddSchedule && onAddSchedule(date)}
                >
                  <FiPlus className="mr-2" /> Добавить урок
                </Button>
              )}
            </div>
          ) : (
            <>
              {sortedSchedules.map((schedule) => (
                <ScheduleItem
                  key={schedule.id}
                  schedule={schedule}
                  subject={getSubject(schedule.subjectId)}
                  teacherName={getTeacherName(schedule.teacherId)}
                  room={schedule.room || ""}
                  isCompleted={false} // Здесь можно добавить логику для определения завершенных уроков
                  onClick={() => handleScheduleClick(schedule)}
                />
              ))}
              {isAdmin && (
                <div className="flex justify-center mt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => onAddSchedule && onAddSchedule(date)}
                  >
                    <FiPlus className="mr-2" /> Добавить урок
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Диалог с детальной информацией об уроке */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Информация об уроке</DialogTitle>
            <DialogDescription>
              {selectedSchedule && getSubject(selectedSchedule.subjectId)?.name}
            </DialogDescription>
          </DialogHeader>
          
          {selectedSchedule && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-lg font-medium">
                <FiClock className="text-primary" />
                <span>{selectedSchedule.startTime} - {selectedSchedule.endTime}</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="text-gray-500 mb-1">Предмет</h4>
                  <p className="font-medium">{getSubject(selectedSchedule.subjectId)?.name}</p>
                </div>
                <div>
                  <h4 className="text-gray-500 mb-1">Класс</h4>
                  <p className="font-medium">{getClassName(selectedSchedule.classId)}</p>
                </div>
                <div>
                  <h4 className="text-gray-500 mb-1">Учитель</h4>
                  <p className="font-medium">{getTeacherName(selectedSchedule.teacherId)}</p>
                </div>
                <div>
                  <h4 className="text-gray-500 mb-1">Кабинет</h4>
                  <p className="font-medium">{selectedSchedule.room || "Не указан"}</p>
                </div>
                <div>
                  <h4 className="text-gray-500 mb-1">Дата</h4>
                  <p className="font-medium">
                    {selectedSchedule.scheduleDate 
                      ? format(new Date(selectedSchedule.scheduleDate), "dd.MM.yyyy")
                      : format(date, "dd.MM.yyyy")
                    }
                  </p>
                </div>
                <div>
                  <h4 className="text-gray-500 mb-1">День недели</h4>
                  <p className="font-medium">{dayName}</p>
                </div>
              </div>
              
              {isAdmin && (
                <DialogFooter className="flex justify-between gap-2 sm:justify-between">
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => {
                      if (onDeleteSchedule) {
                        onDeleteSchedule(selectedSchedule.id);
                        setIsDetailsOpen(false);
                      }
                    }}
                  >
                    Удалить
                  </Button>
                  <Button size="sm">
                    Редактировать
                  </Button>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};