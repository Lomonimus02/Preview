import React, { useState } from "react";
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
  BookOpen
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Schedule, Subject, Class, AssignmentTypeEnum, Assignment } from "@shared/schema";
import type { User as UserType } from "@shared/schema";
import { cn } from "@/lib/utils";

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
  schedule: Schedule;
  isTeacher?: boolean;
  variant?: 'vertical' | 'horizontal';
  showClassInfo?: boolean;
  classes?: Class[];
  subjects?: Subject[];
  teachers?: UserType[];
}

export const ScheduleDayCard: React.FC<ScheduleDayCardProps> = ({
  schedule,
  isTeacher = false,
  variant = 'horizontal',
  showClassInfo = false,
  classes = [],
  subjects = [],
  teachers = []
}) => {
  // Получаем данные о классе
  const classInfo = classes.find(c => c.id === schedule.classId);
  
  // Определяем цвет статуса урока
  const getStatusColor = () => {
    switch (schedule.status) {
      case 'conducted':
        return 'bg-green-50 border-green-100';
      case 'not_conducted':
        return 'bg-orange-50 border-orange-100';
      default:
        return 'bg-gray-50 border-gray-100';
    }
  };

  // Получаем название предмета
  const getSubjectName = () => {
    if (schedule.subgroupId && schedule.subgroupName) {
      return schedule.subgroupName;
    }
    
    const subject = subjects?.find(s => s.id === schedule.subjectId);
    return subject?.name || "Предмет";
  };

  // Получаем имя учителя
  const getTeacherName = () => {
    const teacher = teachers?.find(t => t.id === schedule.teacherId);
    if (teacher) {
      return `${teacher.lastName || ''} ${teacher.firstName || ''}`;
    }
    return "Преподаватель";
  };

  return (
    <Card 
      className={cn(
        "overflow-hidden transition-all duration-200",
        getStatusColor(),
        variant === 'vertical' ? "w-full" : "w-full md:max-w-md"
      )}
    >
      <CardContent className="p-3">
        <div className="flex justify-between items-start mb-2">
          <div className="flex flex-col">
            <div className="font-medium text-primary">
              {schedule.startTime} - {schedule.endTime}
            </div>
            <div className="text-lg font-semibold">
              {getSubjectName()}
            </div>
            {showClassInfo && classInfo && (
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
            <span>{getTeacherName()}</span>
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
};