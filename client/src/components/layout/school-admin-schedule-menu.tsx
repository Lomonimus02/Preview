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
    const schoolAdminRole = user.roles?.find(role => 
      role.role === "school_admin" && role.schoolId
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 p-2 rounded-md transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
        <FiCalendar className="w-5 h-5" />
        <span>Расписание</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Расписание школы</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to="/schedule-overall" className="cursor-pointer">
            Общее расписание
          </Link>
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Расписание классов</DropdownMenuLabel>
        
        {schoolClasses.length === 0 ? (
          <DropdownMenuItem disabled>
            Нет доступных классов
          </DropdownMenuItem>
        ) : (
          schoolClasses.sort((a, b) => a.name.localeCompare(b.name)).map(cls => (
            <DropdownMenuItem key={cls.id} asChild>
              <Link to={`/schedule-class/${cls.id}`} className="cursor-pointer">
                {cls.name}
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};