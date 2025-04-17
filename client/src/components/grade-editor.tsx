import { useState, useEffect } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Student = {
  id: number;
  firstName: string;
  lastName: string;
  [key: string]: any;
};

type Assignment = {
  id: number;
  title: string;
  description?: string;
  maxScore: number;
  dueDate?: string;
  subjectId: number;
  [key: string]: any;
};

type Grade = {
  id: number;
  studentId: number;
  grade: number;
  assignmentId?: number | null;
  teacherId: number;
  createdAt: string;
  updatedAt?: string;
  [key: string]: any;
};

interface GradeEditorProps {
  students: Student[];
  assignments: Assignment[];
  grades: Grade[];
  onSaveGrade: (gradeData: any) => void;
  onUpdateGrade: (gradeId: number, gradeData: any) => void;
}

export function GradeEditor({
  students,
  assignments,
  grades,
  onSaveGrade,
  onUpdateGrade,
}: GradeEditorProps) {
  // Сортируем студентов по фамилии
  const sortedStudents = [...students].sort((a, b) => 
    a.lastName.localeCompare(b.lastName)
  );
  
  // Хранилище локальных значений редактируемых оценок
  const [localGrades, setLocalGrades] = useState<Record<string, string>>({});
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  // Инициализация локальных оценок из пропсов
  useEffect(() => {
    const initialLocalGrades: Record<string, string> = {};
    
    grades.forEach(grade => {
      if (grade.assignmentId) {
        initialLocalGrades[`${grade.studentId}-${grade.assignmentId}`] = grade.grade.toString();
      }
    });
    
    setLocalGrades(initialLocalGrades);
  }, [grades]);

  // Получаем оценку для конкретного студента и задания
  const getGrade = (studentId: number, assignmentId: number) => {
    return grades.find(g => 
      g.studentId === studentId && 
      g.assignmentId === assignmentId
    );
  };

  // Изменение локальной оценки
  const handleGradeChange = (studentId: number, assignmentId: number, value: string) => {
    const key = `${studentId}-${assignmentId}`;
    setLocalGrades(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Сохранение оценки при потере фокуса или нажатии Enter
  const handleGradeSubmit = (studentId: number, assignmentId: number) => {
    const key = `${studentId}-${assignmentId}`;
    const gradeValue = localGrades[key]?.trim();
    
    if (!gradeValue) return;
    
    // Проверка на корректность числа
    const numValue = parseFloat(gradeValue);
    if (isNaN(numValue)) return;
    
    const assignment = assignments.find(a => a.id === assignmentId);
    if (!assignment) return;
    
    // Проверка диапазона оценки
    if (numValue < 0 || numValue > assignment.maxScore) {
      alert(`Оценка должна быть в диапазоне от 0 до ${assignment.maxScore}`);
      return;
    }
    
    // Проверяем, существует ли уже оценка для этого студента и задания
    const existingGrade = getGrade(studentId, assignmentId);
    
    if (existingGrade) {
      // Обновляем существующую оценку
      if (existingGrade.grade !== numValue) {
        onUpdateGrade(existingGrade.id, { grade: numValue });
      }
    } else {
      // Создаем новую оценку
      onSaveGrade({
        studentId,
        assignmentId,
        grade: numValue
      });
    }
  };

  // Обработчик нажатия клавиши Enter
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    studentId: number,
    assignmentId: number
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleGradeSubmit(studentId, assignmentId);
      
      // Находим текущий индекс студента
      const studentIndex = sortedStudents.findIndex(s => s.id === studentId);
      
      // Если это не последний студент, переходим к следующему студенту
      if (studentIndex < sortedStudents.length - 1) {
        // Получаем следующего студента
        const nextStudentId = sortedStudents[studentIndex + 1].id;
        
        // Находим все поля ввода
        const inputs = document.querySelectorAll('input[data-grade-input]');
        const nextInput = Array.from(inputs).find(
          input => (input as HTMLInputElement).dataset.studentId === nextStudentId.toString() &&
                  (input as HTMLInputElement).dataset.assignmentId === assignmentId.toString()
        ) as HTMLInputElement | undefined;
        
        // Если нашли следующее поле, фокусируемся на нем
        if (nextInput) {
          nextInput.focus();
        }
      }
    }
  };

  // Получаем цвет ячейки в зависимости от оценки и максимального балла
  const getCellColor = (grade: number | undefined, maxScore: number) => {
    if (grade === undefined) return "";
    
    const percentage = (grade / maxScore) * 100;
    
    if (percentage >= 90) return "bg-green-50 hover:bg-green-100";
    if (percentage >= 75) return "bg-blue-50 hover:bg-blue-100";
    if (percentage >= 60) return "bg-yellow-50 hover:bg-yellow-100";
    if (percentage >= 40) return "bg-orange-50 hover:bg-orange-100";
    return "bg-red-50 hover:bg-red-100";
  };
  
  // Получаем цвет текста оценки
  const getGradeTextColor = (grade: number | undefined, maxScore: number) => {
    if (grade === undefined) return "";
    
    const percentage = (grade / maxScore) * 100;
    
    if (percentage >= 90) return "text-green-700";
    if (percentage >= 75) return "text-blue-700";
    if (percentage >= 60) return "text-yellow-700";
    if (percentage >= 40) return "text-orange-700";
    return "text-red-700";
  };

  return (
    <TooltipProvider>
      <div className="w-full overflow-auto">
        <Table className="border-collapse">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 font-bold">№</TableHead>
              <TableHead className="font-bold">Ученик</TableHead>
              {assignments.map((assignment) => (
                <TableHead 
                  key={assignment.id} 
                  className="text-center p-2 min-w-[100px] font-medium border-l border-l-gray-200"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="cursor-help">
                        <div className="font-bold truncate max-w-[120px]">
                          {assignment.title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Макс: {assignment.maxScore}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-sm">
                      <div className="font-medium">{assignment.title}</div>
                      {assignment.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {assignment.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline">Макс. балл: {assignment.maxScore}</Badge>
                        {assignment.dueDate && (
                          <Badge variant="outline">
                            Срок: {new Date(assignment.dueDate).toLocaleDateString('ru-RU')}
                          </Badge>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedStudents.map((student, index) => (
              <TableRow key={student.id}>
                <TableCell className="font-medium">{index + 1}</TableCell>
                <TableCell>
                  <div>{student.lastName} {student.firstName}</div>
                </TableCell>
                
                {assignments.map((assignment) => {
                  const grade = getGrade(student.id, assignment.id);
                  const key = `${student.id}-${assignment.id}`;
                  const isHovered = hoveredCell === key;
                  const cellColor = getCellColor(grade?.grade, assignment.maxScore);
                  const textColor = getGradeTextColor(grade?.grade, assignment.maxScore);
                  
                  return (
                    <TableCell 
                      key={`${student.id}-${assignment.id}`}
                      className={`text-center p-1 relative border-l border-l-gray-200 ${cellColor}`}
                      onMouseEnter={() => setHoveredCell(key)}
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      <div className="border border-dotted border-gray-300 rounded p-0.5">
                        <Input 
                          data-grade-input
                          data-student-id={student.id}
                          data-assignment-id={assignment.id}
                          type="text"
                          value={localGrades[key] || ''}
                          onChange={(e) => handleGradeChange(student.id, assignment.id, e.target.value)}
                          onBlur={() => handleGradeSubmit(student.id, assignment.id)}
                          onKeyDown={(e) => handleKeyDown(e, student.id, assignment.id)}
                          className={`h-7 text-center p-1 border-0 focus:ring-1 focus:ring-primary ${textColor}`}
                          placeholder=""
                          maxLength={assignment.maxScore >= 100 ? 3 : 2}
                          style={{ backgroundColor: 'transparent' }}
                        />
                      </div>
                      {grade && isHovered && (
                        <div className="absolute -top-1 -right-1 rounded-full flex items-center justify-center h-4 w-4 bg-primary z-10">
                          <span className="text-white text-[10px] font-bold">✓</span>
                        </div>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        
        <div className="mt-4 flex flex-wrap gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-100 rounded"></div>
            <span>90%-100%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-100 rounded"></div>
            <span>75%-89%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-yellow-100 rounded"></div>
            <span>60%-74%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-orange-100 rounded"></div>
            <span>40%-59%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-100 rounded"></div>
            <span>0%-39%</span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}