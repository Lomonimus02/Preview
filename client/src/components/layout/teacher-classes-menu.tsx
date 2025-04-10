import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import { Schedule, Class, Subject, Subgroup } from "@shared/schema";
import { ChevronDown, ChevronRight, BookOpen } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

// Формат для комбинации класса и предмета
interface ClassSubjectCombination {
  classId: number;
  className: string;
  subjectId: number;
  subjectName: string;
  // Добавляем поля для подгрупп
  subgroupId?: number;
  subgroupName?: string;
  isSubgroup?: boolean;
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
      // Добавляем console.log для отладки
      const data = await res.json();
      console.log("Teacher schedules:", data);
      return data;
    },
    enabled: !!user && isTeacher(),
    // Добавляем более частое обновление, чтобы новые уроки быстрее отображались в меню
    refetchInterval: 30000, // Проверка каждые 30 секунд
    refetchOnWindowFocus: true, // Обновление при фокусе окна
    staleTime: 5000 // Данные считаются устаревшими через 5 секунд
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
  
  // Получаем список всех подгрупп
  const { data: subgroups = [], isLoading: subgroupsLoading } = useQuery<Subgroup[]>({
    queryKey: ["/api/subgroups"],
    queryFn: async () => {
      const res = await apiRequest("/api/subgroups", "GET");
      if (!res.ok) throw new Error("Не удалось загрузить подгруппы");
      return res.json();
    },
    enabled: !!user && isTeacher()
  });

  // Создаем список уникальных комбинаций класс-предмет-подгруппа на основе расписания
  const classSubjectCombinations: ClassSubjectCombination[] = schedules
    .reduce((combinations, schedule) => {
      // Проверяем, что у расписания есть и класс, и предмет
      if (!schedule.classId || !schedule.subjectId) return combinations;

      // Найдем класс и предмет в соответствующих списках
      const classInfo = classes.find(c => c.id === schedule.classId);
      const subjectInfo = subjects.find(s => s.id === schedule.subjectId);

      // Если информация о классе или предмете не найдена, пропускаем
      if (!classInfo || !subjectInfo) return combinations;

      // Проверяем, есть ли подгруппа для этого расписания
      const subgroupId = schedule.subgroupId || undefined;

      // Находим информацию о подгруппе, если она указана
      const subgroupInfo = subgroupId !== undefined
        ? subgroups.find(sg => sg.id === subgroupId) 
        : null;

      // Для всех уроков добавляем стандартную комбинацию класс-предмет без подгруппы,
      // если её еще нет в списке
      const existingCombination = combinations.find(
        c => c.classId === schedule.classId && 
             c.subjectId === schedule.subjectId && 
             !c.isSubgroup
      );

      // Если комбинации нет в списке, добавляем
      if (!existingCombination) {
        combinations.push({
          classId: schedule.classId,
          className: classInfo.name,
          subjectId: schedule.subjectId,
          subjectName: subjectInfo.name,
          isSubgroup: false
        });
      }

      // Если это расписание с подгруппой, дополнительно добавляем его как отдельный пункт
      if (subgroupInfo) {
        console.log("Найдена подгруппа в расписании:", {
          scheduleId: schedule.id,
          subgroupId,
          subgroupName: subgroupInfo.name
        });
        
        // Проверяем, есть ли уже такая комбинация с подгруппой в списке
        const existingSubgroupCombination = combinations.find(
          c => c.classId === schedule.classId && 
               c.subjectId === schedule.subjectId && 
               c.subgroupId === subgroupId
        );

        // Если комбинации с подгруппой нет в списке, добавляем
        if (!existingSubgroupCombination) {
          combinations.push({
            classId: schedule.classId,
            className: classInfo.name,
            subjectId: schedule.subjectId,
            subjectName: subjectInfo.name,
            subgroupId: subgroupId,
            subgroupName: subgroupInfo.name,
            isSubgroup: true
          });
        }
      }

      return combinations;
    }, [] as ClassSubjectCombination[]);
    
  // Сортируем комбинации сначала по имени класса, затем по имени предмета, затем подгруппы вместе с их предметами
  classSubjectCombinations.sort((a, b) => {
    // Сначала сортируем по имени класса
    if (a.className !== b.className) {
      return a.className.localeCompare(b.className);
    }
    
    // Затем по предмету
    if (a.subjectName !== b.subjectName) {
      return a.subjectName.localeCompare(b.subjectName);
    }
    
    // Если один из элементов - подгруппа, а другой нет, ставим обычный предмет вперед
    if (a.isSubgroup !== b.isSubgroup) {
      return a.isSubgroup ? 1 : -1; // Обычные предметы идут первыми
    }
    
    // Если оба элемента - подгруппы, сортируем по имени подгруппы
    if (a.isSubgroup && b.isSubgroup && a.subgroupName && b.subgroupName) {
      return a.subgroupName.localeCompare(b.subgroupName);
    }
    
    return 0;
  });

  const isLoading = schedulesLoading || subjectsLoading || classesLoading || subgroupsLoading;
  
  // Проверяем, активна ли текущая комбинация класс/предмет/подгруппа
  const isItemActive = (classId: number, subjectId: number, subgroupId?: number) => {
    if (subgroupId) {
      return location === `/class-grade-details/${classId}/${subjectId}/${subgroupId}`;
    }
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
              <div
                key={`${item.classId}-${item.subjectId}${item.subgroupId ? `-${item.subgroupId}` : ''}`}
              >
                <Link 
                  href={item.isSubgroup && item.subgroupId 
                    ? `/class-grade-details/${item.classId}/${item.subjectId}/${item.subgroupId}`
                    : `/class-grade-details/${item.classId}/${item.subjectId}`
                  }
                >
                  <div 
                    className={cn(
                      "flex items-center text-sm py-1.5 px-3 rounded-md w-full cursor-pointer",
                      isItemActive(item.classId, item.subjectId, item.subgroupId) 
                        ? "bg-accent/50 text-accent-foreground" 
                        : "hover:bg-muted text-foreground/80",
                      item.isSubgroup 
                        ? "ml-4 text-sm border-l-2 pl-4 border-muted-foreground/20" 
                        : "" // Стильное оформление для подгрупп
                    )}
                  >
                    <span className="truncate">
                      {item.isSubgroup && item.subgroupName 
                        ? `${item.subgroupName} - ${item.className}`
                        : `${item.subjectName} - ${item.className}`
                      }
                    </span>
                  </div>
                </Link>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}