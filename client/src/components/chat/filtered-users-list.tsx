import { useMemo } from "react";
import { ChatUser } from "../../types/chat";
import VirtualizedUsersList from "./virtualized-users-list";

interface FilteredUsersListProps {
  chatUsers: ChatUser[];
  currentUserId?: number;
  searchQuery: string;
  showAllUsers: boolean;
  selectedUserIds: number[];
  onUserSelect: (userId: number) => void;
  height?: number;
}

export default function FilteredUsersList({
  chatUsers,
  currentUserId,
  searchQuery,
  showAllUsers,
  selectedUserIds,
  onUserSelect,
  height = 240
}: FilteredUsersListProps) {
  // Фильтрация пользователей для групповых чатов
  const filteredUsers = useMemo(() => {
    return chatUsers
      .filter(u => u.id !== currentUserId)
      .filter(u => {
        if (!searchQuery) {
          // Если нет поискового запроса, показываем либо всех (если showAllUsers=true), 
          // либо только выбранных пользователей
          return showAllUsers || selectedUserIds.includes(u.id);
        }
        
        // Поиск по имени, фамилии или полному имени
        const searchTerm = searchQuery.toLowerCase();
        return (
          u.firstName.toLowerCase().includes(searchTerm) ||
          u.lastName.toLowerCase().includes(searchTerm) ||
          `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchTerm)
        );
      });
  }, [chatUsers, searchQuery, showAllUsers, currentUserId, selectedUserIds]);

  // Если список пуст, показываем сообщение
  if (filteredUsers.length === 0) {
    return (
      <div className="py-3 px-4 text-center text-gray-500">
        {searchQuery 
          ? "Пользователи не найдены" 
          : "Нет доступных пользователей"}
      </div>
    );
  }

  return (
    <VirtualizedUsersList 
      users={filteredUsers}
      selectedIds={selectedUserIds}
      onUserSelect={onUserSelect}
      height={height}
    />
  );
}