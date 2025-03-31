import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  LucideHome, LucideSchool, LucideUsers, LucideUserCog,
  LucideMessageSquare, LucidePieChart, LucideBell,
  LucideSettings, LucideLifeBuoy
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { UserRoleEnum } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { RoleSwitcher } from "@/components/role-switcher";

export function Sidebar() {
  const [location] = useLocation();
  const { user } = useAuth();

  const navigation = [
    { name: "Главная", href: "/", icon: LucideHome },
    { name: "Школы", href: "/schools", icon: LucideSchool },
    { name: "Пользователи", href: "/users", icon: LucideUsers },
    { name: "Роли", href: "/user-roles", icon: LucideUserCog },
    { name: "Сообщения", href: "/messages", icon: LucideMessageSquare },
    { name: "Аналитика", href: "/analytics", icon: LucidePieChart },
    { name: "Уведомления", href: "/notifications", icon: LucideBell },
    { name: "Настройки", href: "/settings", icon: LucideSettings },
    { name: "Поддержка", href: "/support", icon: LucideLifeBuoy },
  ];

  return (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
      <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6 pb-4">
        <div className="flex h-16 shrink-0 items-center">
          <Link href="/" className="flex items-center gap-2">
            <img
              className="h-8 w-auto"
              src="/graduation-cap.svg"
              alt="Электронный дневник"
            />
            <span className="text-lg font-semibold">Электронный дневник</span>
          </Link>
        </div>

        {/* Role Switcher */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center text-white">
              {user?.firstName?.[0] || user?.username?.[0] || "U"}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900">
                {user?.firstName} {user?.lastName}
              </span>
              <span className="text-xs text-gray-500">
                {user?.email || user?.username}
              </span>
            </div>
          </div>
          <RoleSwitcher className="w-full mt-2" />
        </div>

        <nav className="flex flex-1 flex-col">
          <ul role="list" className="flex flex-1 flex-col gap-y-7">
            <li>
              <ul role="list" className="-mx-2 space-y-1">
                {navigation.map((item) => (
                  <li key={item.name}>
                    <Link href={item.href}>
                      <Button
                        variant="ghost"
                        className={cn(
                          location === item.href
                            ? "bg-gray-50 text-primary"
                            : "text-gray-700 hover:text-primary hover:bg-gray-50",
                          "group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold w-full justify-start"
                        )}
                      >
                        <item.icon
                          className={cn(
                            location === item.href
                              ? "text-primary"
                              : "text-gray-400 group-hover:text-primary",
                            "h-6 w-6 shrink-0"
                          )}
                          aria-hidden="true"
                        />
                        {item.name}
                      </Button>
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          </ul>
        </nav>
      </div>
    </aside>
  );
}