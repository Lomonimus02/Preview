import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { CalendarIcon, ChevronDown, ChevronRight, LayoutDashboard } from "lucide-react";
import { Class } from "@shared/schema";
import { cn } from "@/lib/utils";

export function SchoolAdminScheduleMenu() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [location] = useLocation();
  const { user } = useAuth();
  
  // Проверяем, активен ли какой-либо элемент в расписании
  const isActive = location.startsWith("/schedule");
  
  // Автоматически раскрываем меню, если мы находимся на странице расписания
  useEffect(() => {
    if (isActive) {
      setIsExpanded(true);
    }
  }, [isActive]);
  
  // Определение ID школы для запроса классов
  const getSchoolId = () => {
    // Если у пользователя есть schoolId в профиле, используем его
    if (user?.schoolId) return user.schoolId;
    
    // Иначе считаем что ID школы можно получить из другого места
    // В реальной системе здесь может быть более сложная логика
    return 2; // Используем значение по умолчанию, если ничего не найдено
  };
  
  // Запрашиваем классы школы администратора
  const { data: classes = [], isLoading } = useQuery<Class[]>({
    queryKey: ["/api/classes", { schoolId: getSchoolId() }],
    enabled: !!user,
  });
  
  return (
    <div className="mb-2">
      <div 
        className={cn(
          "flex items-center px-3 py-2 rounded-md cursor-pointer text-sm",
          isActive ? "bg-primary text-primary-foreground" : "hover:bg-accent text-muted-foreground"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <CalendarIcon className="h-4 w-4 mr-3" />
        <span className="flex-grow">Расписание</span>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </div>
      
      {isExpanded && (
        <div className="ml-8 mt-2 space-y-2">
          {/* Ссылка на общее расписание */}
          <Link href="/schedule/overall">
            <a className={cn(
              "flex items-center px-3 py-2 rounded-md text-sm",
              location === "/schedule/overall" 
                ? "bg-primary/80 text-primary-foreground" 
                : "hover:bg-accent text-muted-foreground"
            )}>
              <LayoutDashboard className="h-4 w-4 mr-2" />
              <span>Общее расписание</span>
            </a>
          </Link>
          
          {/* Динамический список классов */}
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Загрузка классов...</div>
          ) : classes.length > 0 ? (
            classes.map((classItem) => (
              <Link key={classItem.id} href={`/schedule/class/${classItem.id}`}>
                <a className={cn(
                  "flex items-center px-3 py-2 rounded-md text-sm",
                  location === `/schedule/class/${classItem.id}` 
                    ? "bg-primary/80 text-primary-foreground" 
                    : "hover:bg-accent text-muted-foreground"
                )}>
                  <span>{classItem.name}</span>
                </a>
              </Link>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">Классы не найдены</div>
          )}
        </div>
      )}
    </div>
  );
}