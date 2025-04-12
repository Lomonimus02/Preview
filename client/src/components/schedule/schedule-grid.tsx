import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Schedule } from '@shared/schema';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Edit, Trash2, Plus, Clock } from 'lucide-react';
import { TimeSlot, ClassTimeSlot } from '@shared/schema';

// Интерфейс для сетки расписания
interface ScheduleGridProps {
  schedules: Schedule[];
  classId: number;
  dayOfWeek?: number; // Если нужно отображать только конкретный день
  subjects: any[]; // Предметы
  teachers: any[]; // Учителя
  subgroups?: any[]; // Подгруппы
  onAddSchedule?: (slotNumber: number) => void;
  onEditSchedule?: (schedule: Schedule) => void;
  onDeleteSchedule?: (schedule: Schedule) => void;
  isAdmin?: boolean;
}

// Названия дней недели
const DAYS_OF_WEEK = [
  'Понедельник', 
  'Вторник', 
  'Среда', 
  'Четверг', 
  'Пятница', 
  'Суббота', 
  'Воскресенье'
];

export const ScheduleGrid: React.FC<ScheduleGridProps> = ({
  schedules,
  classId,
  dayOfWeek,
  subjects,
  teachers,
  subgroups,
  onAddSchedule,
  onEditSchedule,
  onDeleteSchedule,
  isAdmin = false
}) => {
  // Получение слотов по умолчанию
  const { data: defaultSlots = [], isLoading: defaultSlotsLoading } = useQuery<TimeSlot[]>({
    queryKey: ['/api/time-slots/defaults'],
  });

  // Получение настроенных слотов для класса
  const { data: classTimeSlots = [], isLoading: classTimeSlotsLoading } = useQuery<ClassTimeSlot[]>({
    queryKey: ['/api/class', classId, 'time-slots'],
    enabled: !!classId,
  });

  // Фильтрация расписаний по дню недели, если указан
  const filteredSchedules = dayOfWeek !== undefined
    ? schedules.filter(s => s.dayOfWeek === dayOfWeek)
    : schedules;

  // Определение отображаемых дней недели
  const daysToShow = dayOfWeek !== undefined
    ? [dayOfWeek]
    : [...new Set(filteredSchedules.map(s => s.dayOfWeek))].sort();

  // Если нет уроков, но мы хотим показать определенный день
  if (dayOfWeek !== undefined && !daysToShow.includes(dayOfWeek)) {
    daysToShow.push(dayOfWeek);
  }

  // Добавляем дни недели, для которых есть уроки, но которых нет в наборе
  if (dayOfWeek === undefined) {
    for (let i = 0; i < 7; i++) {
      if (!daysToShow.includes(i) && i < 6) { // Добавляем все дни кроме воскресенья
        daysToShow.push(i);
      }
    }
    daysToShow.sort(); // Сортируем дни недели
  }

  // Получение эффективного значения слота времени (класс или по умолчанию)
  const getEffectiveTimeSlot = (slotNumber: number) => {
    const classSlot = classTimeSlots.find(slot => slot.slotNumber === slotNumber);
    if (classSlot) {
      return classSlot;
    }
    return defaultSlots.find(slot => slot.slotNumber === slotNumber);
  };

  // Функция для форматирования времени
  const formatTime = (timeString: string) => {
    return timeString.substring(0, 5); // Обрезаем до формата HH:MM
  };

  // Получение расписания для конкретного дня и слота
  const getScheduleForSlot = (dayOfWeek: number, slotNumber: number) => {
    return filteredSchedules.find(s => 
      s.dayOfWeek === dayOfWeek && 
      getSlotNumberForTime(s.startTime) === slotNumber
    );
  };

  // Определение номера слота по времени начала
  const getSlotNumberForTime = (startTime: string) => {
    for (let i = 0; i < defaultSlots.length; i++) {
      const slot = getEffectiveTimeSlot(defaultSlots[i].slotNumber);
      if (slot && startTime === slot.startTime) {
        return slot.slotNumber;
      }
    }
    return 0; // Если не найдено, вернуть 0 урок
  };

  // Все доступные слоты (от 0 до максимального используемого)
  const getAvailableSlots = () => {
    const slots = new Set<number>();
    
    // Добавление всех слотов из временных настроек
    defaultSlots.forEach(slot => slots.add(slot.slotNumber));
    
    // Добавление слотов из текущего расписания
    filteredSchedules.forEach(schedule => {
      const slotNumber = getSlotNumberForTime(schedule.startTime);
      slots.add(slotNumber);
    });
    
    return Array.from(slots).sort((a, b) => a - b);
  };

  const availableSlots = getAvailableSlots();

  // Функция для получения названия предмета
  const getSubjectName = (subjectId: number) => {
    const subject = subjects.find(s => s.id === subjectId);
    return subject ? subject.name : 'Неизвестный предмет';
  };

  // Функция для получения имени учителя
  const getTeacherName = (teacherId: number) => {
    const teacher = teachers.find(t => t.id === teacherId);
    return teacher ? `${teacher.lastName} ${teacher.firstName[0]}.` : 'Неизвестный учитель';
  };

  // Функция для получения названия подгруппы
  const getSubgroupName = (subgroupId: number | null) => {
    if (!subgroupId) return null;
    const subgroup = subgroups?.find(s => s.id === subgroupId);
    return subgroup ? subgroup.name : 'Неизвестная подгруппа';
  };

  // Если данные загружаются, показываем индикатор загрузки
  if (defaultSlotsLoading || classTimeSlotsLoading) {
    return <div className="p-4">Загрузка расписания...</div>;
  }

  return (
    <div className="space-y-6">
      {daysToShow.map(day => (
        <Card key={day} className="overflow-hidden">
          <CardHeader className="bg-muted/30">
            <CardTitle>{DAYS_OF_WEEK[day]}</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-2">
              {availableSlots.map(slotNumber => {
                const schedule = getScheduleForSlot(day, slotNumber);
                const timeSlot = getEffectiveTimeSlot(slotNumber);
                
                return (
                  <div 
                    key={`${day}-${slotNumber}`} 
                    className="grid grid-cols-12 gap-2 p-3 rounded-md border hover:bg-muted/20"
                  >
                    <div className="col-span-2 flex items-center">
                      <Badge variant="outline" className="flex items-center space-x-1 py-2">
                        <Clock className="h-3 w-3" />
                        <span>
                          {timeSlot ? 
                            `${formatTime(timeSlot.startTime)}-${formatTime(timeSlot.endTime)}` : 
                            `Урок ${slotNumber}`
                          }
                        </span>
                      </Badge>
                    </div>
                    
                    {schedule ? (
                      <div className="col-span-8 flex flex-col">
                        <div className="font-medium">{getSubjectName(schedule.subjectId)}</div>
                        <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3">
                          <span>{getTeacherName(schedule.teacherId)}</span>
                          {schedule.room && <span>Каб. {schedule.room}</span>}
                          {schedule.subgroupId && (
                            <Badge variant="secondary">{getSubgroupName(schedule.subgroupId)}</Badge>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="col-span-8 flex items-center text-muted-foreground text-sm">
                        Нет урока
                      </div>
                    )}
                    
                    <div className="col-span-2 flex justify-end items-center space-x-1">
                      {isAdmin && (
                        <>
                          {schedule ? (
                            <>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      onClick={() => onEditSchedule && onEditSchedule(schedule)}
                                      className="h-8 w-8"
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Редактировать урок</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      onClick={() => onDeleteSchedule && onDeleteSchedule(schedule)}
                                      className="h-8 w-8 text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Удалить урок</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </>
                          ) : (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => onAddSchedule && onAddSchedule(slotNumber)}
                                    className="h-8 w-8"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Добавить урок</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};