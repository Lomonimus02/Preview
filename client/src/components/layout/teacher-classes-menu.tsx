import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import { Schedule, Class, Subject } from "@shared/schema";
import { ChevronDown, ChevronRight, BookOpen } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

// Формат для комбинации класса и предмета
interface ClassSubjectCombination {
  classId: number;
  className: string;
  subjectId: number;
  subjectName: string;
}

export function TeacherClassesMenu() {
  const { user } = useAuth();
  const { isTeacher } = useRoleCheck();
  const [location] = useLocation();
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Определяем, активна ли страница с классами
  const isActive = location.startsWith('/teacher-classes') || 
                   location.startsWith('/class-grade-details');
  
  // Если страница активна, автоматически раскрываем меню
  useEffect(() => {
    if (isActive) {
      setIsExpanded(true);
    }
  }, [isActive]);

  // Получаем расписания, в которых преподаватель ведет занятия
  const { data: schedules = [], isLoading: schedulesLoading } = useQuery<Schedule[]>({
    queryKey: ["/api/schedules", { teacherId: user?.id }],
    queryFn: async () => {
      const res = await apiRequest(`/api/schedules?teacherId=${user?.id}`, "GET");
      if (!res.ok) throw new Error("Не удалось загрузить расписание");
      return res.json();
    },
    enabled: !!user && isTeacher()
  });

  // Получаем список предметов, которые преподает учитель
  const { data: subjects = [], isLoading: subjectsLoading } = useQuery<Subject[]>({
    queryKey: ["/api/teacher-subjects", user?.id],
    queryFn: async () => {
      const res = await apiRequest(`/api/teacher-subjects/${user?.id}`, "GET");
      if (!res.ok) throw new Error("Не удалось загрузить предметы");
      return res.json();
    },
    enabled: !!user && isTeacher()
  });

  // Получаем список классов
  const { data: classes = [], isLoading: classesLoading } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
    enabled: !!user && isTeacher()
  });

  // Создаем список уникальных комбинаций класс-предмет на основе расписания
  const classSubjectCombinations: ClassSubjectCombination[] = schedules
    .reduce((combinations, schedule) => {
      // Проверяем, что у расписания есть и класс, и предмет
      if (!schedule.classId || !schedule.subjectId) return combinations;

      // Найдем класс и предмет в соответствующих списках
      const classInfo = classes.find(c => c.id === schedule.classId);
      const subjectInfo = subjects.find(s => s.id === schedule.subjectId);

      // Если информация о классе или предмете не найдена, пропускаем
      if (!classInfo || !subjectInfo) return combinations;

      // Проверяем, есть ли уже такая комбинация в списке
      const existingCombination = combinations.find(
        c => c.classId === schedule.classId && c.subjectId === schedule.subjectId
      );

      // Если комбинации нет в списке, добавляем
      if (!existingCombination) {
        combinations.push({
          classId: schedule.classId,
          className: classInfo.name,
          subjectId: schedule.subjectId,
          subjectName: subjectInfo.name
        });
      }

      return combinations;
    }, [] as ClassSubjectCombination[]);
    
  // Сортируем комбинации сначала по имени класса, затем по имени предмета
  classSubjectCombinations.sort((a, b) => {
    if (a.className !== b.className) {
      return a.className.localeCompare(b.className);
    }
    return a.subjectName.localeCompare(b.subjectName);
  });

  const isLoading = schedulesLoading || subjectsLoading || classesLoading;
  
  // Проверяем, активна ли текущая комбинация класс/предмет
  const isItemActive = (classId: number, subjectId: number) => {
    return location === `/class-grade-details/${classId}/${subjectId}`;
  };

  return (
    <div className="relative mb-2">
      {/* Основной пункт меню "Мои классы" */}
      <div
        className={cn(
          "group flex items-center px-2 py-2 text-sm font-medium rounded-md cursor-pointer w-full",
          isActive 
            ? "bg-primary text-white" 
            : "text-gray-700 hover:bg-primary-50 hover:text-gray-900"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className={cn(
          isActive 
            ? "text-white" 
            : "text-gray-500 group-hover:text-gray-700"
        )}>
          <BookOpen className="h-4 w-4 mr-3" />
        </span>
        <span className="truncate flex-1">Мои классы</span>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </div>

      {/* Выпадающее меню с классами и предметами */}
      {isExpanded && (
        <div className="ml-6 mt-1 space-y-1">
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-1 px-3">Загрузка...</div>
          ) : classSubjectCombinations.length === 0 ? (
            <div className="text-sm text-muted-foreground py-1 px-3">Нет назначенных классов</div>
          ) : (
            classSubjectCombinations.map((item) => (
              <Link 
                key={`${item.classId}-${item.subjectId}`} 
                href={`/class-grade-details/${item.classId}/${item.subjectId}`}
              >
                <a 
                  className={cn(
                    "flex items-center text-sm py-1.5 px-3 rounded-md w-full",
                    isItemActive(item.classId, item.subjectId) 
                      ? "bg-accent/50 text-accent-foreground" 
                      : "hover:bg-muted text-foreground/80"
                  )}
                >
                  <span className="truncate">
                    {item.subjectName} - {item.className}
                  </span>
                </a>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}