import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { User, Schedule, Attendance } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { FiCheck, FiX, FiSave } from "react-icons/fi";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AttendanceFormProps {
  schedule: Schedule;
  onClose: () => void;
}

interface StudentWithAttendance {
  id: number;
  firstName: string;
  lastName: string;
  attendance?: Attendance;
  present: boolean;
}

export const AttendanceForm: React.FC<AttendanceFormProps> = ({
  schedule,
  onClose,
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Состояние для списка студентов с их статусом посещаемости
  const [students, setStudents] = useState<StudentWithAttendance[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Получаем список студентов из класса
  const { data: classStudents = [], isLoading: isLoadingStudents } = useQuery<User[]>({
    queryKey: [`/api/students-by-class/${schedule.classId}`],
    enabled: !!schedule.classId,
  });

  // Получаем данные по посещаемости для конкретного урока
  const { data: attendanceData = [], isLoading: isLoadingAttendance } = useQuery<Attendance[]>({
    queryKey: [`/api/attendance?scheduleId=${schedule.id}`],
    enabled: !!schedule.id,
  });

  // При загрузке данных инициализируем состояние студентов
  useEffect(() => {
    if (classStudents.length > 0) {
      // Если есть подгруппа, фильтруем студентов только из этой подгруппы
      const studentsToShow = schedule.subgroupId 
        ? classStudents.filter(student => {
            // Проверяем принадлежность студента к подгруппе - это должна делать серверная часть
            // Пока реализуем просто отображение всех студентов
            return true;
          })
        : classStudents;

      // Создаем список студентов с их статусом посещаемости
      const studentsWithAttendance = studentsToShow.map(student => {
        // Ищем запись о посещаемости для данного студента
        const attendance = attendanceData.find(a => a.studentId === student.id && a.scheduleId === schedule.id);
        
        return {
          id: student.id,
          firstName: student.firstName || "",
          lastName: student.lastName || "",
          attendance: attendance,
          // Если есть запись о посещаемости, используем её значение, иначе считаем, что студент присутствовал
          present: attendance ? attendance.status === "present" : true,
        };
      });

      setStudents(studentsWithAttendance);
    }
  }, [classStudents, attendanceData, schedule]);

  // Обработчик изменения статуса посещаемости для студента
  const handleAttendanceChange = (studentId: number, present: boolean) => {
    setStudents(prev => 
      prev.map(student => 
        student.id === studentId 
          ? { ...student, present } 
          : student
      )
    );
  };

  // Сохранение данных о посещаемости
  const handleSaveAttendance = async () => {
    if (!schedule.id) return;
    
    setIsSubmitting(true);
    
    try {
      // Для каждого студента отправляем запрос на сохранение статуса посещаемости
      const promises = students.map(student => {
        return apiRequest('/api/attendance', {
          method: 'POST',
          data: {
            studentId: student.id,
            scheduleId: schedule.id,
            status: student.present ? 'present' : 'absent',
          }
        });
      });
      
      await Promise.all(promises);
      
      // Обновляем данные
      queryClient.invalidateQueries({ queryKey: [`/api/attendance`] });
      
      toast({
        title: "Посещаемость сохранена",
        description: "Данные о посещаемости успешно сохранены",
      });
      
      onClose();
    } catch (error) {
      console.error('Ошибка при сохранении посещаемости:', error);
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить данные о посещаемости",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Обработчик быстрого выбора "Все присутствуют" или "Все отсутствуют"
  const handleMarkAll = (present: boolean) => {
    setStudents(prev => prev.map(student => ({ ...student, present })));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between mb-4">
        <div>
          <h3 className="text-lg font-medium">Отметка посещаемости</h3>
          <p className="text-sm text-gray-500">
            {schedule.scheduleDate} • {schedule.startTime}-{schedule.endTime}
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleMarkAll(true)}
            disabled={isSubmitting}
          >
            <FiCheck className="mr-1" /> Все присутствуют
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleMarkAll(false)}
            disabled={isSubmitting}
          >
            <FiX className="mr-1" /> Все отсутствуют
          </Button>
        </div>
      </div>

      {(isLoadingStudents || isLoadingAttendance) ? (
        <div className="py-4 text-center">Загрузка данных...</div>
      ) : students.length === 0 ? (
        <div className="py-4 text-center">Нет студентов для отображения</div>
      ) : (
        <ScrollArea className="max-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">№</TableHead>
                <TableHead>Студент</TableHead>
                <TableHead className="w-24 text-center">Присутствие</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student, index) => (
                <TableRow key={student.id}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>
                    {student.lastName} {student.firstName}
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={student.present}
                      onCheckedChange={(checked) => 
                        handleAttendanceChange(student.id, !!checked)
                      }
                      disabled={isSubmitting}
                      aria-label="Присутствие"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={isSubmitting}
        >
          Отмена
        </Button>
        <Button
          onClick={handleSaveAttendance}
          disabled={isSubmitting || students.length === 0}
        >
          <FiSave className="mr-2" />
          {isSubmitting ? "Сохранение..." : "Сохранить"}
        </Button>
      </div>
    </div>
  );
};