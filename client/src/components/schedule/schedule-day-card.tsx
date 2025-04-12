import React, { useState } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useLocation } from "wouter";
import { useRoleCheck } from "@/hooks/use-role-check";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
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
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  FiClock, 
  FiMapPin, 
  FiUser, 
  FiCheck, 
  FiPlus, 
  FiList, 
  FiEdit3, 
  FiTrash2, 
  FiAlertCircle 
} from "react-icons/fi";
import { Schedule, User, Subject, Class, UserRoleEnum, Grade, Homework, AssignmentTypeEnum, Assignment } from "@shared/schema";
import { HomeworkForm } from "./homework-form";
import { AssignmentForm } from "../assignments/assignment-form";

// Функция для получения цвета для типа задания
const getAssignmentTypeColor = (type?: string): string => {
  switch (type) {
    case AssignmentTypeEnum.CONTROL_WORK:
      return 'bg-red-100';
    case AssignmentTypeEnum.TEST_WORK:
      return 'bg-blue-100';
    case AssignmentTypeEnum.CURRENT_WORK:
      return 'bg-green-100';
    case AssignmentTypeEnum.HOMEWORK:
      return 'bg-amber-100';
    case AssignmentTypeEnum.CLASSWORK:
      return 'bg-emerald-100';
    case AssignmentTypeEnum.PROJECT_WORK:
      return 'bg-purple-100';
    case AssignmentTypeEnum.CLASS_ASSIGNMENT:
      return 'bg-indigo-100';
    default:
      return 'bg-gray-100';
  }
};

// Функция для получения названия типа задания
const getAssignmentTypeName = (type?: string): string => {
  switch (type) {
    case AssignmentTypeEnum.CONTROL_WORK:
      return 'Контрольная';
    case AssignmentTypeEnum.TEST_WORK:
      return 'Тестирование';
    case AssignmentTypeEnum.CURRENT_WORK:
      return 'Текущая';
    case AssignmentTypeEnum.HOMEWORK:
      return 'Домашняя';
    case AssignmentTypeEnum.CLASSWORK:
      return 'Классная';
    case AssignmentTypeEnum.PROJECT_WORK:
      return 'Проект';
    case AssignmentTypeEnum.CLASS_ASSIGNMENT:
      return 'Задание';
    default:
      return 'Задание';
  }
};

interface ScheduleItemProps {
  schedule: Schedule;
  subject: Subject | undefined;
  teacherName: string;
  room: string;
  grades?: Grade[];
  homework?: Homework | undefined;
  isCompleted?: boolean;
  subgroups?: any[]; // Добавляем список подгрупп
  className?: string; // Добавляем имя класса для отображения в общем расписании
  showClass?: boolean; // Флаг для отображения класса (только в общем расписании)
  onClick: (e?: React.MouseEvent, actionType?: string, assignment?: Assignment) => void;
}

