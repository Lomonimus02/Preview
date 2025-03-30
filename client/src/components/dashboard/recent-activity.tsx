import { ActivityItem } from "./activity-item";
import { UserPlusIcon, PencilIcon, RefreshCwIcon, LogInIcon } from "lucide-react";
import { Link } from "wouter";

export function RecentActivity() {
  const activities = [
    {
      icon: UserPlusIcon,
      title: "Добавлен новый пользователь",
      description: "Иванов И. И.",
      time: "2 часа назад"
    },
    {
      icon: PencilIcon,
      title: "Изменено расписание в",
      description: "Школа №1",
      time: "3 часа назад"
    },
    {
      icon: RefreshCwIcon,
      title: "Обновление системы до версии",
      description: "2.4.0",
      time: "5 часов назад"
    },
    {
      icon: LogInIcon,
      title: "Вход администратора",
      description: "Петров И. И.",
      time: "6 часов назад"
    }
  ];
  
  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <h3 className="text-lg font-heading font-semibold text-gray-800 mb-4">Последние действия</h3>
      <div className="space-y-3">
        {activities.map((activity, index) => (
          <ActivityItem 
            key={index}
            icon={activity.icon}
            title={activity.title}
            description={activity.description}
            time={activity.time}
          />
        ))}
      </div>
      <div className="mt-4 text-center">
        <Link href="/system-logs" className="text-sm text-primary hover:text-primary-dark hover:underline">
          Все действия
        </Link>
      </div>
    </div>
  );
}
