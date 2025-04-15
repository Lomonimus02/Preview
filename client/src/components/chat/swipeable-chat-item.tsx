import React, { useState } from 'react';
import { useSwipeable } from 'react-swipeable';
import { Edit, Trash2, LogOut, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChatTypeEnum } from '@shared/schema';
import { ChatContextMenu } from './chat-context-menu';

type SwipeableChatItemProps = {
  children: React.ReactNode;
  onDelete?: () => void;
  onEdit?: () => void;
  onLeave?: () => void;
  chatType: string;
  isCreator: boolean;
  className?: string;
};

export function SwipeableChatItem({ 
  children, 
  onDelete, 
  onEdit, 
  onLeave,
  chatType,
  isCreator,
  className 
}: SwipeableChatItemProps) {
  const [swipedLeft, setSwipedLeft] = useState(false);

  const handlers = useSwipeable({
    onSwipedLeft: () => setSwipedLeft(true),
    onSwipedRight: () => setSwipedLeft(false),
    trackMouse: false,
    delta: 10,
    preventDefaultTouchmoveEvent: true,
  });

  // Закрыть меню действий
  const closeActions = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSwipedLeft(false);
  };

  return (
    <ChatContextMenu
      chatType={chatType}
      isCreator={isCreator}
      onDelete={onDelete}
      onEdit={onEdit}
      onLeave={onLeave}
    >
      <div className={cn("relative overflow-hidden", className)}>
        <div
          {...handlers}
          className={cn(
            "transition-transform duration-200 ease-out flex items-center",
            {
              "transform -translate-x-32": swipedLeft && chatType === ChatTypeEnum.GROUP && isCreator,
              "transform -translate-x-24": swipedLeft && (chatType === ChatTypeEnum.PRIVATE || !isCreator)
            }
          )}
        >
          {children}
        </div>

        {/* Действия при свайпе (для мобильных устройств) */}
        <div 
          className={cn(
            "absolute top-0 right-0 h-full flex items-center",
            "transition-opacity duration-200",
            swipedLeft ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          <div className="flex h-full">
            {/* Для приватных чатов или групповых (не создатель) - только выйти */}
            {(chatType === ChatTypeEnum.PRIVATE || !isCreator) && onLeave && (
              <Button 
                variant="destructive" 
                size="sm" 
                className="h-full px-2 rounded-none"
                onClick={(e) => {
                  e.stopPropagation();
                  onLeave();
                }}
              >
                <LogOut className="h-4 w-4 mr-1" />
                <span className="text-xs">Выйти</span>
              </Button>
            )}

            {/* Только для групповых чатов (создатель) - редактировать и удалить */}
            {chatType === ChatTypeEnum.GROUP && isCreator && (
              <>
                {onEdit && (
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="h-full px-2 rounded-none"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit();
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                )}
                {onDelete && (
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="h-full px-2 rounded-none"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}

            {/* Кнопка закрытия меню действий */}
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-full px-2 rounded-none"
              onClick={closeActions}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </ChatContextMenu>
  );
}