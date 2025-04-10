import React, { useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useLocation } from "wouter";
import { useRoleCheck } from "@/hooks/use-role-check";
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
import { FiClock, FiMapPin, FiUser, FiCheck, FiPlus, FiList, FiEdit3 } from "react-icons/fi";
import { Schedule, User, Subject, Class, UserRoleEnum, Grade, Homework } from "@shared/schema";
import { HomeworkForm } from "./homework-form";

interface ScheduleItemProps {
  schedule: Schedule;
  subject: Subject | undefined;
  teacherName: string;
  room: string;
  grades?: Grade[];
  homework?: Homework | undefined;
  isCompleted?: boolean;
  onClick: (e?: React.MouseEvent, actionType?: string) => void;
}

export const ScheduleItem: React.FC<ScheduleItemProps> = ({
  schedule,
  subject,
  teacherName,
  room,
  grades = [],
  homework,
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
          <span className="ml-3 text-emerald-900">
            {schedule.subgroupId
              ? (schedule.subgroupName || "Подгруппа") // Показываем название подгруппы вместо предмета
              : subject?.name || "Предмет"}
          </span>
        </div>
        <div 
          className="cursor-pointer" 
          onClick={(e) => {
            e.stopPropagation(); // Предотвращаем всплытие события
            if (onClick && typeof onClick === 'function') {
              onClick(e, "homework");
            }
          }}
        >
          {isCompleted ? (
            <FiEdit3 className="text-orange-500 w-5 h-5" title="Редактировать домашнее задание" />
          ) : (
            <FiPlus className="text-orange-500 w-5 h-5" title="Добавить домашнее задание" />
          )}
        </div>
      </div>
      <div className="text-sm text-gray-600">
        <div className="flex items-center gap-1 mb-1">
          <FiMapPin className="text-gray-400" size={14} />
          <span>Кабинет: {room || "—"}</span>
        </div>
        <div className="flex items-center gap-1 mb-1">
          <FiUser className="text-gray-400" size={14} />
          <span>{teacherName}</span>
        </div>
        
        {/* Отображаем оценки, если они есть */}
        {grades.length > 0 && (
          <div className="mt-2">
            <div className="text-xs text-gray-500 mb-1">Оценки:</div>
            <div className="flex flex-wrap gap-1">
              {grades.map((grade) => (
                <div 
                  key={grade.id}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary text-primary-foreground"
                  title={grade.comment || ""}
                >
                  {grade.grade}
                </div>
              ))}
            </div>
          </div>
        )}
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
  grades?: Grade[];
  homework?: Homework[];
  currentUser?: User | null;
  isAdmin?: boolean;
  onAddSchedule?: (date: Date, scheduleToEdit?: Schedule) => void;
  onDeleteSchedule?: (scheduleId: number) => void;
}

export const ScheduleDayCard: React.FC<ScheduleDayCardProps> = ({
  date,
  dayName,
  schedules,
  subjects,
  teachers,
  classes,
  grades = [],
  homework = [],
  currentUser = null,
  isAdmin = false,
  onAddSchedule,
  onDeleteSchedule,
}) => {
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [, navigate] = useLocation();
  const { isTeacher } = useRoleCheck();
  
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

  // Функция для получения оценок по конкретному расписанию
  const getScheduleGrades = (schedule: Schedule) => {
    if (!grades?.length || !currentUser) return [];
    
    // Если текущий пользователь - учитель, оценки должны относиться к его предмету и классу 
    if (currentUser.role === UserRoleEnum.TEACHER) {
      return [];
    }
    
    // Если текущий пользователь - ученик, показываем только его оценки по конкретному уроку (scheduleId)
    if (currentUser.role === UserRoleEnum.STUDENT) {
      return grades.filter(grade => 
        grade.studentId === currentUser.id && 
        grade.scheduleId === schedule.id // Привязываем оценки к конкретному уроку по scheduleId
      );
    }
    
    return [];
  };
  
  // Функция для получения домашнего задания для конкретного расписания
  const getScheduleHomework = (schedule: Schedule) => {
    if (!homework?.length) return undefined;
    
    // Ищем задание именно для этого урока (scheduleId)
    return homework.find(hw => hw.scheduleId === schedule.id);
  };

  // Состояние для диалогового окна добавления домашнего задания
  const [isHomeworkDialogOpen, setIsHomeworkDialogOpen] = useState(false);

  const handleScheduleClick = (schedule: Schedule, actionType?: string) => {
    setSelectedSchedule(schedule);
    
    if (actionType === "homework" && isTeacher()) {
      setIsHomeworkDialogOpen(true);
    } else {
      setIsDetailsOpen(true);
    }
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
                  grades={getScheduleGrades(schedule)}
                  homework={getScheduleHomework(schedule)}
                  isCompleted={getScheduleHomework(schedule) !== undefined} // Урок считается выполненным, если есть домашнее задание
                  onClick={(e, actionType) => handleScheduleClick(schedule, actionType)}
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

      {/* Диалог для создания домашнего задания */}
      <Dialog open={isHomeworkDialogOpen} onOpenChange={setIsHomeworkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Добавить домашнее задание</DialogTitle>
            <DialogDescription>
              {selectedSchedule && (
                <>
                  Предмет: {getSubject(selectedSchedule.subjectId)?.name}, 
                  Класс: {getClassName(selectedSchedule.classId)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {selectedSchedule && currentUser && isTeacher() && (
            <HomeworkForm 
              schedule={selectedSchedule}
              existingHomework={getScheduleHomework(selectedSchedule)}
              onClose={() => setIsHomeworkDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

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
                {selectedSchedule.subgroupId && (
                  <div>
                    <h4 className="text-gray-500 mb-1">Подгруппа</h4>
                    <p className="font-medium text-emerald-700">{selectedSchedule.subgroupName || "Подгруппа"}</p>
                  </div>
                )}
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
                      ? format(new Date(
                          Date.UTC(
                            new Date(selectedSchedule.scheduleDate).getFullYear(),
                            new Date(selectedSchedule.scheduleDate).getMonth(),
                            new Date(selectedSchedule.scheduleDate).getDate()
                          )
                        ), "dd.MM.yyyy")
                      : format(date, "dd.MM.yyyy")
                    }
                  </p>
                </div>
                <div>
                  <h4 className="text-gray-500 mb-1">День недели</h4>
                  <p className="font-medium">{dayName}</p>
                </div>
              </div>
              
              {/* Отображение информации о домашнем задании */}
              {getScheduleHomework(selectedSchedule) && (
                <div className="mt-4 p-4 bg-orange-50 rounded-lg border border-orange-100">
                  <h3 className="text-lg font-medium text-orange-800 mb-2">Домашнее задание</h3>
                  <div className="space-y-2">
                    <p className="font-medium">{getScheduleHomework(selectedSchedule)?.title}</p>
                    <p className="text-sm text-gray-700">{getScheduleHomework(selectedSchedule)?.description}</p>
                    {getScheduleHomework(selectedSchedule)?.dueDate && (
                      <p className="text-xs text-gray-500 mt-2">
                        Срок сдачи: {format(new Date(getScheduleHomework(selectedSchedule)?.dueDate || ''), "dd.MM.yyyy")}
                      </p>
                    )}
                  </div>
                </div>
              )}
              
              <DialogFooter className="flex flex-wrap justify-between gap-2 sm:justify-between">
                {isAdmin && (
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
                )}
                
                {isTeacher() && (
                  <>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => {
                        // Если урок привязан к подгруппе, добавляем ID подгруппы в путь URL
                        const url = selectedSchedule.subgroupId 
                          ? `/class-grade-details/${selectedSchedule.classId}/${selectedSchedule.subjectId}/${selectedSchedule.subgroupId}` 
                          : `/class-grade-details/${selectedSchedule.classId}/${selectedSchedule.subjectId}`;
                        navigate(url);
                        setIsDetailsOpen(false);
                      }}
                    >
                      <FiList className="mr-2" />
                      Оценки класса
                    </Button>
                    
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => {
                        setIsDetailsOpen(false);
                        setIsHomeworkDialogOpen(true);
                      }}
                    >
                      {getScheduleHomework(selectedSchedule) ? (
                        <>
                          <FiEdit3 className="mr-2" />
                          Изменить задание
                        </>
                      ) : (
                        <>
                          <FiPlus className="mr-2" />
                          Добавить задание
                        </>
                      )}
                    </Button>
                  </>
                )}
                
                {isAdmin && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => {
                      setIsDetailsOpen(false);
                      if (onAddSchedule && selectedSchedule) {
                        onAddSchedule(date, selectedSchedule);
                      }
                    }}
                  >
                    <FiEdit3 className="mr-2" />
                    Редактировать
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};