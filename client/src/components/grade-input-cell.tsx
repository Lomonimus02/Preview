import React, { useState } from 'react';
import { PlusCircle, X } from 'lucide-react';
import { Grade } from '@shared/schema';

interface GradeInputCellProps {
  studentId: number;
  scheduleId: number;
  assignmentId: number;
  existingGrade?: Grade;
  assignmentType: string;
  maxScore: number;
  canEdit: boolean;
  onSave: (studentId: number, scheduleId: number, assignmentId: number, value: string) => void;
  onDelete?: (gradeId: number) => void;
  bgColor?: string;
}

export const GradeInputCell: React.FC<GradeInputCellProps> = ({
  studentId,
  scheduleId,
  assignmentId,
  existingGrade,
  assignmentType,
  maxScore,
  canEdit,
  onSave,
  onDelete,
  bgColor = 'bg-white/80',
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(existingGrade ? existingGrade.grade.toString() : '');

  const handleBlur = () => {
    if (inputValue.trim()) {
      onSave(studentId, scheduleId, assignmentId, inputValue);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setInputValue(existingGrade ? existingGrade.grade.toString() : '');
      setIsEditing(false);
    }
  };

  if (!canEdit && !existingGrade) {
    return <div className="h-7"></div>;
  }

  if (isEditing || (!existingGrade && canEdit)) {
    return (
      <div className="flex items-center justify-center">
        <input
          type="text"
          className={`w-10 h-7 text-center border rounded focus:outline-none focus:ring-1 focus:ring-primary ${existingGrade ? '' : 'border-dashed bg-transparent'}`}
          value={inputValue}
          placeholder={existingGrade ? existingGrade.grade.toString() : '+'}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      </div>
    );
  }

  return (
    <div className="relative group flex items-center justify-center">
      {existingGrade && (
        <>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium cursor-pointer ${bgColor}`}
            title={`Оценка ${existingGrade.grade} из ${maxScore}. Нажмите для редактирования.`}
            onClick={() => canEdit && setIsEditing(true)}
          >
            {existingGrade.grade}
          </span>

          {canEdit && onDelete && (
            <button
              className="text-red-500 hover:text-red-700 ml-1 focus:outline-none invisible group-hover:visible"
              onClick={() => {
                if (window.confirm("Вы уверены, что хотите удалить эту оценку?")) {
                  onDelete(existingGrade.id);
                }
              }}
              title="Удалить оценку"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </>
      )}

      {!existingGrade && canEdit && (
        <button
          onClick={() => setIsEditing(true)}
          className="text-gray-500 hover:text-primary focus:outline-none"
          title="Добавить оценку"
        >
          <PlusCircle className="h-4 w-4 mx-auto" />
        </button>
      )}
    </div>
  );
};