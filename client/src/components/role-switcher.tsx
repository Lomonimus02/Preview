import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { UserRoleEnum } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, ShieldCheck, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

// Расширенная модель роли пользователя
interface UserRole {
  id: number;
  userId: number;
  role: UserRoleEnum;
  schoolId: number | null;
  isDefault?: boolean;
  isActive?: boolean;
}

// Функция для получения читаемого названия роли
const getRoleName = (role: UserRoleEnum) => {
  const roleMap = {
    [UserRoleEnum.SUPER_ADMIN]: "Супер-Администратор",
    [UserRoleEnum.SCHOOL_ADMIN]: "Администратор школы",
    [UserRoleEnum.TEACHER]: "Учитель",
    [UserRoleEnum.STUDENT]: "Ученик",
    [UserRoleEnum.PARENT]: "Родитель",
    [UserRoleEnum.PRINCIPAL]: "Директор",
    [UserRoleEnum.VICE_PRINCIPAL]: "Завуч"
  };
  return roleMap[role] || role;
};

interface RoleSwitcherProps {
  className?: string;
}

export function RoleSwitcher({ className }: RoleSwitcherProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const switchRoleMutation = useMutation({
    mutationFn: async (role: UserRoleEnum) => {
      const res = await apiRequest("POST", "/api/switch-role", { role });
      return await res.json();
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["/api/user"], updatedUser);
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries();
      setOpen(false);
      toast({
        title: "Роль изменена",
        description: `Вы переключились на роль: ${getRoleName(updatedUser.activeRole)}`,
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 500);
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка при смене роли",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Находим текущую активную роль на основе данных пользователя
  const activeRole = user?.roles?.find(role => role.id === user?.activeRole) ||
                     user?.roles?.find(role => role.isActive) ||
                     user?.roles?.[0];

  // Список всех ролей пользователя для выбора
  const userRoles = user?.roles || [];

  if (!userRoles || userRoles.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700">
        <ShieldCheck className="h-4 w-4" />
        <span className="truncate">Нет ролей</span>
      </div>
    )
  }

  if (userRoles.length <= 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700">
        <ShieldCheck className="h-4 w-4" />
        <span className="truncate">
          {activeRole ? getRoleName(activeRole.role) : "Нет ролей"}
        </span>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="justify-between max-w-[200px] text-sm"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            <span className="truncate">
              {activeRole ? getRoleName(activeRole.role) : "Выберите роль"}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Найти роль..." />
          <CommandEmpty>Роли не найдены</CommandEmpty>
          <CommandGroup>
            {userRoles.map((role) => (
              <CommandItem
                key={role.id}
                value={role.role}
                onSelect={() => {
                  if (role.role !== activeRole?.role) {
                    switchRoleMutation.mutate(role.role);
                  } else {
                    setOpen(false);
                  }
                }}
                className="flex items-center gap-2"
              >
                {role.isDefault ?
                  <ShieldCheck className="h-4 w-4" /> :
                  <ShieldQuestion className="h-4 w-4" />}
                {getRoleName(role.role)}
                <Check
                  className={cn(
                    "ml-auto h-4 w-4",
                    role.isActive ? "opacity-100" : "opacity-0"
                  )}
                />
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}