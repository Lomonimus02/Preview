import { Link, useLocation } from "wouter";
import { 
  HomeIcon, 
  BookIcon, 
  Users2Icon, 
  BarChartIcon, 
  BuildingIcon,
  MoreHorizontalIcon
} from "lucide-react";
import { UserRole } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  
  // Maps user roles to which menu items they can see in the mobile nav
  const roleAccess = {
    [UserRole.SUPER_ADMIN]: ["dashboard", "schools", "users", "analytics", "more"],
    [UserRole.SCHOOL_ADMIN]: ["dashboard", "users", "schedule", "grades", "more"],
    [UserRole.TEACHER]: ["dashboard", "schedule", "homework", "grades", "more"],
    [UserRole.STUDENT]: ["dashboard", "schedule", "homework", "grades", "more"],
    [UserRole.PARENT]: ["dashboard", "grades", "messages", "more"],
    [UserRole.PRINCIPAL]: ["dashboard", "users", "grades", "analytics", "more"],
    [UserRole.VICE_PRINCIPAL]: ["dashboard", "users", "grades", "analytics", "more"]
  };

  // Mobile navigation items (limited to 5 for the bottom bar)
  const navItems = [
    { id: "dashboard", label: "Главная", icon: <HomeIcon className="h-5 w-5" />, href: "/" },
    { id: "schools", label: "Школы", icon: <BuildingIcon className="h-5 w-5" />, href: "/schools" },
    { id: "users", label: "Пользователи", icon: <Users2Icon className="h-5 w-5" />, href: "/users" },
    { id: "homework", label: "Дз", icon: <BookIcon className="h-5 w-5" />, href: "/homework" },
    { id: "analytics", label: "Аналитика", icon: <BarChartIcon className="h-5 w-5" />, href: "/analytics" },
    { id: "more", label: "Ещё", icon: <MoreHorizontalIcon className="h-5 w-5" />, href: "/more" }
  ];

  // Filter nav items based on user role (keep max 5 items for mobile)
  const userRole = user?.role || UserRole.STUDENT;
  const allowedItems = navItems.filter(item => 
    roleAccess[userRole]?.includes(item.id)
  ).slice(0, 5);

  return (
    <nav className="md:hidden bg-white border-t border-gray-200 px-4 py-3 fixed bottom-0 left-0 right-0 flex justify-around">
      {allowedItems.map((item) => {
        const isActive = location === item.href || 
                        (item.href !== "/" && location.startsWith(item.href));
        
        return (
          <Link key={item.id} href={item.href}>
            <a className="flex flex-col items-center">
              <span className={cn(
                isActive ? "text-primary" : "text-gray-500"
              )}>
                {item.icon}
              </span>
              <span className={cn(
                "text-xs mt-1",
                isActive ? "text-primary" : "text-gray-500"
              )}>
                {item.label}
              </span>
            </a>
          </Link>
        );
      })}
    </nav>
  );
}
