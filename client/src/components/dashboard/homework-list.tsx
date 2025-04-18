import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Homework } from "@shared/schema";
import { Badge } from "@/components/ui/badge";

export function HomeworkList() {
  const { user } = useAuth();
  
  const { data: homeworks = [], isLoading } = useQuery<Homework[]>({
    queryKey: ["/api/homework"],
    enabled: !!user
  });
  
  // Sort homeworks by due date - closest first
  const sortedHomeworks = [...homeworks].sort((a, b) => {
    const dateA = new Date(a.dueDate);
    const dateB = new Date(b.dueDate);
    return dateA.getTime() - dateB.getTime();
  });
  
  // Get only upcoming homeworks (due date is today or later)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const upcomingHomeworks = sortedHomeworks.filter(hw => {
    const dueDate = new Date(hw.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate >= today;
  }).slice(0, 5); // Show at most 5 items
  
  // Helper to get relative status text and color
  const getStatusInfo = (dueDate: string) => {
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return { text: "Срок: сегодня", variant: "destructive" as const };
    } else if (diffDays === 1) {
      return { text: "Срок: завтра", variant: "warning" as const };
    } else if (diffDays <= 3) {
      return { text: `Срок: ${diffDays} дня`, variant: "warning" as const };
    } else {
      return { text: `Срок: ${diffDays} дней`, variant: "default" as const };
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <h3 className="text-lg font-heading font-semibold text-gray-800 mb-4">Домашние задания</h3>
      
      {isLoading ? (
        <div className="text-center py-4 text-gray-500">Загрузка...</div>
      ) : upcomingHomeworks.length === 0 ? (
        <div className="text-center py-4 text-gray-500">Нет активных домашних заданий</div>
      ) : (
        <div className="space-y-3">
          {upcomingHomeworks.map((homework) => {
            const status = getStatusInfo(homework.dueDate);
            
            return (
              <div key={homework.id} className="flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-gray-900">{homework.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Сдать до: {new Date(homework.dueDate).toLocaleDateString('ru-RU')}
                  </p>
                </div>
                <Badge variant={status.variant} className="text-xs">
                  {status.text}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
      
      <div className="mt-4 text-center">
        <a href="/homework" className="text-sm text-primary hover:text-primary-dark">
          Все задания
        </a>
      </div>
    </div>
  );
}
