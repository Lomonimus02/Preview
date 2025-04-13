import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useLocation } from "wouter";
import { useRoleCheck } from "@/hooks/use-role-check";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
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
  FiAlertCircle,
  FiSettings
} from "react-icons/fi";
import { Schedule, User, Subject, Class, UserRoleEnum, Grade, Homework, AssignmentTypeEnum, Assignment, TimeSlot, ClassTimeSlot } from "@shared/schema";
import { HomeworkForm } from "./homework-form";
import { AssignmentForm } from "../assignments/assignment-form";

// Функция-хелпер для проверки роли учителя или администратора школы
const isTeacherOrAdmin = (user?: User | null): boolean => {
  if (!user) return false;
  return user.role === UserRoleEnum.TEACHER || 
         user.role === UserRoleEnum.SCHOOL_ADMIN ||
         user.role === UserRoleEnum.CLASS_TEACHER;
};

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
  currentUser?: User | null; // Добавляем текущего пользователя для проверки прав
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
    // Проверяем, есть ли уже готовое название подгруппы в объекте расписания
    if ((schedule as any).subgroupName) {
      return (schedule as any).subgroupName;
    }
    
    // Если нет готового имени, ищем в массиве подгрупп
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
          {/* Кнопка для создания задания (Отображается для учителей, независимо от статуса урока) */}
          <div 
            className="cursor-pointer" 
            onClick={(e) => {
              e.stopPropagation(); // Предотвращаем всплытие события
              if (onClick && typeof onClick === 'function') {
                onClick(e, "assignment");
              }
            }}
          >
            <FiList className="text-blue-500 w-5 h-5" title={schedule.status === 'conducted' ? "Создать задание" : "Запланировать задание"} />
          </div>
          
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
        
        {/* Отображаем задания, если они есть */}
        {schedule.assignments && schedule.assignments.length > 0 && (
          <div className="mt-2">
            <div className="text-xs text-gray-500 mb-1">
              {/* Группируем задания по типу (запланированные и текущие) */}
              {schedule.assignments.some(a => a.plannedFor) && schedule.assignments.some(a => !a.plannedFor) ? 
                'Задания и запланированные работы:' : 
                schedule.assignments.every(a => a.plannedFor) ? 
                  'Запланированные работы:' : 'Задания:'}
            </div>
            <div className="flex flex-wrap gap-1">
              {schedule.assignments.map((assignment) => (
                <div 
                  key={assignment.id}
                  className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium text-gray-800 
                    ${getAssignmentTypeColor(assignment.assignmentType)} 
                    ${assignment.plannedFor ? 'border border-dashed border-gray-400' : ''} 
                    hover:bg-opacity-80 cursor-pointer`}
                  title={`${assignment.plannedFor ? 'ЗАПЛАНИРОВАНО: ' : ''}${getAssignmentTypeName(assignment.assignmentType)}: ${assignment.maxScore} баллов. 
                    ${assignment.plannedFor ? 
                      'Это задание запланировано на будущий урок. Оценки за него не будут учитываться в средней оценке до проведения урока.' : 
                      'Нажмите для редактирования.'}`}
                  onClick={(e) => {
                    e.stopPropagation(); // Предотвращаем всплытие события
                    // Вызов обработчика для редактирования задания
                    if (onClick && typeof onClick === 'function') {
                      onClick(e, "edit-assignment", assignment);
                    }
                  }}
                >
                  <span className="font-medium">
                    {getAssignmentTypeName(assignment.assignmentType).substring(0, 3)}
                  </span>
                  <span className="mx-1 font-bold">{assignment.maxScore}б.</span>
                  {assignment.plannedFor && (
                    <span className="ml-1 text-gray-600 flex items-center" title="Запланировано">
                      📅
                    </span>
                  )}
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
  canView?: boolean; // Флаг для разрешения просмотра (для директора)
  subgroups?: any[]; // Добавляем список подгрупп
  showClassNames?: boolean; // Флаг для отображения имен классов (для общего расписания)
  onAddSchedule?: (date: Date, scheduleToEdit?: Schedule) => void;
  onEditSchedule?: (schedule: Schedule) => void; // Новый обработчик для редактирования расписания
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
  canView = false,
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
  const { isTeacher, isSchoolAdmin } = useRoleCheck();
  const { toast } = useToast();
  
  // Получение временных слотов для отображения в сетке расписания
  const { data: timeSlots = [] } = useQuery<TimeSlot[]>({
    queryKey: ['/api/time-slots/defaults'],
  });
  
  // Получение настроенных слотов для класса (если это страница расписания класса)
  const [classId, setClassId] = useState<number | undefined>(undefined);
  
  // Определяем classId из первого расписания
  useEffect(() => {
    if (schedules.length > 0 && !showClassNames) {
      setClassId(schedules[0].classId);
    }
  }, [schedules, showClassNames]);
  
  // Получаем настроенные временные слоты для класса, если classId известен
  const { data: classTimeSlots = [] } = useQuery<ClassTimeSlot[]>({
    queryKey: [`/api/class/${classId}/time-slots`],
    enabled: !!classId && !showClassNames, // Только если это расписание для конкретного класса
  });
  
  const formattedDate = format(date, "dd.MM", { locale: ru });
  const sortedSchedules = [...schedules].sort((a, b) => {
    const timeA = a.startTime.split(":").map(Number);
    const timeB = b.startTime.split(":").map(Number);
    
    if (timeA[0] !== timeB[0]) return timeA[0] - timeB[0];
    return timeA[1] - timeB[1];
  });

  // Функция для получения эффективного слота (настроенный для класса или по умолчанию)
  const getEffectiveSlot = (slotNumber: number): TimeSlot | ClassTimeSlot | undefined => {
    const classSlot = classTimeSlots.find(slot => slot.slotNumber === slotNumber);
    if (classSlot) return classSlot;
    
    return timeSlots.find(slot => slot.slotNumber === slotNumber);
  };
  
  // Получаем максимальный номер слота, который нужно отобразить
  const getMaxDisplayedSlot = (): number => {
    if (sortedSchedules.length === 0) return -1;
    
    // Находим максимальный слот из имеющихся уроков
    let maxSlot = 0;
    sortedSchedules.forEach(schedule => {
      // Определяем номер слота по времени начала
      const startHour = parseInt(schedule.startTime.split(':')[0]);
      const startMin = parseInt(schedule.startTime.split(':')[1]);
      
      // Ищем соответствующий слот
      timeSlots.forEach(slot => {
        const slotStartHour = parseInt(slot.startTime.split(':')[0]);
        const slotStartMin = parseInt(slot.startTime.split(':')[1]);
        
        if (startHour === slotStartHour && startMin === slotStartMin) {
          maxSlot = Math.max(maxSlot, slot.slotNumber);
        } else if (Math.abs(startHour - slotStartHour) <= 1) {
          // Приближённое сопоставление (в пределах часа)
          if (Math.abs((startHour * 60 + startMin) - (slotStartHour * 60 + slotStartMin)) <= 20) {
            maxSlot = Math.max(maxSlot, slot.slotNumber);
          }
        }
      });
    });
    
    return maxSlot;
  };

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
    
    // Если текущий пользователь - ученик, показываем только его оценки для конкретного урока
    if (currentUser.role === UserRoleEnum.STUDENT) {
      // Фильтруем оценки по следующим критериям:
      return grades.filter(grade => {
        // Оценка должна принадлежать этому студенту
        const isStudentGrade = grade.studentId === currentUser.id;
        
        // Оценка привязана к конкретному уроку расписания
        const isScheduleMatch = grade.scheduleId === schedule.id;
        
        // Показываем ТОЛЬКО оценки, которые привязаны к конкретному уроку
        return isStudentGrade && isScheduleMatch;
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
    } else if (actionType === "assignment" && isTeacher()) {
      // Разрешаем создавать задания независимо от статуса
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
              {isAdmin && !canView && (
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
            <div className="grid grid-cols-1 gap-2">
              {/* Администратор школы может настроить временные слоты */}
              {isSchoolAdmin() && classId && !showClassNames && (
                <div className="mb-2 flex justify-end">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-xs inline-flex items-center gap-1 text-gray-500 hover:text-gray-700"
                    onClick={() => {
                      if (classId) {
                        navigate(`/schedule-class/${classId}/time-slots`);
                      }
                    }}
                  >
                    <FiSettings size={14} />
                    <span>Настроить слоты</span>
                  </Button>
                </div>
              )}
              
              {/* Сетка с временными слотами */}
              {timeSlots.length > 0 && (
                <>
                  {/* Определяем максимальный номер слота для отображения */}
                  {(() => {
                    // Получаем мин. и макс. номера слотов
                    const maxSlot = getMaxDisplayedSlot();
                    const minSlot = 0; // Слот "0 урок" должен отображаться всегда
                    
                    if (maxSlot < 0) return null; // Если нет уроков, не отображаем сетку
                    
                    // Создаем массив слотов для отображения
                    const slotsToShow = [];
                    for (let slotNum = minSlot; slotNum <= maxSlot; slotNum++) {
                      const slot = getEffectiveSlot(slotNum);
                      if (!slot) continue; // Пропускаем, если нет настроек для слота
                      
                      // Ищем расписание для этого слота
                      const slotSchedules = sortedSchedules.filter(schedule => {
                        // Проверяем совпадение времени начала
                        const scheduleStartTime = schedule.startTime.split(':').map(Number);
                        const slotStartTime = slot.startTime.split(':').map(Number);
                        
                        const scheduleTimeMinutes = scheduleStartTime[0] * 60 + scheduleStartTime[1];
                        const slotTimeMinutes = slotStartTime[0] * 60 + slotStartTime[1];
                        
                        // Допускаем небольшую погрешность (до 10 минут)
                        return Math.abs(scheduleTimeMinutes - slotTimeMinutes) <= 10;
                      });
                      
                      slotsToShow.push({
                        slot,
                        schedules: slotSchedules,
                        isEmpty: slotSchedules.length === 0
                      });
                    }
                    
                    return (
                      <div className="space-y-2">
                        {slotsToShow.map(({ slot, schedules, isEmpty }) => (
                          <div key={slot.slotNumber} className="time-slot rounded-lg border border-gray-100">
                            {/* Заголовок слота */}
                            <div className="p-2 bg-gray-50 rounded-t-lg border-b border-gray-100 flex items-center justify-between">
                              <div className="font-medium text-gray-800">{slot.slotNumber} урок</div>
                              <div className="text-sm text-gray-600">{slot.startTime} - {slot.endTime}</div>
                            </div>
                            
                            {/* Содержимое слота */}
                            <div className="p-2">
                              {isEmpty ? (
                                <div className="h-12 flex items-center justify-center text-sm text-gray-400">
                                  Нет уроков в это время
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {schedules.map(schedule => (
                                    <ScheduleItem
                                      key={schedule.id}
                                      schedule={schedule}
                                      subject={getSubject(schedule.subjectId)}
                                      teacherName={getTeacherName(schedule.teacherId)}
                                      room={schedule.room || ""}
                                      grades={getScheduleGrades(schedule)}
                                      homework={getScheduleHomework(schedule)}
                                      isCompleted={getScheduleHomework(schedule) !== undefined}
                                      subgroups={subgroups}
                                      className={getClassName(schedule.classId)}
                                      showClass={showClassNames}
                                      onClick={(e, actionType, assignment) => handleScheduleClick(schedule, actionType, assignment)}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </>
              )}
              
              {isAdmin && !canView && (
                <div className="flex justify-center mt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => onAddSchedule && onAddSchedule(date)}
                  >
                    <FiPlus className="mr-2" /> Добавить урок
                  </Button>
                </div>
              )}
            </div>
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
                {isAdmin && !canView && (
                  <>
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