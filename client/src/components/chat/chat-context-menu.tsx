import React from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Edit, Trash2, LogOut } from 'lucide-react';
import { ChatTypeEnum } from '@shared/schema';

interface ChatContextMenuProps {
  children: React.ReactNode;
  chatType: string;
  isCreator: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onLeave?: () => void;
}

export function ChatContextMenu({
  children,
  chatType,
  isCreator,
  onEdit,
  onDelete,
  onLeave
}: ChatContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {/* Показывать редактирование только для групповых чатов, всем участникам */}
        {chatType === ChatTypeEnum.GROUP && onEdit && (
          <ContextMenuItem className="cursor-pointer" onClick={onEdit}>
            <Edit className="h-4 w-4 mr-2" />
            <span>Редактировать название</span>
          </ContextMenuItem>
        )}
        
        {/* Показывать выход из чата всем, кроме создателя группы */}
        {(chatType === ChatTypeEnum.PRIVATE || !isCreator) && onLeave && (
          <ContextMenuItem 
            className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50" 
            onClick={onLeave}
          >
            <LogOut className="h-4 w-4 mr-2" />
            <span>Выйти из чата</span>
          </ContextMenuItem>
        )}
        
        {/* Показывать удаление для приватных чатов (всем) и для групповых (только создателю) */}
        {((chatType === ChatTypeEnum.PRIVATE) || (chatType === ChatTypeEnum.GROUP && isCreator)) && onDelete && (
          <ContextMenuItem 
            className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50" 
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            <span>Удалить чат</span>
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}