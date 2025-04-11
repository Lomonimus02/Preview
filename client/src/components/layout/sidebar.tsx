import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  HomeIcon, 
  BookIcon, 
  Users2Icon, 
  BarChartIcon, 
  BellIcon, 
  SettingsIcon, 
  HelpCircleIcon, 
  BuildingIcon,
  CalendarIcon,
  GraduationCapIcon,
  NotebookPenIcon,
  MessagesSquareIcon,
  FolderIcon,
  UserCogIcon,
  UserPlusIcon,
  UsersIcon,
  ClipboardListIcon
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { UserRoleEnum } from "@shared/schema";
import { RoleSwitcher } from "@/components/role-switcher";
import { TeacherClassesMenu } from "./teacher-classes-menu";
import { ReactNode } from "react";

interface LinkMenuItem {
  id: string;
  label: string;
  icon: ReactNode;
  href: string;
}

interface ComponentMenuItem {
  id: string;
  component: ReactNode;
}

type NavItem = LinkMenuItem | ComponentMenuItem;

interface SidebarProps {
  isOpen: boolean;
}

export function Sidebar({ isOpen }: SidebarProps) {
  const [location] = useLocation();
  const { user } = useAuth();

  // Maps user roles to which menu items they can see
  const roleAccess = {
    [UserRoleEnum.SUPER_ADMIN]: ["dashboard", "schools", "users", "user-roles", "subgroups", "analytics", "messages", "notifications", "settings", "support"],
    [UserRoleEnum.SCHOOL_ADMIN]: ["dashboard", "users", "user-roles", "subgroups", "schedule", "homework", "grades", "analytics", "messages", "notifications", "settings", "support"],
    [UserRoleEnum.TEACHER]: ["dashboard", "teacher-classes-menu", "schedule", "homework", "messages", "documents", "support"],
    [UserRoleEnum.CLASS_TEACHER]: ["dashboard", "class-teacher-dashboard", "schedule", "homework", "grades", "messages", "documents", "support"],
    [UserRoleEnum.STUDENT]: ["dashboard", "schedule", "homework", "grades", "messages", "documents", "support"],
    [UserRoleEnum.PARENT]: ["dashboard", "grades", "messages", "documents", "support"],
    [UserRoleEnum.PRINCIPAL]: ["dashboard", "users", "schedule", "grades", "analytics", "messages", "documents", "settings", "support"],
    [UserRoleEnum.VICE_PRINCIPAL]: ["dashboard", "users", "schedule", "grades", "analytics", "messages", "documents", "settings", "support"]
  };

  // Navigation items
  const navItems: NavItem[] = [
    { id: "dashboard", label: "Главная", icon: <HomeIcon className="h-4 w-4 mr-3" />, href: "/" },
    { id: "class-teacher-dashboard", label: "Панель классного руководителя", icon: <UsersIcon className="h-4 w-4 mr-3" />, href: "/class-teacher-dashboard" },
    { id: "teacher-classes-menu", component: <TeacherClassesMenu /> },
    { id: "schools", label: "Школы", icon: <BuildingIcon className="h-4 w-4 mr-3" />, href: "/schools" },
    { id: "users", label: "Пользователи", icon: <Users2Icon className="h-4 w-4 mr-3" />, href: "/users" },
    { id: "user-roles", label: "Роли пользователей", icon: <UserCogIcon className="h-4 w-4 mr-3" />, href: "/user-roles" },
    { id: "subgroups", label: "Подгруппы", icon: <UserPlusIcon className="h-4 w-4 mr-3" />, href: "/subgroups" },
    { id: "schedule", label: "Расписание", icon: <CalendarIcon className="h-4 w-4 mr-3" />, href: "/schedule" },
    { id: "grades", label: "Оценки", icon: <GraduationCapIcon className="h-4 w-4 mr-3" />, href: "/grades" },
    { id: "homework", label: "Домашние задания", icon: <BookIcon className="h-4 w-4 mr-3" />, href: "/homework" },
    { id: "messages", label: "Сообщения", icon: <MessagesSquareIcon className="h-4 w-4 mr-3" />, href: "/messages" },
    { id: "documents", label: "Документы", icon: <FolderIcon className="h-4 w-4 mr-3" />, href: "/documents" },
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
    ? "fixed inset-0 z-40 md:relative w-64 translate-x-0 transform transition duration-200 ease-in-out"
    : "fixed inset-0 z-40 md:relative w-0 opacity-0 -translate-x-full transform transition duration-200 ease-in-out";

  // Role display names in Russian
  const roleNames = {
    [UserRoleEnum.SUPER_ADMIN]: "Супер-админ",
    [UserRoleEnum.SCHOOL_ADMIN]: "Администратор школы",
    [UserRoleEnum.TEACHER]: "Учитель",
    [UserRoleEnum.CLASS_TEACHER]: "Классный руководитель",
    [UserRoleEnum.STUDENT]: "Ученик",
    [UserRoleEnum.PARENT]: "Родитель",
    [UserRoleEnum.PRINCIPAL]: "Директор",
    [UserRoleEnum.VICE_PRINCIPAL]: "Завуч"
  };

  return (
    <aside className={`${sidebarClass} bg-white shadow-md h-full overflow-y-auto sidebar`}>
      {/* User Info */}
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

        {/* Переключатель ролей - отображается только для пользователей с несколькими ролями */}
        <div className="mt-3">
          <RoleSwitcher />
        </div>
      </div>

      {/* Navigation */}
      <nav className="py-4 px-2">
        <div className="space-y-1">
          {allowedItems.map((item) => {
            // Если у пункта есть компонент, отображаем его
            if ('component' in item) {
              return <div key={item.id}>{item.component}</div>;
            }
            
            // Иначе отображаем обычный пункт меню со ссылкой
            const linkItem = item as LinkMenuItem;
            const isActive = location === linkItem.href || 
                            (linkItem.href !== "/" && location.startsWith(linkItem.href));

            return (
              <Link key={linkItem.id} href={linkItem.href}>
                <div className={cn(
                  "group flex items-center px-2 py-2 text-sm font-medium rounded-md",
                  isActive 
                    ? "bg-primary text-white" 
                    : "text-gray-700 hover:bg-primary-50 hover:text-gray-900"
                )}>
                  <span className={cn(
                    isActive 
                      ? "text-white" 
                      : "text-gray-500 group-hover:text-gray-700"
                  )}>
                    {linkItem.icon}
                  </span>
                  {linkItem.label}
                </div>
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}