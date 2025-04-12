import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  format, 
  startOfWeek, 
  endOfWeek, 
  addDays,
  isSameDay,
  parseISO
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Schedule, TimeSlot, ClassTimeSlot, Subject, User } from '@shared/schema';
import { Loader2, ChevronLeft, ChevronRight, Calendar, Plus, Edit, Trash2 } from 'lucide-react';

interface ScheduleGridProps {
  schedules: Schedule[];
  subjects: Subject[];
  teachers: User[];
  classId: number;
  isAdmin?: boolean;
  subgroups?: any[];
  onAddSchedule?: (date: Date) => void;
  onEditSchedule?: (schedule: Schedule) => void;
  onDeleteSchedule?: (schedule: Schedule) => void;
}

export const ScheduleGrid: React.FC<ScheduleGridProps> = ({
  schedules,
  subjects,
  teachers,
  classId,
  isAdmin = false,
  subgroups = [],
  onAddSchedule,
  onEditSchedule,
  onDeleteSchedule
}) => {
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  
  // Получение временных слотов по умолчанию
  const { data: defaultTimeSlots = [], isLoading: defaultSlotsLoading } = useQuery<TimeSlot[]>({
    queryKey: ['/api/time-slots/defaults'],
  });

  // Получение настроенных слотов для класса
  const { data: classTimeSlots = [], isLoading: classSlotsLoading } = useQuery<ClassTimeSlot[]>({
    queryKey: ['/api/class', classId, 'time-slots'],
    enabled: !!classId,
  });

  // Текущая неделя
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekRangeText = `${format(weekStart, "d MMM", { locale: ru })} - ${format(weekEnd, "d MMM yyyy", { locale: ru })}`;

  // Функция для получения эффективного временного слота (настроенный для класса или по умолчанию)
  const getEffectiveTimeSlot = (slotNumber: number) => {
    const classSlot = classTimeSlots.find(slot => slot.slotNumber === slotNumber);
    if (classSlot) return classSlot;
    
    return defaultTimeSlots.find(slot => slot.slotNumber === slotNumber);
  };

  // Функция для получения отображаемых слотов
  const getDisplaySlots = () => {
    // Создаем карту для дней недели, чтобы определить, какие слоты нужно отображать
    const daySlots = weekDates.map((date) => {
      const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();
      
      // Фильтруем расписание для текущего дня недели или конкретной даты
      const daySchedules = schedules.filter(schedule => {
        if (schedule.scheduleDate) {
          const scheduleDate = new Date(schedule.scheduleDate);
          return isSameDay(scheduleDate, date);
        }
        return schedule.dayOfWeek === dayOfWeek;
      });
      
      // Если нет расписания на этот день, возвращаем пустой массив
      if (daySchedules.length === 0) return [];
      
      // Получаем все номера слотов, которые используются в этот день
      const usedSlotNumbers = daySchedules.map(s => {
        const timeSlot = defaultTimeSlots.find(slot => {
          return slot.startTime === s.startTime && slot.endTime === s.endTime;
        });
        return timeSlot?.slotNumber || -1;
      });
      
      // Находим максимальный слот, чтобы определить, до какого слота показывать пустые ячейки
      const maxSlot = Math.max(...usedSlotNumbers, 0);
      
      // Всегда добавляем 0-й слот, если в этот день есть хотя бы один урок
      const slots = daySchedules.length > 0 ? [0] : [];
      
      // Добавляем все слоты от 1 до максимального
      for (let i = 1; i <= maxSlot; i++) {
        if (!slots.includes(i)) {
          slots.push(i);
        }
      }
      
      // Возвращаем отсортированный список слотов
      return slots.sort((a, b) => a - b);
    });
    
    // Находим максимальное количество слотов среди всех дней
    const allSlots = daySlots.flat();
    const maxSlots = allSlots.length > 0 ? Math.max(...allSlots) : 0;
    
    // Создаем список всех слотов от 0 до максимального
    const allSlotNumbersSet = new Set<number>([0]);
    for (let i = 1; i <= maxSlots; i++) {
      allSlotNumbersSet.add(i);
    }
    
    // Преобразуем Set в массив и сортируем его
    const allSlotNumbersArray = Array.from(allSlotNumbersSet).sort((a, b) => a - b);
    
    return { 
      daySlots, 
      allSlotNumbers: allSlotNumbersArray
    };
  };

  // Получаем слоты для отображения
  const { daySlots, allSlotNumbers } = getDisplaySlots();

  // Функция для получения расписания для конкретного дня и слота
  const getScheduleForDayAndSlot = (date: Date, slotNumber: number) => {
    const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();
    const timeSlot = getEffectiveTimeSlot(slotNumber);
    
    if (!timeSlot) return null;

    // Находим расписание для этого дня, которое соответствует времени слота
    return schedules.find(schedule => {
      // Проверка на совпадение даты или дня недели
      const dateMatch = schedule.scheduleDate 
        ? isSameDay(new Date(schedule.scheduleDate), date)
        : schedule.dayOfWeek === dayOfWeek;
      
      // Проверка на совпадение времени
      const timeMatch = schedule.startTime === timeSlot.startTime && schedule.endTime === timeSlot.endTime;
      
      return dateMatch && timeMatch;
    });
  };

  // Функция для отображения ячейки расписания
  const renderScheduleCell = (date: Date, slotNumber: number) => {
    const schedule = getScheduleForDayAndSlot(date, slotNumber);
    const timeSlot = getEffectiveTimeSlot(slotNumber);
    
    // Если нет слота, возвращаем пустую ячейку
    if (!timeSlot) return <TableCell className="h-[100px] align-top"></TableCell>;
    
    if (!schedule) {
      // Пустая ячейка (нет урока в этом слоте)
      return (
        <TableCell className="h-[100px] align-top p-2 border">
          <div className="text-xs text-gray-400 mb-1">{timeSlot.startTime} - {timeSlot.endTime}</div>
          {isAdmin && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => onAddSchedule && onAddSchedule(date)}
              className="w-full justify-start text-gray-400 hover:text-primary"
            >
              <Plus className="h-4 w-4 mr-1" />
              <span className="text-xs">Добавить урок</span>
            </Button>
          )}
        </TableCell>
      );
    }
    
    // Ячейка с уроком
    const subject = subjects.find(s => s.id === schedule.subjectId);
    const teacher = teachers.find(t => t.id === schedule.teacherId);
    const subgroup = schedule.subgroupId 
      ? subgroups.find(sg => sg.id === schedule.subgroupId)
      : null;
    
    return (
      <TableCell className="h-[100px] align-top p-2 border bg-emerald-50">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-xs text-gray-500 mb-1">{timeSlot.startTime} - {timeSlot.endTime}</div>
            <div className="font-medium text-emerald-700">{subject?.name || 'Предмет'}</div>
            {subgroup && (
              <div className="text-sm text-emerald-600">{subgroup.name}</div>
            )}
            <div className="text-sm text-gray-600 mt-1">
              {teacher ? `${teacher.lastName} ${teacher.firstName}` : 'Учитель'}
            </div>
            {schedule.room && (
              <div className="text-xs text-gray-500 mt-1">Кабинет: {schedule.room}</div>
            )}
          </div>
          
          {isAdmin && (
            <div className="flex flex-col space-y-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onEditSchedule && onEditSchedule(schedule)}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-red-500"
                onClick={() => onDeleteSchedule && onDeleteSchedule(schedule)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </TableCell>
    );
  };

  // Функции для навигации по неделям
  const goToPreviousWeek = () => {
    setCurrentDate(addDays(currentDate, -7));
  };

  const goToNextWeek = () => {
    setCurrentDate(addDays(currentDate, 7));
  };

  if (defaultSlotsLoading || classSlotsLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-lg">Загрузка расписания...</span>
      </div>
    );
  }

  return (
    <Card className="w-full shadow-md">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center mb-4">
          <Button 
            variant="outline" 
            onClick={goToPreviousWeek}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Предыдущая неделя
          </Button>
          
          <div className="flex items-center text-lg font-medium">
            <Calendar className="mr-2 h-5 w-5" />
            <span>{weekRangeText}</span>
          </div>
          
          <Button 
            variant="outline" 
            onClick={goToNextWeek}
            className="gap-1"
          >
            Следующая неделя <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <CardTitle>Расписание уроков</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Урок</TableHead>
                {weekDates.map((date) => (
                  <TableHead key={date.toString()} className="text-center min-w-[200px]">
                    <div className="font-medium">{format(date, 'EEEE', { locale: ru })}</div>
                    <div className="text-sm">{format(date, 'd MMMM', { locale: ru })}</div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {allSlotNumbers.map((slotNumber) => {
                const timeSlot = getEffectiveTimeSlot(slotNumber);
                if (!timeSlot) return null;

                return (
                  <TableRow key={`slot-${slotNumber}`}>
                    <TableCell className="font-medium bg-gray-50">
                      <div>{slotNumber} урок</div>
                      <div className="text-xs text-gray-500">{timeSlot.startTime} - {timeSlot.endTime}</div>
                    </TableCell>
                    
                    {weekDates.map((date, dateIndex) => {
                      const daySlotNumbers = daySlots[dateIndex];
                      
                      // Проверяем, нужно ли отображать этот слот для этого дня
                      const showSlot = daySlotNumbers.includes(slotNumber) || 
                                       (slotNumber === 0 && daySlotNumbers.length > 0);
                      
                      if (showSlot) {
                        return renderScheduleCell(date, slotNumber);
                      } else {
                        // Если слот не нужно отображать, возвращаем пустую ячейку
                        return <TableCell key={`date-${dateIndex}`} className="bg-gray-50"></TableCell>;
                      }
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};