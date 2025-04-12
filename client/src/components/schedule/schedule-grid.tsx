import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Schedule, TimeSlot, ClassTimeSlot } from '@shared/schema';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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

export const ScheduleGrid: React.FC<ScheduleGridProps> = ({
  schedules,
  classId,
  dayOfWeek,
  subjects,
  teachers,
  subgroups = [],
  onAddSchedule,
  onEditSchedule,
  onDeleteSchedule,
  isAdmin = false
}) => {
  // Загрузка временных слотов
  const { data: defaultSlots = [], isLoading: defaultSlotsLoading } = useQuery<TimeSlot[]>({
    queryKey: ['/api/time-slots/defaults'],
  });

  // Загрузка настроенных слотов для класса
  const { data: classTimeSlots = [], isLoading: classTimeSlotsLoading } = useQuery<ClassTimeSlot[]>({
    queryKey: ['/api/class', classId, 'time-slots'],
    enabled: !!classId,
  });

  // Определение максимального номера урока в расписании
  const maxSlotNumber = Math.max(
    ...schedules.map(s => s.slotNumber || 0),
    ...defaultSlots.map(s => s.slotNumber),
    9 // Всегда отображаем до 9-го урока включительно
  );

  // Определение количества дней для отображения
  const days = dayOfWeek 
    ? [dayOfWeek] 
    : [1, 2, 3, 4, 5, 6, 7]; // 1-7: Понедельник-Воскресенье

  // Получение эффективного временного слота (настроенного для класса или по умолчанию)
  const getEffectiveTimeSlot = (slotNumber: number) => {
    // Сначала ищем настроенный слот для класса
    const classSlot = classTimeSlots.find(slot => slot.slotNumber === slotNumber);
    if (classSlot) return classSlot;
    
    // Если не найден, используем слот по умолчанию
    return defaultSlots.find(slot => slot.slotNumber === slotNumber);
  };

  // Проверка, имеет ли день хотя бы один урок с номером >= slotNumber
  const dayHasLaterLesson = (day: number, slotNumber: number) => {
    return schedules.some(s => 
      s.dayOfWeek === day && 
      (s.slotNumber === undefined || s.slotNumber >= slotNumber)
    );
  };

  // Проверка, должен ли урок отображаться в сетке
  // По условию задачи:
  // 1. Слот "0 урок" всегда отображается, если в этот день есть хотя бы один урок
  // 2. Промежуточные пустые слоты отображаются до последнего урока в этот день
  const shouldShowSlot = (day: number, slotNumber: number) => {
    const daySchedules = schedules.filter(s => s.dayOfWeek === day);
    
    // Если это 0-й урок и в этот день есть любые уроки
    if (slotNumber === 0 && daySchedules.length > 0) {
      return true;
    }

    // Определяем максимальный номер урока в этот день
    const maxSlotNumberInDay = Math.max(
      0, // Минимум 0
      ...daySchedules.map(s => s.slotNumber || 0)
    );

    // Если слот меньше или равен максимальному номеру урока в этот день
    return slotNumber <= maxSlotNumberInDay;
  };

  // Получение расписания для конкретного дня и слота
  const getScheduleForSlot = (day: number, slotNumber: number) => {
    return schedules.filter(s => 
      s.dayOfWeek === day && 
      s.slotNumber === slotNumber
    );
  };

  // Форматирование названия дня недели
  const getDayName = (day: number) => {
    const days = [
      'Понедельник', 'Вторник', 'Среда', 
      'Четверг', 'Пятница', 'Суббота', 'Воскресенье'
    ];
    return days[day - 1]; // day: 1-7
  };

  // Получение сокращенного названия предмета
  const getSubjectName = (subjectId: number) => {
    const subject = subjects.find(s => s.id === subjectId);
    return subject?.name || 'Предмет';
  };

  // Получение ФИО учителя
  const getTeacherName = (teacherId: number) => {
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return 'Учитель';
    return `${teacher.lastName} ${teacher.firstName?.charAt(0) || ''}. ${teacher.middleName?.charAt(0) || ''}`.trim();
  };

  // Получение названия подгруппы
  const getSubgroupName = (subgroupId?: number) => {
    if (!subgroupId) return '';
    const subgroup = subgroups.find(s => s.id === subgroupId);
    return subgroup?.name || '';
  };

  if (defaultSlotsLoading || classTimeSlotsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3">Загрузка временных слотов...</span>
      </div>
    );
  }

  // Создаем массив слотов для отображения
  const slotsToShow = Array.from({ length: maxSlotNumber + 1 }, (_, i) => i)
    .filter(slotNumber => {
      // Проверяем, есть ли хотя бы один день, где этот слот должен отображаться
      return days.some(day => shouldShowSlot(day, slotNumber));
    });

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        {/* Заголовок с днями недели */}
        <div className="grid grid-cols-[150px_repeat(7,1fr)] gap-1 mb-2">
          <div className="bg-primary-50 p-2 rounded flex items-center justify-center font-medium">
            Время
          </div>
          {days.map(day => (
            <div key={day} className="bg-primary-100 p-2 rounded flex items-center justify-center font-medium">
              {getDayName(day)}
            </div>
          ))}
        </div>
        
        {/* Строки с временными слотами */}
        {slotsToShow.map(slotNumber => {
          const timeSlot = getEffectiveTimeSlot(slotNumber);
          
          return (
            <div key={slotNumber} className="grid grid-cols-[150px_repeat(7,1fr)] gap-1 mb-2">
              {/* Ячейка времени */}
              <div className="bg-primary-50 p-2 rounded flex flex-col items-center justify-center">
                <div className="font-medium">{slotNumber} урок</div>
                <div className="text-sm text-gray-600">
                  {timeSlot ? `${timeSlot.startTime} - ${timeSlot.endTime}` : '—'}
                </div>
              </div>
              
              {/* Ячейки для каждого дня недели */}
              {days.map(day => {
                const slotSchedules = getScheduleForSlot(day, slotNumber);
                const shouldDisplay = shouldShowSlot(day, slotNumber);
                
                if (!shouldDisplay) {
                  return <div key={day} className="hidden"></div>;
                }
                
                return (
                  <div 
                    key={day} 
                    className={cn(
                      "relative p-2 rounded min-h-[80px] flex flex-col justify-center",
                      slotSchedules.length > 0 
                        ? "bg-primary-100 border border-primary" 
                        : "bg-gray-50 border border-gray-200"
                    )}
                  >
                    {slotSchedules.length > 0 ? (
                      slotSchedules.map(schedule => (
                        <TooltipProvider key={schedule.id}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div 
                                className="cursor-pointer p-1 hover:bg-primary-200 rounded"
                                onClick={() => onEditSchedule && onEditSchedule(schedule)}
                              >
                                <div className="font-medium text-sm">
                                  {getSubjectName(schedule.subjectId)}
                                </div>
                                <div className="text-xs">
                                  {getTeacherName(schedule.teacherId)}
                                </div>
                                <div className="flex items-center justify-between mt-1">
                                  {schedule.room && (
                                    <span className="text-xs text-gray-600">
                                      Каб: {schedule.room}
                                    </span>
                                  )}
                                  {schedule.subgroupId && (
                                    <Badge variant="outline" className="text-xs">
                                      {getSubgroupName(schedule.subgroupId)}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-sm">
                                <div><strong>Предмет:</strong> {getSubjectName(schedule.subjectId)}</div>
                                <div><strong>Учитель:</strong> {getTeacherName(schedule.teacherId)}</div>
                                {schedule.room && <div><strong>Кабинет:</strong> {schedule.room}</div>}
                                {schedule.subgroupId && <div><strong>Подгруппа:</strong> {getSubgroupName(schedule.subgroupId)}</div>}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ))
                    ) : (
                      isAdmin && (
                        <Button 
                          variant="ghost" 
                          className="text-gray-400 hover:text-gray-600 w-full h-full"
                          onClick={() => onAddSchedule && onAddSchedule(slotNumber)}
                        >
                          +
                        </Button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};