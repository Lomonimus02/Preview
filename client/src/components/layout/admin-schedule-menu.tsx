import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import { Class } from "@shared/schema";
import { ChevronDown, ChevronRight, CalendarIcon } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

export function AdminScheduleMenu() {
  const { user } = useAuth();
  const { isSchoolAdmin } = useRoleCheck();
  const [location] = useLocation();
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Определяем, активна ли страница с расписанием
  const isActive = location.startsWith('/schedule');
  
  // Если страница активна, автоматически раскрываем меню
  useEffect(() => {
    if (isActive) {
      setIsExpanded(true);
    }
  }, [isActive]);

  // Получаем информацию о школе администратора
  const { data: user_info } = useQuery({
    queryKey: ["/api/user"],
    enabled: !!user && isSchoolAdmin()
  });

  // Получаем список классов для школы администратора
  const { data: classes = [], isLoading: classesLoading } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
    queryFn: async () => {
      if (!user) return [];
      
      // Определяем schoolId
      let schoolId: number | null = null;
      
      // Пытаемся получить schoolId из профиля пользователя или из его ролей
      console.log("Проверка роли администратора школы...");
      if (user.schoolId) {
        console.log("schoolId из профиля:", user.schoolId);
        schoolId = user.schoolId;
      } else if (user.activeRole?.schoolId) {
        console.log("schoolId из роли:", user.activeRole.schoolId);
        schoolId = user.activeRole.schoolId;
      }
      
      console.log("Используемый schoolId:", schoolId);
      
      // Если ID школы не найден, пытаемся получить первую доступную школу для админа
      if (!schoolId) {
        console.log("Не найден ID школы для администратора");
        const schoolsResponse = await apiRequest("/api/schools", "GET");
        if (schoolsResponse.ok) {
          const schools = await schoolsResponse.json();
          if (schools && schools.length > 0) {
            console.log("Доступные школы:", schools.map((s: any) => `${s.id}: ${s.name}`).join(', '));
            schoolId = schools[0].id;
            console.log("Использование первой доступной школы:", schoolId, schools[0].name);
          }
        }
      }
      
      if (!schoolId) {
        console.error("Не удалось определить ID школы для администратора");
        return [];
      }
      
      // Загружаем классы для конкретной школы
      const res = await apiRequest(`/api/classes?schoolId=${schoolId}`, "GET");
      if (!res.ok) throw new Error("Не удалось загрузить классы");
      const data = await res.json();
      return data;
    },
    enabled: !!user && isSchoolAdmin(),
    // Добавляем обновление, чтобы новые классы быстрее отображались в меню
    refetchInterval: 60000, // Проверка каждую минуту
    refetchOnWindowFocus: true
  });

  // Проверяем, активна ли страница расписания для конкретного класса
  const isClassScheduleActive = (classId: number) => {
    return location === `/schedule/class/${classId}`;
  };

  // Проверяем, активна ли страница общего расписания
  const isGeneralScheduleActive = () => {
    return location === '/schedule/general';
  };

  // Сортируем классы по имени
  const sortedClasses = [...classes].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="relative mb-2">
      {/* Основной пункт меню "Расписание" */}
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
          <CalendarIcon className="h-4 w-4 mr-3" />
        </span>
        <span className="truncate flex-1">Расписание</span>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </div>

      {/* Выпадающее меню с классами и общим расписанием */}
      {isExpanded && (
        <div className="ml-6 mt-1 space-y-1">
          {/* Пункт "Общее расписание" */}
          <Link href="/schedule/general">
            <div 
              className={cn(
                "flex items-center text-sm py-1.5 px-3 rounded-md w-full cursor-pointer",
                isGeneralScheduleActive() 
                  ? "bg-accent/50 text-accent-foreground" 
                  : "hover:bg-muted text-foreground/80"
              )}
            >
              <span className="truncate">Общее расписание</span>
            </div>
          </Link>
          
          {/* Список классов */}
          {classesLoading ? (
            <div className="text-sm text-muted-foreground py-1 px-3">Загрузка классов...</div>
          ) : sortedClasses.length === 0 ? (
            <div className="text-sm text-muted-foreground py-1 px-3">Нет доступных классов</div>
          ) : (
            sortedClasses.map((classItem) => (
              <div key={classItem.id}>
                <Link href={`/schedule/class/${classItem.id}`}>
                  <div 
                    className={cn(
                      "flex items-center text-sm py-1.5 px-3 rounded-md w-full cursor-pointer",
                      isClassScheduleActive(classItem.id) 
                        ? "bg-accent/50 text-accent-foreground" 
                        : "hover:bg-muted text-foreground/80"
                    )}
                  >
                    <span className="truncate">{classItem.name}</span>
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