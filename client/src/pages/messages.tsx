import { useState, useEffect, useRef, useMemo } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { useAuth } from "@/hooks/use-auth";
import { UserRoleEnum } from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, 
  Send, 
  User as UserIcon, 
  Users, 
  CheckCircle, 
  Clock, 
  MessagesSquare, 
  PlusCircle, 
  PaperclipIcon,
  Image,
  FileIcon,
  X,
  Play,
  Download,
  ExternalLink,
  ArrowLeft,
  Loader2,
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { SwipeableChatItem } from "@/components/chat/swipeable-chat-item";
import { EditChatDialog } from "@/components/chat/edit-chat-dialog";
import { ChatContextMenu } from "@/components/chat/chat-context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { useMediaQuery } from "@/hooks/use-media-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import FilteredUsersList from "@/components/chat/filtered-users-list";
import { 
  Chat, 
  ChatMessage, 
  ChatTypeEnum, 
  ChatUser, 
  MessageFormValues, 
  NewChatFormValues, 
  messageFormSchema, 
  newChatFormSchema 
} from "../types/chat";

export default function MessagesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const usersListRef = useRef<HTMLDivElement>(null);
  
  // Состояния для UI
  const [searchQuery, setSearchQuery] = useState("");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [isNewChatDialogOpen, setIsNewChatDialogOpen] = useState(false);
  const [isParticipantsDialogOpen, setIsParticipantsDialogOpen] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<File | null>(null);
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [isAddingUserByName, setIsAddingUserByName] = useState(false);
  const [userPage, setUserPage] = useState(1);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  
  // Рефы для контейнеров
  const parentRef = useRef<HTMLDivElement>(null);
  
  // Получение списка чатов пользователя
  const { data: chats = [], isLoading: chatsLoading } = useQuery<Chat[]>({
    queryKey: ["/api/chats"],
    enabled: !!user,
    refetchInterval: 10000, // Обновляем каждые 10 секунд
  });
  
  // Получение выбранного чата (перемещено выше для использования в других запросах)
  const selectedChat = selectedChatId ? chats.find(c => c.id === selectedChatId) : null;
  
  // Получение списка сообщений для выбранного чата
  const { data: chatMessages = [], isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: [`/api/chats/${selectedChatId}/messages`],
    enabled: !!selectedChatId,
    refetchInterval: 5000, // Обновляем каждые 5 секунд
  });
  
  // Получение списка участников выбранного чата
  const { data: chatParticipants = [], isLoading: participantsLoading } = useQuery<ChatUser[]>({
    queryKey: [`/api/chats/${selectedChatId}/participants`],
    enabled: !!selectedChatId && selectedChat?.type === 'group',
  });
  
  // Получение списка пользователей для создания чата
  const { data: chatUsers = [], isLoading: usersLoading } = useQuery<ChatUser[]>({
    queryKey: ["/api/chat-users"],
    enabled: !!user,
  });
  
  // Форма для отправки сообщений
  const messageForm = useForm<MessageFormValues>({
    resolver: zodResolver(messageFormSchema),
    defaultValues: {
      content: "",
    },
  });
  
  // Форма для создания нового чата
  const newChatForm = useForm<NewChatFormValues>({
    resolver: zodResolver(newChatFormSchema),
    defaultValues: {
      name: "",
      type: "private",
      participantIds: [],
    },
  });
  
  // Мутация для отправки сообщения
  const sendMessageMutation = useMutation({
    mutationFn: async (data: MessageFormValues & { chatId: number }) => {
      // Если есть вложение, сначала загружаем его
      let attachmentType = null;
      let attachmentUrl = null;
      let hasAttachment = false;
      
      if (data.attachmentFile) {
        hasAttachment = true;
        
        // Определяем тип вложения
        if (data.attachmentFile.type.startsWith('image/')) {
          attachmentType = 'image';
        } else if (data.attachmentFile.type.startsWith('video/')) {
          attachmentType = 'video';
        } else {
          attachmentType = 'document';
        }
        
        // Загружаем файл на сервер
        const formData = new FormData();
        formData.append('file', data.attachmentFile);
        
        try {
          const uploadResponse = await fetch(`/api/chats/${data.chatId}/upload`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
          });
          
          if (!uploadResponse.ok) {
            throw new Error('Не удалось загрузить файл');
          }
          
          const uploadResult = await uploadResponse.json();
          attachmentUrl = uploadResult.file.url;
          attachmentType = uploadResult.file.type;
          
          console.log('Файл успешно загружен:', uploadResult);
        } catch (error: any) {
          console.error('Ошибка при загрузке файла:', error);
          throw new Error('Не удалось загрузить файл: ' + (error.message || 'неизвестная ошибка'));
        }
      }
      
      // Отправляем сообщение
      const res = await apiRequest(`/api/chats/${data.chatId}/messages`, "POST", {
        content: data.content,
        hasAttachment,
        attachmentType,
        attachmentUrl
      });
      
      return res.json();
    },
    onSuccess: () => {
      // Обновляем правильный ключ запроса для сообщений
      queryClient.invalidateQueries({ queryKey: [`/api/chats/${selectedChatId}/messages`] });
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
      messageForm.reset();
      setSelectedAttachment(null);
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось отправить сообщение",
        variant: "destructive",
      });
    },
  });
  
  // Мутация для создания нового чата
  const createChatMutation = useMutation({
    mutationFn: async (data: NewChatFormValues) => {
      const res = await apiRequest("/api/chats", "POST", data);
      return res.json();
    },
    onSuccess: (newChat) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
      setSelectedChatId(newChat.id);
      setIsNewChatDialogOpen(false);
      newChatForm.reset();
      toast({
        title: "Чат создан",
        description: "Новый чат успешно создан",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось создать чат",
        variant: "destructive",
      });
    },
  });
  
  // Мутация для обновления статуса прочтения
  const updateReadStatusMutation = useMutation({
    mutationFn: async ({ chatId, messageId }: { chatId: number, messageId: number }) => {
      const res = await apiRequest(`/api/chats/${chatId}/read-status`, "PUT", { messageId });
      return res.json();
    },
    onSuccess: (data) => {
      // Проверяем, что данные содержат информацию о непрочитанных сообщениях
      if (data && typeof data.unreadCount !== 'undefined') {
        // Обновляем кеш с точным количеством непрочитанных сообщений для конкретного чата
        queryClient.setQueryData(["/api/chats"], (oldData: any) => {
          if (!oldData) return oldData;
          
          return oldData.map((chat: Chat) => {
            if (chat.id === selectedChatId) {
              return {
                ...chat,
                unreadCount: data.unreadCount
              };
            }
            return chat;
          });
        });
        
        // Обновляем общее количество непрочитанных сообщений для уведомлений в навигации
        if (typeof data.totalUnreadCount !== 'undefined') {
          // Здесь можно обновить глобальное состояние или кеш для уведомлений навигации
          // Например, через контекст или глобальное состояние
          queryClient.setQueryData(["/api/notifications/count"], () => data.totalUnreadCount);
        }
      } else {
        // Запасной вариант: полное обновление
        queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
      }
    },
  });
  
  // Мутация для удаления сообщения
  const deleteMessageMutation = useMutation({
    mutationFn: async ({ chatId, messageId }: { chatId: number, messageId: number }) => {
      const res = await apiRequest(`/api/chats/${chatId}/messages/${messageId}`, "DELETE");
      return res.json();
    },
    onSuccess: () => {
      // Обновляем сообщения в текущем чате и список всех чатов
      queryClient.invalidateQueries({ queryKey: [`/api/chats/${selectedChatId}/messages`] });
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
      toast({
        title: "Сообщение удалено",
        description: "Сообщение было успешно удалено"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить сообщение",
        variant: "destructive",
      });
    },
  });
  
  // При загрузке страницы или изменении списка чатов
  useEffect(() => {
    // Если есть чаты, но не выбран ни один, выбираем первый
    if (chats.length > 0 && !selectedChatId) {
      setSelectedChatId(chats[0].id);
    }
  }, [chats, selectedChatId]);
  
  // Прокрутка вниз при получении новых сообщений
  useEffect(() => {
    if (scrollRef.current) {
      // Находим реальный элемент прокрутки внутри ScrollArea
      const scrollViewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollViewport) {
        // Плавная прокрутка вниз
        setTimeout(() => {
          scrollViewport.scrollTo({
            top: scrollViewport.scrollHeight,
            behavior: 'smooth'
          });
        }, 100);
      }
    }
  }, [chatMessages]);
  
  // Обработка прочтения сообщений при выборе чата
  useEffect(() => {
    if (selectedChatId && chatMessages.length > 0) {
      // Найдем последнее сообщение в чате
      const messages = [...chatMessages].sort(
        (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
      );
      
      const lastMessage = messages[0];
      
      // Проверим, есть ли непрочитанные сообщения от других пользователей
      const hasUnreadMessages = messages.some(
        msg => msg.senderId !== user?.id && !msg.isRead
      );
      
      // Если есть непрочитанные сообщения, отмечаем их как прочитанные
      if (lastMessage && hasUnreadMessages) {
        updateReadStatusMutation.mutate({
          chatId: selectedChatId,
          messageId: lastMessage.id,
        });
      }
    }
  }, [selectedChatId, chatMessages, user?.id]);
  
  // Обработка отправки сообщения
  const onSubmitMessage = (values: MessageFormValues) => {
    if (!selectedChatId) return;
    
    // Проверяем, что есть текст или вложение
    if (!values.content && !selectedAttachment) {
      toast({
        title: "Ошибка",
        description: "Сообщение должно содержать текст или вложение",
        variant: "destructive",
      });
      return;
    }
    
    sendMessageMutation.mutate({
      chatId: selectedChatId,
      content: values.content,
      attachmentFile: selectedAttachment || undefined,
    });
  };
  
  // Обработка создания нового чата
  const onSubmitNewChat = (values: NewChatFormValues) => {
    createChatMutation.mutate(values);
  };
  
  // Обработка загрузки файла
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedAttachment(e.target.files[0]);
    }
  };
  
  // Открытие диалога выбора файла
  const openFileDialog = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Отмена выбора файла
  const cancelAttachment = () => {
    setSelectedAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  
  // Оптимизация: фильтрация чатов с помощью мемоизации
  const filteredChats = useMemo(() => {
    return chats.filter(chat => {
      if (!searchQuery) return true;
      const lowerQuery = searchQuery.toLowerCase();
      
      // Поиск по имени чата
      if (chat.name.toLowerCase().includes(lowerQuery)) return true;
      
      // Поиск по именам участников
      if (chat.participants && chat.participants.some(p => 
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(lowerQuery) ||
        p.username.toLowerCase().includes(lowerQuery)
      )) return true;
      
      return false;
    });
  }, [chats, searchQuery]);
  
  // Получаем сообщения для выбранного чата, отсортированные по времени
  const sortedMessages = [...chatMessages].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
  );
  
  // Получение количества непрочитанных сообщений для чата
  const getUnreadCount = (chat: Chat) => {
    // Используем информацию, которая приходит вместе с чатом
    return chat.unreadCount || 0;
  };
  
  // Проверка, является ли пользователь создателем чата
  const isCreatorOfChat = (chat: Chat) => {
    return chat.creatorId === user?.id;
  };
  
  // Состояние для управления диалогом редактирования чата
  const [editChatDialogOpen, setEditChatDialogOpen] = useState(false);
  const [chatToEdit, setChatToEdit] = useState<Chat | null>(null);
  
  // Состояние для управления диалогом подтверждения удаления
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<Chat | null>(null);
  
  // Состояние для управления диалогом подтверждения выхода из чата
  const [leaveAlertOpen, setLeaveAlertOpen] = useState(false);
  const [chatToLeave, setChatToLeave] = useState<Chat | null>(null);
  
  // Мутация для обновления названия чата
  const updateChatMutation = useMutation({
    mutationFn: async (data: { chatId: number, name: string }) => {
      const res = await apiRequest(`/api/chats/${data.chatId}`, "PATCH", { name: data.name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
      setEditChatDialogOpen(false);
      setChatToEdit(null);
      toast({
        title: "Чат обновлен",
        description: "Название чата успешно изменено",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось обновить чат",
        variant: "destructive",
      });
    },
  });
  
  // Мутация для удаления чата
  const deleteChatMutation = useMutation({
    mutationFn: async (chatId: number) => {
      const res = await apiRequest(`/api/chats/${chatId}`, "DELETE");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
      setDeleteAlertOpen(false);
      setChatToDelete(null);
      if (selectedChatId === chatToDelete?.id) {
        setSelectedChatId(null);
      }
      toast({
        title: "Чат удален",
        description: "Чат был успешно удален",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить чат",
        variant: "destructive",
      });
    },
  });
  
  // Мутация для выхода из чата
  const leaveChatMutation = useMutation({
    mutationFn: async (chatId: number) => {
      const res = await apiRequest(`/api/chats/${chatId}/leave`, "POST");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
      setLeaveAlertOpen(false);
      setChatToLeave(null);
      if (selectedChatId === chatToLeave?.id) {
        setSelectedChatId(null);
      }
      toast({
        title: "Выход из чата",
        description: "Вы успешно покинули чат",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось выйти из чата",
        variant: "destructive",
      });
    },
  });
  
  // Форматирование времени сообщения
  const formatMessageTime = (dateStr: string | Date) => {
    try {
      const now = new Date();
      const messageDate = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
      
      // Проверка на валидность даты
      if (isNaN(messageDate.getTime())) {
        console.warn('Некорректная дата:', dateStr);
        return 'Сейчас';
      }
      
      // Если сообщение отправлено сегодня, показываем только время
      if (messageDate.toDateString() === now.toDateString()) {
        return messageDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      }
      
      // Если сообщение отправлено в этом году, показываем дату без года
      if (messageDate.getFullYear() === now.getFullYear()) {
        return messageDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + 
               ' ' + 
               messageDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      }
      
      // Иначе показываем полную дату
      return messageDate.toLocaleDateString('ru-RU') + 
             ' ' + 
             messageDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      console.error('Ошибка при форматировании даты:', error);
      return 'Некорректная дата';
    }
  };
  
  // Определение имени чата
  const getChatName = (chat: Chat) => {
    // Если чат групповой, показываем его имя
    if (chat.type === ChatTypeEnum.GROUP) {
      return chat.name;
    }
    
    // Если чат приватный, показываем имя собеседника
    if (chat.participants && chat.participants.length > 0) {
      // Находим пользователя, который не является текущим
      const otherParticipant = chat.participants.find(p => p.id !== user?.id);
      if (otherParticipant) {
        return `${otherParticipant.firstName} ${otherParticipant.lastName}`;
      }
    }
    
    // Если не удалось определить имя, возвращаем дефолтное
    return chat.name || "Чат без названия";
  };
  
  // Определение аватара чата
  const getChatAvatar = (chat: Chat) => {
    // Если у чата есть аватар, используем его
    if (chat.avatarUrl) {
      return chat.avatarUrl;
    }
    
    // Если чат приватный, показываем аватар собеседника
    if (chat.type === ChatTypeEnum.PRIVATE && chat.participants && chat.participants.length > 0) {
      const otherParticipant = chat.participants.find(p => p.id !== user?.id);
      if (otherParticipant) {
        return null; // Тут обычно должна быть логика для получения аватара пользователя
      }
    }
    
    // Если не удалось определить аватар, возвращаем null
    return null;
  };
  
  // Медиа-запрос для адаптивности
  const isMobile = useMediaQuery("(max-width: 768px)");
  
  // Отображение интерфейса
  return (
    <MainLayout title="Сообщения">
      <div className="grid grid-cols-1 md:grid-cols-12 h-full gap-4">
        {/* Список чатов - скрывается на мобильных когда выбран чат */}
        {(!isMobile || !selectedChatId) && (
          <div className="col-span-1 md:col-span-3 lg:col-span-3 h-full">
            <Card className="h-full flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <CardTitle className="text-xl">Чаты</CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      // Сбрасываем форму и открываем диалог
                      newChatForm.reset({ name: "", type: "private", participantIds: [] });
                      setIsNewChatDialogOpen(true);
                    }}
                  >
                    <PlusCircle className="h-4 w-4 mr-1" />
                    Новый чат
                  </Button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input 
                    placeholder="Поиск чатов..." 
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden p-0">
                <ScrollArea className="h-full w-full">
                  {chatsLoading ? (
                    // Скелетон для загрузки
                    <div className="p-4 space-y-4">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="flex items-center gap-3">
                          <Skeleton className="h-12 w-12 rounded-full" />
                          <div className="space-y-2">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filteredChats.length === 0 ? (
                    // Сообщение, если нет чатов
                    <div className="p-4 text-center text-gray-500">
                      {searchQuery ? (
                        <p>Чаты не найдены. Попробуйте изменить запрос.</p>
                      ) : (
                        <div className="space-y-2">
                          <p>У вас пока нет чатов.</p>
                          <Button
                            variant="link"
                            onClick={() => {
                              newChatForm.reset({ name: "", type: "private", participantIds: [] });
                              setIsNewChatDialogOpen(true);
                            }}
                          >
                            Создать новый чат
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    // Список чатов
                    <div>
                      {filteredChats.map((chat) => (
                        <SwipeableChatItem
                          key={chat.id}
                          chat={chat}
                          isSelected={selectedChatId === chat.id}
                          unreadCount={getUnreadCount(chat)}
                          getChatName={getChatName}
                          onClick={() => setSelectedChatId(chat.id)}
                          onEdit={() => {
                            setChatToEdit(chat);
                            setEditChatDialogOpen(true);
                          }}
                          onDelete={() => {
                            setChatToDelete(chat);
                            setDeleteAlertOpen(true);
                          }}
                          onLeave={() => {
                            setChatToLeave(chat);
                            setLeaveAlertOpen(true);
                          }}
                          isCreator={isCreatorOfChat(chat)}
                          chatType={chat.type}
                        />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        )}
        
        {/* Основная область чата */}
        {(!isMobile || selectedChatId) && (
          <div className="col-span-1 md:col-span-9 lg:col-span-9 h-full relative">
            {selectedChat ? (
              <Card className="h-full flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-center">
                    {isMobile && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => setSelectedChatId(null)}
                        className="mr-2"
                      >
                        <ArrowLeft className="h-5 w-5" />
                      </Button>
                    )}
                    
                    <div className="flex items-center flex-1">
                      <Avatar className="h-8 w-8 mr-2">
                        <AvatarImage src={getChatAvatar(selectedChat) || undefined} />
                        <AvatarFallback>
                          {selectedChat.type === ChatTypeEnum.GROUP ? (
                            <Users className="h-4 w-4" />
                          ) : (
                            <UserIcon className="h-4 w-4" />
                          )}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div>
                        <h3 className="font-semibold text-sm">{getChatName(selectedChat)}</h3>
                        {selectedChat.type === ChatTypeEnum.GROUP && (
                          <div className="text-xs text-gray-500">
                            {chatParticipants.length} участников
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <ChatContextMenu
                      chat={selectedChat}
                      isCreator={isCreatorOfChat(selectedChat)}
                      onViewParticipants={() => setIsParticipantsDialogOpen(true)}
                      onEdit={() => {
                        setChatToEdit(selectedChat);
                        setEditChatDialogOpen(true);
                      }}
                      onDelete={() => {
                        setChatToDelete(selectedChat);
                        setDeleteAlertOpen(true);
                      }}
                      onLeave={() => {
                        setChatToLeave(selectedChat);
                        setLeaveAlertOpen(true);
                      }}
                    />
                  </div>
                </CardHeader>
                
                <CardContent className="flex-1 overflow-hidden p-0 border-t">
                  <ScrollArea className="h-full p-4" ref={scrollRef}>
                    {messagesLoading ? (
                      <div className="flex justify-center items-center h-full">
                        <Clock className="h-6 w-6 text-primary animate-spin" />
                      </div>
                    ) : sortedMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center p-4">
                        <MessagesSquare className="h-12 w-12 text-gray-300 mb-2" />
                        <h3 className="text-lg font-medium">Нет сообщений</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Начните общение, отправив первое сообщение
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {sortedMessages.map((message) => {
                          const isCurrentUser = message.senderId === user?.id;
                          
                          return (
                            <div
                              key={message.id}
                              className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                            >
                              <div
                                className={`max-w-[80%] rounded-lg p-3 ${
                                  isCurrentUser 
                                    ? 'bg-primary text-primary-foreground' 
                                    : 'bg-muted'
                                }`}
                              >
                                {!isCurrentUser && message.sender && (
                                  <div className="text-xs font-medium mb-1">
                                    {message.sender.firstName} {message.sender.lastName}
                                  </div>
                                )}
                                
                                {message.content && (
                                  <div className="mb-2">{message.content}</div>
                                )}
                                
                                {message.hasAttachment && message.attachmentUrl && (
                                  <div className="mb-2">
                                    {message.attachmentType === 'image' ? (
                                      <div className="relative">
                                        <img
                                          src={message.attachmentUrl}
                                          alt="Изображение"
                                          className="rounded max-w-full h-auto"
                                        />
                                        <a 
                                          href={message.attachmentUrl} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="absolute top-2 right-2 bg-black/50 rounded-full p-1 transition-opacity opacity-50 hover:opacity-100"
                                        >
                                          <ExternalLink className="h-4 w-4 text-white" />
                                        </a>
                                      </div>
                                    ) : message.attachmentType === 'video' ? (
                                      <div className="relative">
                                        <video
                                          controls
                                          className="rounded max-w-full h-auto"
                                        >
                                          <source src={message.attachmentUrl} />
                                          Ваш браузер не поддерживает видео.
                                        </video>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2 bg-background/20 p-2 rounded">
                                        <FileIcon className="h-4 w-4" />
                                        <a 
                                          href={message.attachmentUrl} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="text-sm underline"
                                        >
                                          Скачать файл
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                )}
                                
                                <div className="text-xs opacity-70 flex items-center justify-end gap-1">
                                  {formatMessageTime(message.sentAt)}
                                  {isCurrentUser && (
                                    message.isRead ? (
                                      <CheckCircle className="h-3 w-3 text-current" />
                                    ) : (
                                      <Check className="h-3 w-3 text-current" />
                                    )
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
                
                <CardFooter className="p-2 border-t bg-card">
                  <Form {...messageForm}>
                    <form 
                      onSubmit={messageForm.handleSubmit(onSubmitMessage)} 
                      className="flex w-full items-end gap-2"
                    >
                      {selectedAttachment && (
                        <div className="absolute bottom-full mb-2 left-0 right-0 bg-background border rounded-md p-2 mx-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              {selectedAttachment.type.startsWith('image/') ? (
                                <Image className="h-4 w-4 mr-2" />
                              ) : selectedAttachment.type.startsWith('video/') ? (
                                <Video className="h-4 w-4 mr-2" />
                              ) : (
                                <FileIcon className="h-4 w-4 mr-2" />
                              )}
                              <span className="text-sm truncate max-w-[200px]">
                                {selectedAttachment.name}
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={cancelAttachment}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={openFileDialog}
                      >
                        <PaperclipIcon className="h-5 w-5" />
                      </Button>
                      
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      
                      <FormField
                        control={messageForm.control}
                        name="content"
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <FormControl>
                              <Input
                                placeholder="Напишите сообщение..."
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <Button 
                        type="submit" 
                        disabled={sendMessageMutation.isPending || (!messageForm.getValues().content && !selectedAttachment)}
                      >
                        {sendMessageMutation.isPending ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Send className="h-5 w-5" />
                        )}
                      </Button>
                    </form>
                  </Form>
                </CardFooter>
              </Card>
            ) : (
              <div className="flex flex-col items-center justify-center h-full bg-card p-8 rounded-lg border">
                <MessagesSquare className="h-16 w-16 text-gray-300 mb-4" />
                <h3 className="text-xl font-medium">Выберите чат</h3>
                <p className="text-center text-gray-500 mt-2 max-w-md">
                  Выберите существующий чат из списка или создайте новый,
                  чтобы начать общение
                </p>
                <Button
                  className="mt-4"
                  onClick={() => {
                    newChatForm.reset({ name: "", type: "private", participantIds: [] });
                    setIsNewChatDialogOpen(true);
                  }}
                >
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Создать новый чат
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Диалог создания нового чата */}
      <Dialog open={isNewChatDialogOpen} onOpenChange={setIsNewChatDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать новый чат</DialogTitle>
            <DialogDescription>
              Выберите тип чата и пользователей для общения
            </DialogDescription>
          </DialogHeader>
          
          <Form {...newChatForm}>
            <form onSubmit={newChatForm.handleSubmit(onSubmitNewChat)} className="space-y-4">
              <Tabs defaultValue="private" onValueChange={(value) => newChatForm.setValue('type', value as ChatTypeEnum)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="private">Личный чат</TabsTrigger>
                  <TabsTrigger value="group">Групповой чат</TabsTrigger>
                </TabsList>
                
                <TabsContent value="private">
                  <div className="space-y-4 mt-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Показать всех пользователей</span>
                      <Switch
                        checked={showAllUsers}
                        onCheckedChange={value => setShowAllUsers(value)}
                      />
                    </div>
                    
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <Input 
                        placeholder="Поиск по имени или фамилии..." 
                        className="pl-10"
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                      />
                    </div>
                    
                    <div className="border rounded-md p-2 h-60">
                      {usersLoading ? (
                        <div className="flex justify-center items-center py-2">
                          <Clock className="h-4 w-4 text-primary animate-spin" />
                        </div>
                      ) : (
                        <div>
                          {/* Виртуализированный список пользователей */}
                          <FilteredUsersList
                            chatUsers={chatUsers}
                            currentUserId={user?.id}
                            searchQuery={userSearchQuery}
                            showAllUsers={showAllUsers}
                            selectedUserIds={newChatForm.getValues().participantIds || []}
                            onUserSelect={(userId) => {
                              const currentParticipants = newChatForm.getValues().participantIds;
                              const isSelected = currentParticipants.includes(userId);
                              
                              if (isSelected) {
                                // Если пользователь уже выбран, удаляем его из списка
                                newChatForm.setValue(
                                  'participantIds',
                                  currentParticipants.filter(id => id !== userId)
                                );
                              } else {
                                // Для приватного чата можно выбрать только одного пользователя
                                newChatForm.setValue('participantIds', [userId]);
                              }
                              
                              // Сбрасываем ошибки валидации, т.к. могли быть исправлены
                              newChatForm.trigger('participantIds');
                            }}
                            height={240}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="group">
                  <div className="space-y-4 mt-4">
                    <FormField
                      control={newChatForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input placeholder="Название группового чата" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Показать всех пользователей</span>
                      <Switch
                        checked={showAllUsers}
                        onCheckedChange={value => setShowAllUsers(value)}
                      />
                    </div>
                    
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <Input 
                        placeholder="Поиск по имени или фамилии..." 
                        className="pl-10"
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                      />
                    </div>
                    
                    <div className="border rounded-md p-2 h-60">
                      {usersLoading ? (
                        <div className="flex justify-center items-center py-2">
                          <Clock className="h-4 w-4 text-primary animate-spin" />
                        </div>
                      ) : (
                        <div>
                          {/* Виртуализированный список пользователей */}
                          <FilteredUsersList
                            chatUsers={chatUsers}
                            currentUserId={user?.id}
                            searchQuery={userSearchQuery}
                            showAllUsers={showAllUsers}
                            selectedUserIds={newChatForm.getValues().participantIds || []}
                            onUserSelect={(userId) => {
                              const currentParticipants = newChatForm.getValues().participantIds;
                              const isSelected = currentParticipants.includes(userId);
                              
                              if (isSelected) {
                                // Если пользователь уже выбран, удаляем его из списка
                                newChatForm.setValue(
                                  'participantIds',
                                  currentParticipants.filter(id => id !== userId)
                                );
                              } else {
                                // Для группового чата можно выбрать нескольких пользователей
                                newChatForm.setValue(
                                  'participantIds',
                                  [...currentParticipants, userId]
                                );
                              }
                              
                              // Сбрасываем ошибки валидации, т.к. могли быть исправлены
                              newChatForm.trigger('participantIds');
                            }}
                            height={240}
                          />
                        </div>
                      )}
                    </div>
                    
                    <FormField
                      control={newChatForm.control}
                      name="participantIds"
                      render={() => (
                        <FormItem>
                          <div className="flex flex-wrap gap-1">
                            {newChatForm.getValues().participantIds.map((participantId) => {
                              const participant = chatUsers.find(u => u.id === participantId);
                              if (!participant) return null;
                              
                              return (
                                <Badge key={participant.id} variant="secondary" className="gap-1">
                                  {participant.firstName} {participant.lastName}
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-4 w-4 p-0"
                                    onClick={() => {
                                      const currentParticipants = newChatForm.getValues().participantIds;
                                      newChatForm.setValue(
                                        'participantIds',
                                        currentParticipants.filter(id => id !== participant.id)
                                      );
                                    }}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </Badge>
                              );
                            })}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>
              </Tabs>
              
              <FormMessage>
                {newChatForm.formState.errors.participantIds && (
                  <p className="text-sm text-destructive">
                    Выберите хотя бы одного участника
                  </p>
                )}
              </FormMessage>
              
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsNewChatDialogOpen(false)}
                >
                  Отмена
                </Button>
                <Button 
                  type="submit" 
                  disabled={
                    createChatMutation.isPending || 
                    !newChatForm.formState.isValid
                  }
                >
                  {createChatMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Создание...
                    </>
                  ) : (
                    "Создать чат"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Диалог редактирования чата */}
      {chatToEdit && (
        <EditChatDialog
          chat={chatToEdit}
          open={editChatDialogOpen}
          onOpenChange={setEditChatDialogOpen}
          onSave={(name) => {
            updateChatMutation.mutate({
              chatId: chatToEdit.id,
              name
            });
          }}
          isPending={updateChatMutation.isPending}
        />
      )}
      
      {/* Диалог подтверждения удаления чата */}
      <AlertDialog open={deleteAlertOpen} onOpenChange={setDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить чат?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить этот чат? Это действие невозможно отменить.
              Все сообщения чата будут удалены для всех участников.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (chatToDelete) {
                  deleteChatMutation.mutate(chatToDelete.id);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteChatMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Удаление...
                </>
              ) : (
                "Удалить"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Диалог подтверждения выхода из чата */}
      <AlertDialog open={leaveAlertOpen} onOpenChange={setLeaveAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Выйти из чата?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите выйти из этого чата? 
              Вы больше не будете получать сообщения от участников.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (chatToLeave) {
                  leaveChatMutation.mutate(chatToLeave.id);
                }
              }}
            >
              {leaveChatMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Выход...
                </>
              ) : (
                "Выйти"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Диалог просмотра участников чата */}
      <Dialog open={isParticipantsDialogOpen} onOpenChange={setIsParticipantsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Участники чата</DialogTitle>
            <DialogDescription>
              Список участников группового чата
            </DialogDescription>
          </DialogHeader>
          
          <div className="max-h-80 overflow-y-auto">
            {participantsLoading ? (
              <div className="flex justify-center items-center p-4">
                <Clock className="h-6 w-6 text-primary animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {chatParticipants.map((participant) => (
                  <div key={participant.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={null} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        <UserIcon className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="text-sm font-medium">
                        {participant.firstName} {participant.lastName}
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        {participant.role}
                        {participant.isAdmin && (
                          <Badge variant="outline" className="text-xs py-0 h-5">
                            Администратор
                          </Badge>
                        )}
                        {participant.id === selectedChat?.creatorId && (
                          <Badge variant="outline" className="text-xs py-0 h-5">
                            Создатель
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button onClick={() => setIsParticipantsDialogOpen(false)}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}