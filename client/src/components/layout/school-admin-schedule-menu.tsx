import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FiCalendar } from "react-icons/fi";

/**
 * Компонент меню расписания для администратора школы.
 * Отображает выпадающее меню с классами для быстрого перехода к расписанию конкретного класса,
 * а также пункт "Общее расписание" для просмотра расписания всей школы.
 */
export const SchoolAdminScheduleMenu: React.FC = () => {
  const { user } = useAuth();
  const { isSchoolAdmin } = useRoleCheck();
  const [schoolId, setSchoolId] = useState<number | null>(null);

  // Получаем ID школы администратора
  const getSchoolId = () => {
    if (!user) return null;
    
    // Если у пользователя есть явно указанная школа в профиле
    if (user.schoolId) return user.schoolId;
    
    // Если у пользователя есть роль школьного администратора с привязкой к школе
    const schoolAdminRole = user.userRoles?.find((roleObj: any) => 
      roleObj.role === "school_admin" && roleObj.schoolId
    );
    
    if (schoolAdminRole?.schoolId) return schoolAdminRole.schoolId;
    
    // Если школа не найдена в профиле и ролях, проверяем доступные школы
    // и берем первую
    return null;
  };

  // Загрузка списка школ
  const { data: schools = [] } = useQuery<any[]>({
    queryKey: ["/api/schools"],
    enabled: !!user && isSchoolAdmin()
  });

  // Загрузка списка классов школы администратора
  const { data: classes = [] } = useQuery<any[]>({
    queryKey: ["/api/classes"],
    enabled: !!user && isSchoolAdmin()
  });

  useEffect(() => {
    // Обновляем ID школы при загрузке данных пользователя
    const id = getSchoolId();
    if (id) {
      setSchoolId(id);
    } else if (schools.length > 0) {
      // Если школа не указана явно, берем первую доступную
      setSchoolId(schools[0].id);
    }
  }, [user, schools]);

  // Фильтруем классы только для школы администратора
  const schoolClasses = classes.filter(cls => cls.schoolId === schoolId);

  // Проверка активного маршрута для выделения активного пункта меню
  const [location] = useLocation();
  
  // Определяем, активна ли страница расписания
  const isActive = location.startsWith('/schedule-') || location === '/schedule';
  
  // Состояние для отображения/скрытия выпадающего списка
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Проверяем, активна ли конкретная страница расписания
  const isItemActive = (path: string) => {
    return location === path;
  };
  
  // Импортируем утилиту для условных классов
  const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');

  return (
    <div className="relative mb-2">
      {/* Основной пункт меню "Расписание" - такой же стиль, как у других пунктов меню */}
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
          <FiCalendar className="h-4 w-4 mr-3" />
        </span>
        <span className="flex-1">Расписание</span>
        <svg
          className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      </div>
      
      {/* Выпадающий список - отображается, когда isExpanded === true */}
      {isExpanded && (
        <div className="mt-1 pl-2 space-y-1 transition-all duration-200">
          <div>
            <Link to="/schedule-overall">
              <div 
                className={cn(
                  "flex items-center text-sm py-1.5 px-3 rounded-md w-full cursor-pointer",
                  isItemActive('/schedule-overall') 
                    ? "bg-accent/50 text-accent-foreground" 
                    : "hover:bg-muted text-foreground/80"
                )}
              >
                <span className="truncate">Общее расписание</span>
              </div>
            </Link>
          </div>
          
          <div className="pt-1 pb-1">
            <div className="text-xs text-gray-500 px-3 py-1 uppercase">Классы</div>
            
            {schoolClasses.length === 0 ? (
              <div className="text-sm text-muted-foreground py-1 px-3">Нет доступных классов</div>
            ) : (
              schoolClasses.sort((a, b) => a.name.localeCompare(b.name)).map(cls => (
                <div key={cls.id}>
                  <Link href={`/schedule-class/${cls.id}`}>
                    <div 
                      className={cn(
                        "flex items-center text-sm py-1.5 px-3 rounded-md w-full cursor-pointer",
                        isItemActive(`/schedule-class/${cls.id}`) 
                          ? "bg-accent/50 text-accent-foreground" 
                          : "hover:bg-muted text-foreground/80"
                      )}
                    >
                      <span className="truncate">{cls.name}</span>
                    </div>
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};