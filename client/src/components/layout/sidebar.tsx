import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboardIcon,
  UsersIcon,
  BookOpenIcon,
  CalendarIcon,
  ClipboardListIcon,
  GraduationCapIcon,
  MessageSquareIcon,
  FileTextIcon,
  BarChartIcon,
  SettingsIcon,
  BellIcon,
  HelpCircleIcon,
  UserPlusIcon,
  BuildingIcon,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { UserRoleEnum } from "@shared/schema";
import { RoleSwitcher } from "@/components/role-switcher";

interface SidebarProps {
  isOpen: boolean;
}

export function Sidebar({ isOpen }: SidebarProps) {
  const [location] = useLocation();
  const { user } = useAuth();

  // Maps user roles to which menu items they can see
  const roleAccess = {
    [UserRoleEnum.SUPER_ADMIN]: ["dashboard", "schools", "users", "user-roles", "analytics", "messages", "notifications", "settings", "support"],
    [UserRoleEnum.SCHOOL_ADMIN]: ["dashboard", "users", "user-roles", "schedule", "homework", "grades", "analytics", "messages", "notifications", "settings", "support"],
    [UserRoleEnum.TEACHER]: ["dashboard", "schedule", "homework", "messages", "documents", "support"],
    [UserRoleEnum.STUDENT]: ["dashboard", "schedule", "homework", "grades", "messages", "documents", "support"],
    [UserRoleEnum.PARENT]: ["dashboard", "grades", "messages", "documents", "support"],
    [UserRoleEnum.PRINCIPAL]: ["dashboard", "users", "schedule", "grades", "analytics", "messages", "documents", "settings", "support"],
    [UserRoleEnum.VICE_PRINCIPAL]: ["dashboard", "users", "schedule", "grades", "analytics", "messages", "documents", "settings", "support"]
  };

  const navItems = [
    { id: "dashboard", label: "Главная", icon: <LayoutDashboardIcon className="h-4 w-4 mr-3" />, href: "/" },
    { id: "schools", label: "Школы", icon: <BuildingIcon className="h-4 w-4 mr-3" />, href: "/schools" },
    { id: "users", label: "Пользователи", icon: <UsersIcon className="h-4 w-4 mr-3" />, href: "/users" },
    { id: "user-roles", label: "Роли", icon: <UserPlusIcon className="h-4 w-4 mr-3" />, href: "/user-roles" },
    { id: "schedule", label: "Расписание", icon: <CalendarIcon className="h-4 w-4 mr-3" />, href: "/schedule" },
    { id: "homework", label: "Домашние задания", icon: <BookOpenIcon className="h-4 w-4 mr-3" />, href: "/homework" },
    { id: "grades", label: "Оценки", icon: <ClipboardListIcon className="h-4 w-4 mr-3" />, href: "/grades" },
    { id: "messages", label: "Сообщения", icon: <MessageSquareIcon className="h-4 w-4 mr-3" />, href: "/messages" },
    { id: "documents", label: "Документы", icon: <FileTextIcon className="h-4 w-4 mr-3" />, href: "/documents" },
    { id: "analytics", label: "Аналитика", icon: <BarChartIcon className="h-4 w-4 mr-3" />, href: "/analytics" },
    { id: "notifications", label: "Уведомления", icon: <BellIcon className="h-4 w-4 mr-3" />, href: "/notifications" },
    { id: "settings", label: "Настройки", icon: <SettingsIcon className="h-4 w-4 mr-3" />, href: "/settings" },
    { id: "support", label: "Поддержка", icon: <HelpCircleIcon className="h-4 w-4 mr-3" />, href: "/support" }
  ];

  // Filter nav items based on user's active role (or default role if active not set)
  const userRole = user?.activeRole || user?.role || UserRoleEnum.STUDENT;
  const allowedItems = navItems.filter(item =>
    roleAccess[userRole]?.includes(item.id)
  );

  const sidebarClass = isOpen
    ? "fixed inset-0 z-40 md:relative w-64 md:translate-x-0 transform transition duration-200 ease-in-out"
    : "fixed inset-0 z-40 md:relative w-64 -translate-x-full md:translate-x-0 transform transition duration-200 ease-in-out";

  // Role display names in Russian
  const roleNames = {
    [UserRoleEnum.SUPER_ADMIN]: "Супер-админ",
    [UserRoleEnum.SCHOOL_ADMIN]: "Администратор школы",
    [UserRoleEnum.TEACHER]: "Учитель",
    [UserRoleEnum.STUDENT]: "Ученик",
    [UserRoleEnum.PARENT]: "Родитель",
    [UserRoleEnum.PRINCIPAL]: "Директор",
    [UserRoleEnum.VICE_PRINCIPAL]: "Завуч"
  };

  return (
    <aside className={sidebarClass}>
      <div className="h-full bg-white border-r">
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center">
              <Avatar className="h-10 w-10 border-2 border-primary-50">
                <AvatarFallback className="bg-primary text-white">
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-800">{user?.firstName} {user?.lastName}</p>
                <p className="text-xs text-gray-500">{roleNames[userRole]}</p>
              </div>
            </div>

            {/* Переключатель ролей */}
            <div className="mt-3">
              <RoleSwitcher />
            </div>
          </div>
          <nav className="space-y-1 px-2 py-4">
            {allowedItems.map((item) => (
              <Link key={item.id} href={item.href}>
                <a
                  className={cn(
                    "flex items-center px-2 py-2 text-sm font-medium rounded-md hover:bg-gray-50 hover:text-gray-900",
                    location === item.href
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-700"
                  )}
                >
                  {item.icon}
                  {item.label}
                </a>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </aside>
  );
}