import { memo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, User } from "lucide-react";
import { ChatUser } from "@/types/chat";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

interface VirtualizedUsersListProps {
  users: ChatUser[];
  selectedIds: number[];
  onUserSelect: (userId: number) => void;
  height?: number;
}

const VirtualizedUsersList = memo(({
  users,
  selectedIds,
  onUserSelect,
  height = 240
}: VirtualizedUsersListProps) => {
  const parentRef = useRef<HTMLDivElement>(null);
  
  // Если список пуст, показываем сообщение
  if (users.length === 0) {
    return (
      <div className="py-3 px-4 text-center text-gray-500">
        Пользователи не найдены
      </div>
    );
  }
  
  // Виртуализация списка
  const rowVirtualizer = useVirtualizer({
    count: users.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48, // Приблизительная высота элемента
    overscan: 5, // Количество дополнительных элементов для рендеринга
  });
  
  return (
    <div 
      ref={parentRef} 
      className="overflow-auto"
      style={{ height: `${height}px` }}
    >
      <div
        className="relative w-full"
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const user = users[virtualRow.index];
          const isSelected = selectedIds.includes(user.id);
          
          return (
            <div
              key={user.id}
              className="absolute top-0 left-0 w-full"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="p-1">
                <div 
                  className={`flex items-center justify-between p-2 rounded-md cursor-pointer ${
                    isSelected 
                      ? "bg-primary/10 hover:bg-primary/20"
                      : "hover:bg-gray-100"
                  }`}
                  onClick={() => onUserSelect(user.id)}
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src="" alt={user.firstName} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="text-sm font-medium">
                        {user.firstName} {user.lastName}
                      </div>
                      <div className="text-xs text-gray-500">
                        {user.role}
                      </div>
                    </div>
                  </div>
                  
                  {isSelected && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

VirtualizedUsersList.displayName = "VirtualizedUsersList";

export default VirtualizedUsersList;