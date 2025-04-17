import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiRequest } from "@/lib/queryClient";

// Компонент ячейки с оценкой
interface GradeCellProps {
  studentId: number;
  assignmentId: number;
  grade?: number | null;
  maxScore: number | string; // Максимальный балл для задания
  onSave: (studentId: number, assignmentId: number, grade: number) => void;
  colorScheme?: 'blue' | 'green' | 'orange' | 'red'; // Опциональная цветовая схема
}

export const GradeCell: React.FC<GradeCellProps> = ({
  studentId,
  assignmentId,
  grade,
  maxScore,
  onSave,
  colorScheme = 'blue'
}) => {
  const [value, setValue] = useState<string>(grade?.toString() || '');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Цветовая схема для различных типов заданий
  const colorClasses = {
    blue: 'border-blue-200 bg-blue-50 hover:bg-blue-100 focus:border-blue-300',
    green: 'border-green-200 bg-green-50 hover:bg-green-100 focus:border-green-300',
    orange: 'border-orange-200 bg-orange-50 hover:bg-orange-100 focus:border-orange-300',
    red: 'border-red-200 bg-red-50 hover:bg-red-100 focus:border-red-300',
  };
  
  // Состояние в зависимости от наличия оценки
  const baseCellClass = grade 
    ? 'border border-dashed cursor-pointer text-center p-1 w-12 h-9 rounded-md flex items-center justify-center transition-colors'
    : 'border border-dotted cursor-pointer text-center p-1 w-12 h-9 rounded-md flex items-center justify-center transition-colors';
  
  const cellClass = `${baseCellClass} ${colorClasses[colorScheme]}`;
  
  // Обработчик изменения значения
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    
    // Разрешаем только цифры
    if (!/^\d*$/.test(newValue)) {
      return;
    }
    
    setValue(newValue);
    
    // Проверка на превышение максимального балла
    if (newValue && parseInt(newValue) > parseInt(maxScore.toString())) {
      setError(`Максимальный балл: ${maxScore}`);
    } else {
      setError(null);
    }
  };
  
  // Сохранение оценки
  const handleSave = () => {
    if (value && !error) {
      const numValue = parseInt(value);
      onSave(studentId, assignmentId, numValue);
      setIsEditing(false);
    }
  };
  
  // Обработка клавиши Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setValue(grade?.toString() || '');
      setIsEditing(false);
      setError(null);
    }
  };
  
  if (isEditing) {
    return (
      <div className="relative">
        <Input
          type="text"
          className={`w-12 h-9 p-1 text-center ${error ? 'border-red-500' : ''}`}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          autoFocus
        />
        {error && (
          <div className="absolute left-0 -bottom-5 text-xs text-red-500 whitespace-nowrap">
            {error}
          </div>
        )}
      </div>
    );
  }
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div 
            className={cellClass}
            onClick={() => setIsEditing(true)}
          >
            {grade || ''}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Максимальный балл: {maxScore}</p>
          <p>Нажмите, чтобы изменить</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// Основной компонент редактора оценок
interface Assignment {
  id: number;
  assignmentType: string;
  maxScore: string | number;
  displayOrder?: number;
  description?: string;
}

interface Student {
  id: number;
  firstName: string;
  lastName: string;
}

interface Grade {
  id?: number;
  studentId: number;
  assignmentId: number;
  grade: number;
}

interface GradeEditorProps {
  students: Student[];
  assignments: Assignment[];
  grades: Grade[];
  onSaveGrade: (grade: Grade) => void;
  onUpdateGrade: (gradeId: number, grade: Grade) => void;
}

export const GradeEditor: React.FC<GradeEditorProps> = ({
  students,
  assignments,
  grades,
  onSaveGrade,
  onUpdateGrade
}) => {
  // Определение цветовой схемы для типа задания
  const getColorScheme = (type: string): 'blue' | 'green' | 'orange' | 'red' => {
    const typeMap: Record<string, 'blue' | 'green' | 'orange' | 'red'> = {
      'homework': 'blue',
      'test_work': 'green',
      'control_work': 'red',
      'classwork': 'orange',
      'exam': 'red',
      'project': 'orange',
    };
    
    return typeMap[type] || 'blue';
  };
  
  // Получение типа задания в формате для отображения
  const getAssignmentTypeDisplay = (type: string): string => {
    const typeMap: Record<string, string> = {
      'homework': 'ДЗ',
      'test_work': 'Тест',
      'control_work': 'КР',
      'classwork': 'Работа',
      'exam': 'Экзамен',
      'project': 'Проект',
    };
    
    return typeMap[type] || type;
  };
  
  // Сортировка заданий по displayOrder
  const sortedAssignments = [...assignments].sort((a, b) => 
    (a.displayOrder || 0) - (b.displayOrder || 0)
  );
  
  // Обработчик сохранения оценки
  const handleSaveGrade = (studentId: number, assignmentId: number, value: number) => {
    // Проверяем, существует ли уже оценка
    const existingGrade = grades.find(
      g => g.studentId === studentId && g.assignmentId === assignmentId
    );
    
    if (existingGrade && existingGrade.id) {
      // Обновление существующей оценки
      onUpdateGrade(existingGrade.id, {
        ...existingGrade,
        grade: value
      });
    } else {
      // Создание новой оценки
      onSaveGrade({
        studentId,
        assignmentId,
        grade: value
      });
    }
  };
  
  // Получение оценки для студента и задания
  const getGrade = (studentId: number, assignmentId: number): number | null => {
    const found = grades.find(
      g => g.studentId === studentId && g.assignmentId === assignmentId
    );
    return found ? found.grade : null;
  };

  return (
    <div className="w-full overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 z-10">
              Ученик
            </th>
            {sortedAssignments.map((assignment) => (
              <th 
                key={assignment.id} 
                className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                <div className="flex flex-col items-center">
                  <span className="font-bold">
                    {getAssignmentTypeDisplay(assignment.assignmentType)}
                  </span>
                  <span className="text-xs font-normal">
                    {assignment.maxScore} б.
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {students.map((student) => (
            <tr key={student.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white z-10">
                {student.lastName} {student.firstName}
              </td>
              {sortedAssignments.map((assignment) => (
                <td key={`${student.id}-${assignment.id}`} className="px-3 py-2 whitespace-nowrap text-sm text-center">
                  <GradeCell
                    studentId={student.id}
                    assignmentId={assignment.id}
                    grade={getGrade(student.id, assignment.id)}
                    maxScore={assignment.maxScore}
                    onSave={handleSaveGrade}
                    colorScheme={getColorScheme(assignment.assignmentType)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};