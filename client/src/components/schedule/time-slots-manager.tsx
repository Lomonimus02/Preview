import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TimeSlot, ClassTimeSlot } from '@shared/schema';
import { Loader2, Clock, Save, Trash2, RefreshCw } from 'lucide-react';
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface TimeSlotsManagerProps {
  classId: number;
}

export function TimeSlotsManager({ classId }: TimeSlotsManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [slotData, setSlotData] = useState<Record<number, { startTime: string, endTime: string }>>({});

  // Мутация для создания/обновления временного слота для класса
  const updateClassTimeSlotMutation = useMutation({
    mutationFn: async ({ slotNumber, startTime, endTime }: { slotNumber: number, startTime: string, endTime: string }) => {
      return await apiRequest({
        url: `/api/class/${classId}/time-slots`,
        method: 'POST',
        data: { slotNumber, startTime, endTime }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/class', classId, 'time-slots'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules', { classId }] });
      toast({
        title: 'Временной слот обновлен',
        description: 'Настройки временного слота успешно сохранены',
        variant: 'default'
      });
      setEditingSlot(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Ошибка',
        description: error.message || 'Не удалось сохранить настройки временного слота',
        variant: 'destructive'
      });
    }
  });

  // Мутация для удаления настроенного временного слота (возврат к значениям по умолчанию)
  const deleteClassTimeSlotMutation = useMutation({
    mutationFn: async (slotNumber: number) => {
      return await apiRequest({
        url: `/api/class/${classId}/time-slots/${slotNumber}`,
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/class', classId, 'time-slots'] });
      queryClient.invalidateQueries({ queryKey: ['/api/schedules', { classId }] });
      toast({
        title: 'Временной слот сброшен',
        description: 'Настройки временного слота сброшены к значениям по умолчанию',
        variant: 'default'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Ошибка',
        description: error.message || 'Не удалось сбросить настройки временного слота',
        variant: 'destructive'
      });
    }
  });

  // Получение слотов по умолчанию
  const { data: defaultSlots = [], isLoading: defaultSlotsLoading } = useQuery<TimeSlot[]>({
    queryKey: ['/api/time-slots/defaults'],
  });

  // Получение настроенных слотов для класса
  const { data: classTimeSlots = [], isLoading: classTimeSlotsLoading } = useQuery<ClassTimeSlot[]>({
    queryKey: ['/api/class', classId, 'time-slots'],
    enabled: !!classId,
  });

  // Функция для форматирования времени в формат HH:MM
  const formatTime = (timeString: string) => {
    return timeString.substring(0, 5); // Обрезаем до формата HH:MM
  };

  // Функция для получения эффективного значения слота времени (класс или по умолчанию)
  const getEffectiveTimeSlot = (slotNumber: number) => {
    const classSlot = classTimeSlots.find(slot => slot.slotNumber === slotNumber);
    if (classSlot) {
      return classSlot;
    }
    return defaultSlots.find(slot => slot.slotNumber === slotNumber);
  };

  // Обработчик начала редактирования слота
  const handleEditSlot = (slotNumber: number) => {
    const slot = getEffectiveTimeSlot(slotNumber);
    if (slot) {
      setSlotData({
        ...slotData,
        [slotNumber]: {
          startTime: formatTime(slot.startTime),
          endTime: formatTime(slot.endTime)
        }
      });
      setEditingSlot(slotNumber);
    }
  };

  // Обработчик сохранения изменений слота
  const handleSaveSlot = (slotNumber: number) => {
    const data = slotData[slotNumber];
    if (data) {
      updateClassTimeSlotMutation.mutate({
        slotNumber,
        startTime: data.startTime,
        endTime: data.endTime
      });
    }
  };

  // Обработчик отмены редактирования слота
  const handleCancelEdit = () => {
    setEditingSlot(null);
  };

  // Обработчик сброса настроек слота к значениям по умолчанию
  const handleResetSlot = (slotNumber: number) => {
    if (confirm('Вы уверены, что хотите сбросить настройки данного временного слота к значениям по умолчанию?')) {
      deleteClassTimeSlotMutation.mutate(slotNumber);
    }
  };

  // Обработчик изменения значений времени
  const handleTimeChange = (slotNumber: number, field: 'startTime' | 'endTime', value: string) => {
    setSlotData({
      ...slotData,
      [slotNumber]: {
        ...slotData[slotNumber],
        [field]: value
      }
    });
  };

  // Если данные загружаются, показываем индикатор загрузки
  if (defaultSlotsLoading || classTimeSlotsLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
        <span>Загрузка временных слотов...</span>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Настройка временных слотов уроков</CardTitle>
        <CardDescription>
          Настройте время начала и окончания каждого урока для данного класса. 
          Если не указано отдельное время для класса, будут использованы значения по умолчанию.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableCaption>Временные слоты уроков</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Урок</TableHead>
              <TableHead>Время начала</TableHead>
              <TableHead>Время окончания</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {defaultSlots.sort((a, b) => a.slotNumber - b.slotNumber).map((defaultSlot) => {
              const slotNumber = defaultSlot.slotNumber;
              const classSlot = classTimeSlots.find(s => s.slotNumber === slotNumber);
              const effectiveSlot = classSlot || defaultSlot;
              const isCustomized = !!classSlot;
              const isEditing = editingSlot === slotNumber;

              return (
                <TableRow key={slotNumber}>
                  <TableCell className="font-medium">
                    <div className="flex items-center">
                      <Clock className="h-4 w-4 mr-1 text-muted-foreground" />
                      {slotNumber}-й урок
                    </div>
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input
                        type="time"
                        value={slotData[slotNumber]?.startTime || formatTime(effectiveSlot.startTime)}
                        onChange={(e) => handleTimeChange(slotNumber, 'startTime', e.target.value)}
                        className="w-32"
                      />
                    ) : (
                      formatTime(effectiveSlot.startTime)
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input
                        type="time"
                        value={slotData[slotNumber]?.endTime || formatTime(effectiveSlot.endTime)}
                        onChange={(e) => handleTimeChange(slotNumber, 'endTime', e.target.value)}
                        className="w-32"
                      />
                    ) : (
                      formatTime(effectiveSlot.endTime)
                    )}
                  </TableCell>
                  <TableCell>
                    {isCustomized ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        Настроено
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                        По умолчанию
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-1">
                      {isEditing ? (
                        <>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleSaveSlot(slotNumber)}
                            disabled={updateClassTimeSlotMutation.isPending}
                          >
                            {updateClassTimeSlotMutation.isPending && (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            )}
                            Сохранить
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCancelEdit}
                          >
                            Отмена
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditSlot(slotNumber)}
                          >
                            Изменить
                          </Button>
                          {isCustomized && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleResetSlot(slotNumber)}
                              disabled={deleteClassTimeSlotMutation.isPending}
                            >
                              {deleteClassTimeSlotMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}