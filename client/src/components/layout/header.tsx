import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { BellIcon, ChevronDownIcon, Menu } from "lucide-react";
import { Link } from "wouter";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Notification } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";

interface HeaderProps {
  toggleSidebar: () => void;
}

export function Header({ toggleSidebar }: HeaderProps) {
  const { user, logoutMutation } = useAuth();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user
  });

  const unreadNotifications = notifications.filter(notification => !notification.isRead);
  
  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const markNotificationAsRead = async (id: number) => {
    await apiRequest("POST", `/api/notifications/${id}/read`);
    queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
  };

  return (
    <header className="bg-white shadow-sm z-10">
      <div className="flex justify-between items-center px-4 py-3">
        <div className="flex items-center">
          <button onClick={toggleSidebar} className="md:hidden mr-2 text-gray-700">
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center">
            <span className="material-icons text-primary-dark mr-2">school</span>
            <h1 className="text-xl font-heading font-bold text-gray-800">Электронный дневник</h1>
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <DropdownMenu open={notificationsOpen} onOpenChange={setNotificationsOpen}>
            <DropdownMenuTrigger className="relative focus:outline-none">
              <BellIcon className="h-5 w-5 text-gray-600" />
              {unreadNotifications.length > 0 && (
                <Badge variant="destructive" className="absolute -top-1 -right-1 h-2 w-2 p-0 rounded-full"/>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel className="bg-primary-50 text-gray-800">Уведомления</DropdownMenuLabel>
              <div className="max-h-[320px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-4 px-2 text-center text-gray-500 text-sm">
                    Нет новых уведомлений
                  </div>
                ) : (
                  notifications.map(notification => (
                    <div 
                      key={notification.id} 
                      className={`px-4 py-3 hover:bg-gray-50 cursor-pointer ${!notification.isRead ? 'bg-primary-50 bg-opacity-40' : ''}`}
                      onClick={() => markNotificationAsRead(notification.id)}
                    >
                      <p className="text-sm font-medium text-gray-800">{notification.title}</p>
                      <p className="text-xs text-gray-500">{notification.content}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(notification.createdAt).toLocaleString('ru-RU')}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <DropdownMenuSeparator />
              <div className="px-4 py-2 text-center">
                <Link href="/notifications" className="text-sm text-primary hover:text-primary-dark" onClick={() => setNotificationsOpen(false)}>Все уведомления</Link>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center focus:outline-none">
              <Avatar className="h-8 w-8 border-2 border-primary-50">
                <AvatarFallback className="bg-primary text-white">
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <span className="ml-2 text-sm font-medium text-gray-700 hidden md:block">
                {user?.firstName} {user?.lastName}
              </span>
              <ChevronDownIcon className="h-4 w-4 text-gray-600 ml-1" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="cursor-pointer">
                <span className="material-icons text-sm mr-2">person</span>
                Профиль
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer">
                <span className="material-icons text-sm mr-2">settings</span>
                Настройки
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer" onClick={handleLogout}>
                <span className="material-icons text-sm mr-2">logout</span>
                Выйти
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
