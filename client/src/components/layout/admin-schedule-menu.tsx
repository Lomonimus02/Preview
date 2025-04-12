import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, CalendarIcon } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Class, UserRoleEnum } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export function AdminScheduleMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [location] = useLocation();
  const { user } = useAuth();
  
  // При переходе на другую страницу, закрываем меню
  useEffect(() => {
    setIsOpen(false);
  }, [location]);

  // Загружаем список классов школы
  const { data: schools = [] } = useQuery({
    queryKey: ["/api/schools"],
    enabled: user?.activeRole === UserRoleEnum.SCHOOL_ADMIN || 
             user?.activeRole === UserRoleEnum.PRINCIPAL || 
             user?.activeRole === UserRoleEnum.VICE_PRINCIPAL
  });

  // Находим ID школы для текущего пользователя
  const getSchoolId = () => {
    // Проверяем, является ли пользователь администратором школы
    if (user?.activeRole === UserRoleEnum.SCHOOL_ADMIN || 
        user?.activeRole === UserRoleEnum.PRINCIPAL || 
        user?.activeRole === UserRoleEnum.VICE_PRINCIPAL) {
      
      // Пытаемся найти ID школы из профиля пользователя
      if (user.schoolId) {
        return user.schoolId;
      }

      // Если ID школы не найден в профиле, и есть доступные школы,
      // используем первую доступную школу
      if (schools.length > 0) {
        console.log("Используем первую доступную школу:", schools[0].id, schools[0].name);
        return schools[0].id;
      }
    }
    
    return null;
  };

  const schoolId = getSchoolId();

  // Загружаем список классов школы
  const { data: classes = [] } = useQuery<Class[]>({
    queryKey: ["/api/classes", { schoolId }],
    enabled: !!schoolId
  });

  // Сортировка классов по номеру и букве
  const sortedClasses = [...classes].sort((a, b) => {
    const aName = a.name || "";
    const bName = b.name || "";
    
    // Извлекаем числовую часть имени класса (например, "10" из "10А")
    const aNumMatch = aName.match(/^(\d+)/);
    const bNumMatch = bName.match(/^(\d+)/);
    
    const aNum = aNumMatch ? parseInt(aNumMatch[1]) : 0;
    const bNum = bNumMatch ? parseInt(bNumMatch[1]) : 0;
    
    // Сначала сортируем по числу
    if (aNum !== bNum) {
      return aNum - bNum;
    }
    
    // При одинаковых числах сортируем по букве
    return aName.localeCompare(bName);
  });

  // Проверяем, является ли текущий путь активным
  const isLinkActive = (href: string) => {
    return location === href || (href !== "/" && location.startsWith(href));
  };

  // Проверяем, должно ли меню быть открытым на основе текущего пути
  useEffect(() => {
    // Если текущий путь начинается с "/schedule", открываем меню
    if (location.startsWith("/schedule")) {
      setIsOpen(true);
    }
  }, [location]);

  // Если у пользователя нет нужной роли или нет доступных классов, не показываем меню
  if (
    !user ||
    !(
      user.activeRole === UserRoleEnum.SCHOOL_ADMIN ||
      user.activeRole === UserRoleEnum.PRINCIPAL ||
      user.activeRole === UserRoleEnum.VICE_PRINCIPAL
    )
  ) {
    return null;
  }

  return (
    <div className="mb-2">
      {/* Кнопка меню */}
      <button
        className={cn(
          "w-full group flex items-center px-2 py-2 text-sm font-medium rounded-md",
          isOpen || location.includes("/schedule")
            ? "bg-primary text-white"
            : "text-gray-700 hover:bg-primary-50 hover:text-gray-900"
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span
          className={cn(
            "mr-3",
            isOpen || location.includes("/schedule")
              ? "text-white"
              : "text-gray-500 group-hover:text-gray-700"
          )}
        >
          <CalendarIcon className="h-4 w-4" />
        </span>
        <span className="flex-1 text-left">Расписание</span>
        {isOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>

      {/* Выпадающий список */}
      {isOpen && (
        <div className="pl-8 mt-1 space-y-1">
          <Link href="/schedule/general">
            <div
              className={cn(
                "group flex items-center px-3 py-1.5 text-sm font-medium rounded-md",
                isLinkActive("/schedule/general")
                  ? "bg-primary/10 text-primary"
                  : "text-gray-700 hover:bg-primary-50 hover:text-gray-900"
              )}
            >
              Общее расписание
            </div>
          </Link>

          {/* Список классов */}
          <div className="mt-2">
            <div className="px-3 py-1 text-xs uppercase text-gray-500 font-semibold">
              Классы
            </div>
            <div className="space-y-1 mt-1">
              {sortedClasses.map((classItem) => (
                <Link
                  key={classItem.id}
                  href={`/schedule-class/${classItem.id}`}
                >
                  <div
                    className={cn(
                      "group flex items-center px-3 py-1.5 text-sm font-medium rounded-md",
                      isLinkActive(`/schedule-class/${classItem.id}`)
                        ? "bg-primary/10 text-primary"
                        : "text-gray-700 hover:bg-primary-50 hover:text-gray-900"
                    )}
                  >
                    {classItem.name}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}