export const ScheduleItem: React.FC<ScheduleItemProps> = ({
  schedule,
  subject,
  teacherName,
  room,
  grades = [],
  homework,
  isCompleted = false,
  subgroups = [],
  className,
  showClass = false,
  onClick,
}) => {
  // Функция для получения названия подгруппы
  const getSubgroupName = () => {
    if (schedule.subgroupId) {
      const subgroup = subgroups.find(sg => sg.id === schedule.subgroupId);
      if (subgroup) {
        // Отображаем только название подгруппы, без предмета
        return subgroup.name;
      }
    }
    return "Подгруппа";
  };

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
              ? getSubgroupName() // Используем функцию для получения полного названия подгруппы
              : subject?.name || "Предмет"}
          </span>
          {/* Отображаем класс для общего расписания */}
          {showClass && className && (
            <span className="ml-2 text-sm text-gray-600">
              [{className}]
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Кнопка для создания задания (Отображается только для учетелей и если урок проведен) */}
          {schedule.status === 'conducted' && (
            <div 
              className="cursor-pointer" 
              onClick={(e) => {
                e.stopPropagation(); // Предотвращаем всплытие события
                if (onClick && typeof onClick === 'function') {
                  onClick(e, "assignment");
                }
              }}
            >
              <FiList className="text-blue-500 w-5 h-5" title="Создать задание" />
            </div>
          )}
          
          {/* Кнопка для создания домашнего задания */}
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
        
        {/* Отображаем задания, если они есть и урок проведен */}
        {schedule.status === 'conducted' && schedule.assignments && schedule.assignments.length > 0 && (
          <div className="mt-2">
            <div className="text-xs text-gray-500 mb-1">Задания:</div>
            <div className="flex flex-wrap gap-1">
              {schedule.assignments.map((assignment) => (
                <div 
                  key={assignment.id}
                  className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium text-gray-800 ${getAssignmentTypeColor(assignment.assignmentType)} hover:bg-opacity-80 cursor-pointer`}
                  title={`${getAssignmentTypeName(assignment.assignmentType)}: ${assignment.maxScore} баллов. Нажмите для редактирования.`}
                  onClick={(e) => {
                    e.stopPropagation(); // Предотвращаем всплытие события
                    // Вызов обработчика для редактирования задания
                    if (onClick && typeof onClick === 'function') {
                      onClick(e, "edit-assignment", assignment);
                    }
                  }}
                >
                  {getAssignmentTypeName(assignment.assignmentType).substring(0, 2)} ({assignment.maxScore})
                </div>
              ))}
            </div>
          </div>
        )}
        
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
  subgroups?: any[]; // Добавляем список подгрупп
  showClassNames?: boolean; // Флаг для отображения имен классов (для общего расписания)
  onAddSchedule?: (date: Date, scheduleToEdit?: Schedule) => void;
  onEditSchedule?: (schedule: Schedule) => void; // Новый обработчик для редактирования расписания
  onDeleteSchedule?: (schedule: Schedule) => void;
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
  subgroups = [],
  showClassNames = false,
  onAddSchedule,
  onEditSchedule,
  onDeleteSchedule,
}) => {
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isHomeworkDialogOpen, setIsHomeworkDialogOpen] = useState(false);
  const [isAssignmentDialogOpen, setIsAssignmentDialogOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | undefined>(undefined);
  const [, navigate] = useLocation();
  const { isTeacher } = useRoleCheck();
  const { toast } = useToast();
  
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
    
    // Если текущий пользователь - ученик, показываем его оценки
    if (currentUser.role === UserRoleEnum.STUDENT) {
      // Фильтруем оценки по следующим критериям:
      return grades.filter(grade => {
        // Оценка должна принадлежать этому студенту
        const isStudentGrade = grade.studentId === currentUser.id;
        
        // Оценка должна быть связана с предметом этого урока
        const isSubjectMatch = grade.subjectId === schedule.subjectId;
        
        // Оценка привязана к конкретному уроку
        const isScheduleMatch = grade.scheduleId === schedule.id;
        
        // Проверяем принадлежность к подгруппе, если урок для подгруппы
        if (schedule.subgroupId) {
          // Урок для подгруппы:
          // 1. Показываем оценки, привязанные конкретно к этому уроку расписания
          // 2. ИЛИ показываем оценки по этому предмету, выставленные для этой подгруппы
          return isStudentGrade && (
            isScheduleMatch || 
            (isSubjectMatch && grade.subgroupId === schedule.subgroupId)
          );
        } else {
          // Обычный урок (не для подгруппы):
          // 1. Показываем оценки, привязанные конкретно к этому уроку расписания
          // 2. ИЛИ показываем оценки по этому предмету без привязки к подгруппам
          return isStudentGrade && (
            isScheduleMatch || 
            (isSubjectMatch && !grade.subgroupId)
          );
        }
      });
    }
    
    return [];
  };
  
  // Функция для получения домашнего задания для конкретного расписания
  const getScheduleHomework = (schedule: Schedule) => {
    if (!homework?.length) return undefined;
    
    // Ищем задание именно для этого урока (scheduleId)
    return homework.find(hw => hw.scheduleId === schedule.id);
  };

  // Состояния для диалоговых окон уже определены выше

  const handleScheduleClick = (schedule: Schedule, actionType?: string, assignment?: Assignment) => {
    setSelectedSchedule(schedule);
    
    if (actionType === "homework" && isTeacher()) {
      setIsHomeworkDialogOpen(true);
    } else if (actionType === "assignment" && isTeacher() && schedule.status === "conducted") {
      setSelectedAssignment(undefined); // Создание нового задания
      setIsAssignmentDialogOpen(true);
    } else if (actionType === "edit-assignment" && assignment && isTeacher()) {
      setSelectedAssignment(assignment); // Редактирование существующего задания
      setIsAssignmentDialogOpen(true);
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
                  subgroups={subgroups}
                  className={getClassName(schedule.classId)}
                  showClass={showClassNames}
                  onClick={(e, actionType, assignment) => handleScheduleClick(schedule, actionType, assignment)}
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

      {/* Диалог для создания/редактирования задания */}
      <Dialog open={isAssignmentDialogOpen} onOpenChange={setIsAssignmentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedAssignment ? "Редактировать задание" : "Создать задание"}</DialogTitle>
            <DialogDescription>
              {selectedSchedule && (
                <>
                  Предмет: {getSubject(selectedSchedule.subjectId)?.name}, 
                  Класс: {getClassName(selectedSchedule.classId)}
                  {selectedSchedule.subgroupId && (
                    <>, Подгруппа: {selectedSchedule.subgroupName || "Подгруппа"}</>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {selectedSchedule && isTeacher() && (
            <AssignmentForm 
              schedule={selectedSchedule}
              existingAssignment={selectedAssignment}
              onClose={() => setIsAssignmentDialogOpen(false)}
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
                  <>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => {
                        if (onDeleteSchedule) {
                          onDeleteSchedule(selectedSchedule);
                          setIsDetailsOpen(false);
                        }
                      }}
                    >
                      <FiTrash2 className="mr-2" />
                      Удалить
                    </Button>

                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        if (onEditSchedule) {
                          onEditSchedule(selectedSchedule);
                          setIsDetailsOpen(false);
                        }
                      }}
                    >
                      <FiEdit3 className="mr-2" />
                      Изменить
                    </Button>
                  </>
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
                          Изменить домашнее задание
                        </>
                      ) : (
                        <>
                          <FiPlus className="mr-2" />
                          Добавить домашнее задание
                        </>
                      )}
                    </Button>
                    
                    {/* Кнопка для добавления/просмотра заданий (для накопительной системы оценок) */}
                    {selectedSchedule.status === "conducted" && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => {
                          setIsDetailsOpen(false);
                          setSelectedAssignment(undefined);
                          setIsAssignmentDialogOpen(true);
                        }}
                      >
                        {selectedSchedule.assignments && selectedSchedule.assignments.length > 0 ? (
                          <>
                            <FiEdit3 className="mr-2" />
                            Редактировать задания
                          </>
                        ) : (
                          <>
                            <FiPlus className="mr-2" />
                            Добавить задание
                          </>
                        )}
                      </Button>
                    )}
                  </>
                )}
                
                {/* Кнопка редактирования уже добавлена выше */}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Диалог с формой для заданий (накопительная система оценок) */}
      <Dialog open={isAssignmentDialogOpen} onOpenChange={setIsAssignmentDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {selectedAssignment ? "Редактирование задания" : "Создание задания"}
            </DialogTitle>
            <DialogDescription>
              {selectedAssignment 
                ? "Отредактируйте данные задания" 
                : "Добавьте новое задание для урока"}
            </DialogDescription>
          </DialogHeader>
          
          {selectedSchedule && (
            <AssignmentForm
              schedule={selectedSchedule}
              existingAssignment={selectedAssignment}
              onClose={() => setIsAssignmentDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};