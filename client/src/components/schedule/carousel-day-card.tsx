import React from "react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  CalendarIcon, 
  Clock, 
  MapPin, 
  User as UserIcon, 
  BookOpen,
  Plus 
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Schedule, Subject, Class, Grade, User, Homework, AssignmentTypeEnum } from "@shared/schema";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// Функция для получения цвета для типа задания
const getAssignmentTypeColor = (type?: string): string => {
  switch (type) {
    case AssignmentTypeEnum.CONTROL_WORK:
      return 'bg-red-100 text-red-800';
    case AssignmentTypeEnum.TEST_WORK:
      return 'bg-blue-100 text-blue-800';
    case AssignmentTypeEnum.CURRENT_WORK:
      return 'bg-green-100 text-green-800';
    case AssignmentTypeEnum.HOMEWORK:
      return 'bg-amber-100 text-amber-800';
    case AssignmentTypeEnum.CLASSWORK:
      return 'bg-emerald-100 text-emerald-800';
    case AssignmentTypeEnum.PROJECT_WORK:
      return 'bg-purple-100 text-purple-800';
    case AssignmentTypeEnum.CLASS_ASSIGNMENT:
      return 'bg-indigo-100 text-indigo-800';
    default:
      return 'bg-gray-100 text-gray-800';
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
  onAddSchedule: (date: Date) => void;
  onDeleteSchedule?: (scheduleId: number) => void;
}

export const CarouselDayCard: React.FC<ScheduleDayCardProps> = ({
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
  onDeleteSchedule
}) => {
  // Получаем отформатированную дату для отображения
  const formattedDate = format(date, "dd.MM.yyyy");
  
  // Определяем, является ли дата сегодняшней
  const isToday = new Date().toDateString() === date.toDateString();
  
  // Получаем название предмета
  const getSubjectName = (schedule: Schedule) => {
    // Если у объекта расписания уже есть поле с названием подгруппы, используем его
    if (schedule.subgroupId && (schedule as any).subgroupName) {
      return (schedule as any).subgroupName;
    }
    
    // В остальных случаях показываем название предмета
    const subject = subjects?.find(s => s.id === schedule.subjectId);
    return subject?.name || "Предмет";
  };

  // Получаем имя учителя
  const getTeacherName = (schedule: Schedule) => {
    // Если у расписания есть готовые данные учителя, используем их
    if ((schedule as any).teacherName) {
      return (schedule as any).teacherName;
    }
    
    const teacher = teachers?.find(t => t.id === schedule.teacherId);
    if (teacher) {
      return `${teacher.lastName || ''} ${teacher.firstName || ''} ${(teacher as any).middleName || ''}`.trim();
    }
    return "Преподаватель";
  };

  // Получаем класс из расписания
  const getClassInfo = (schedule: Schedule) => {
    return classes.find(c => c.id === schedule.classId);
  };

  // Функция для определения цвета статуса урока
  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'conducted':
        return 'bg-green-50 border-green-100';
      case 'not_conducted':
        return 'bg-orange-50 border-orange-100';
      default:
        return 'bg-gray-50 border-gray-100';
    }
  };
  
  return (
    <Card className={cn(
      "min-h-[300px] w-[280px] flex flex-col",
      isToday && "border-primary"
    )}>
      <CardHeader className="pb-2 pt-4 bg-muted">
        <CardTitle className="text-center text-base">
          <div className="font-medium">{dayName}</div>
          <div className="text-sm text-muted-foreground mt-1">{formattedDate}</div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 p-3 overflow-y-auto">
        {schedules.length === 0 ? (
          <div className="text-center text-muted-foreground flex flex-col items-center justify-center h-full">
            <CalendarIcon className="w-8 h-8 mb-2 opacity-50" />
            <p>Нет уроков</p>
            
            {isAdmin && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="mt-2" 
                onClick={() => onAddSchedule(date)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Добавить
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {schedules.map((schedule) => {
              const classInfo = getClassInfo(schedule);
              
              return (
                <Card 
                  key={schedule.id}
                  className={cn(
                    "overflow-hidden mb-3 cursor-pointer hover:shadow-md",
                    getStatusColor(schedule.status)
                  )}
                >
                  <CardContent className="p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex flex-col">
                        <div className="font-medium text-primary">
                          {schedule.startTime} - {schedule.endTime}
                        </div>
                        <div className="text-lg font-semibold">
                          {getSubjectName(schedule)}
                        </div>
                        {classInfo && (
                          <Badge variant="outline" className="mt-1 max-w-fit">
                            {classInfo.name}
                          </Badge>
                        )}
                      </div>
                      
                      {schedule.status === 'conducted' && (
                        <Badge variant="outline" className="ml-2 bg-green-100 text-green-800 hover:bg-green-200">
                          Проведен
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex flex-col gap-1.5 text-sm text-muted-foreground mt-2">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-4 w-4" />
                        <span>{schedule.room || "Кабинет не указан"}</span>
                      </div>
                      
                      <div className="flex items-center gap-1.5">
                        <UserIcon className="h-4 w-4" />
                        <span>{getTeacherName(schedule)}</span>
                      </div>
                    </div>
                    
                    {/* Отображаем задания, если они есть и урок проведен */}
                    {schedule.status === 'conducted' && schedule.assignments && schedule.assignments.length > 0 && (
                      <div className="mt-3 border-t pt-2 border-border">
                        <div className="flex items-center gap-1.5 mb-1.5 text-sm">
                          <BookOpen className="h-4 w-4" />
                          <span className="font-medium">Задания:</span>
                        </div>
                        
                        <div className="flex flex-wrap gap-1.5">
                          {schedule.assignments.map((assignment) => (
                            <Badge 
                              key={assignment.id}
                              variant="outline" 
                              className={cn("text-xs", getAssignmentTypeColor(assignment.assignmentType))}
                            >
                              {getAssignmentTypeName(assignment.assignmentType).substring(0, 4)} ({assignment.maxScore})
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            
            {isAdmin && (
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full mt-2" 
                onClick={() => onAddSchedule(date)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Добавить урок
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};