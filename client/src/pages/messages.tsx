import { useState, useEffect, useRef } from "react";
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
  X
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// Типы для интерфейса сообщений и чатов
interface ChatUser {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  role: string;
  isAdmin?: boolean;
  lastReadMessageId?: number | null;
}

interface Chat {
  id: number;
  name: string;
  type: 'private' | 'group';
  creatorId: number;
  schoolId: number;
  avatarUrl: string | null;
  createdAt: string;
  lastMessageAt: string | null;
  participants?: ChatUser[];
}

interface ChatMessage {
  id: number;
  chatId: number;
  senderId: number;
  content: string | null;
  hasAttachment: boolean;
  attachmentType: string | null;
  attachmentUrl: string | null;
  isRead: boolean;
  sentAt: string;
  sender?: {
    id: number;
    firstName: string;
    lastName: string;
  };
}

// Схема для создания нового сообщения
const messageFormSchema = z.object({
  content: z.string().optional(),
  attachmentFile: z.instanceof(File).optional(),
});

type MessageFormValues = z.infer<typeof messageFormSchema>;

// Схема для создания нового чата
const newChatFormSchema = z.object({
  name: z.string().min(1, "Введите название чата"),
  type: z.enum(["private", "group"], {
    required_error: "Выберите тип чата",
  }),
  participantIds: z.array(z.number()).min(1, "Добавьте хотя бы одного участника"),
});

type NewChatFormValues = z.infer<typeof newChatFormSchema>;

export default function MessagesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Состояния для UI
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [isNewChatDialogOpen, setIsNewChatDialogOpen] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<File | null>(null);
  
  // Получение списка чатов пользователя
  const { data: chats = [], isLoading: chatsLoading } = useQuery<Chat[]>({
    queryKey: ["/api/chats"],
    enabled: !!user,
    refetchInterval: 10000, // Обновляем каждые 10 секунд
  });
  
  // Получение списка сообщений для выбранного чата
  const { data: chatMessages = [], isLoading: messagesLoading } = useQuery<ChatMessage[]>({
    queryKey: ["/api/chats", selectedChatId, "messages"],
    enabled: !!selectedChatId,
    refetchInterval: 5000, // Обновляем каждые 5 секунд
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
        
        // Здесь должен быть код для загрузки файла на сервер
        // Для демонстрации мы просто создаем фейковый URL
        attachmentUrl = URL.createObjectURL(data.attachmentFile);
      }
      
      // Отправляем сообщение
      const res = await apiRequest(`/api/chats/${data.chatId}/messages`, "POST", {
        content: data.content,
        hasAttachment,
        attachmentType,
        attachmentUrl,
      });
      
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chats", selectedChatId, "messages"] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chats"] });
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
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);
  
  // Обработка прочтения сообщений при выборе чата
  useEffect(() => {
    if (selectedChatId && chatMessages.length > 0) {
      const lastMessage = chatMessages[chatMessages.length - 1];
      
      // Если последнее сообщение от другого пользователя и не прочитано
      if (lastMessage.senderId !== user?.id && !lastMessage.isRead) {
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
  
  // Фильтрация чатов по поисковому запросу
  const filteredChats = chats.filter(chat => {
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
  
  // Получение выбранного чата
  const selectedChat = selectedChatId ? chats.find(c => c.id === selectedChatId) : null;
  
  // Получаем сообщения для выбранного чата, отсортированные по времени
  const sortedMessages = [...chatMessages].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
  );
  
  // Получение количества непрочитанных сообщений для чата
  const getUnreadCount = (chat: Chat) => {
    if (!chat.participants) return 0;
    
    const myParticipation = chat.participants.find(p => p.id === user?.id);
    if (!myParticipation) return 0;
    
    const lastReadId = myParticipation.lastReadMessageId || 0;
    
    // Запрашиваем сообщения для этого чата
    const chatMsgs = chatMessages.filter(m => m.chatId === chat.id);
    
    // Считаем количество сообщений, которые пришли после последнего прочитанного
    return chatMsgs.filter(m => 
      m.senderId !== user?.id && // Не от текущего пользователя
      m.id > lastReadId // ID больше последнего прочитанного
    ).length;
  };
  
  // Форматирование времени сообщения
  const formatMessageTime = (dateStr: string) => {
    const now = new Date();
    const messageDate = new Date(dateStr);
    
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
  };
  
  // Получение имени пользователя по ID
  const getUserName = (userId: number) => {
    const found = chatUsers.find(u => u.id === userId);
    return found ? `${found.firstName} ${found.lastName}` : `Пользователь ${userId}`;
  };
  
  // Получение инициалов пользователя
  const getUserInitials = (userId: number) => {
    const found = chatUsers.find(u => u.id === userId);
    return found ? found.firstName.charAt(0) + found.lastName.charAt(0) : "??";
  };
  
  // Получение названия для чата
  const getChatName = (chat: Chat) => {
    // Для личных чатов показываем имя собеседника
    if (chat.type === 'private' && chat.participants) {
      const otherParticipant = chat.participants.find(p => p.id !== user?.id);
      if (otherParticipant) {
        return `${otherParticipant.firstName} ${otherParticipant.lastName}`;
      }
    }
    
    // Для групповых чатов показываем название чата
    return chat.name;
  };
  
  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-heading font-bold text-gray-800">Сообщения</h2>
        <Button onClick={() => setIsNewChatDialogOpen(true)}>
          <PlusCircle className="h-4 w-4 mr-2" />
          Новый чат
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Список чатов */}
        <div className="md:col-span-1">
          <Card className="h-[calc(100vh-220px)]">
            <CardHeader className="p-4 pb-2">
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <Input 
                  placeholder="Поиск чатов..." 
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-300px)]">
                {chatsLoading ? (
                  <div className="flex justify-center items-center h-20">
                    <Clock className="h-5 w-5 text-primary animate-spin" />
                  </div>
                ) : filteredChats.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-500">
                    <MessagesSquare className="h-8 w-8 mb-2" />
                    {searchQuery ? "Чаты не найдены" : "У вас пока нет чатов"}
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setIsNewChatDialogOpen(true)}
                      className="mt-2"
                    >
                      Создать чат
                    </Button>
                  </div>
                ) : (
                  filteredChats.map(chat => {
                    const unreadCount = getUnreadCount(chat);
                    const isSelected = chat.id === selectedChatId;
                    const chatName = getChatName(chat);
                    
                    return (
                      <div 
                        key={chat.id}
                        className={`flex items-center p-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100 ${
                          isSelected ? 'bg-primary/10' : ''
                        }`}
                        onClick={() => setSelectedChatId(chat.id)}
                      >
                        <Avatar className="h-10 w-10 mr-3">
                          {chat.avatarUrl ? (
                            <AvatarImage src={chat.avatarUrl} alt={chatName} />
                          ) : (
                            <AvatarFallback className={isSelected ? 'bg-primary text-white' : 'bg-gray-200'}>
                              {chat.type === 'group' ? (
                                <Users className="h-4 w-4" />
                              ) : chat.participants ? (
                                chat.participants
                                  .find(p => p.id !== user?.id)?.firstName.charAt(0) +
                                chat.participants
                                  .find(p => p.id !== user?.id)?.lastName.charAt(0)
                              ) : "??"}
                            </AvatarFallback>
                          )}
                        </Avatar>
                        <div className="flex-grow">
                          <div className="flex justify-between">
                            <p className="font-medium text-gray-800">
                              {chatName}
                            </p>
                            {chat.lastMessageAt && (
                              <p className="text-xs text-gray-500">
                                {formatMessageTime(chat.lastMessageAt)}
                              </p>
                            )}
                          </div>
                          {chat.type === 'group' && (
                            <p className="text-xs text-gray-500">
                              {chat.participants ? `${chat.participants.length} участников` : ''}
                            </p>
                          )}
                        </div>
                        {unreadCount > 0 && (
                          <span className="bg-primary text-white text-xs px-2 py-1 rounded-full ml-2">
                            {unreadCount}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
        
        {/* Окно переписки */}
        <div className="md:col-span-2">
          <Card className="h-[calc(100vh-220px)] flex flex-col">
            {selectedChat ? (
              <>
                <CardHeader className="p-4 pb-2 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Avatar className="h-10 w-10 mr-3">
                        {selectedChat.avatarUrl ? (
                          <AvatarImage src={selectedChat.avatarUrl} alt={getChatName(selectedChat)} />
                        ) : (
                          <AvatarFallback className="bg-primary text-white">
                            {selectedChat.type === 'group' ? (
                              <Users className="h-4 w-4" />
                            ) : selectedChat.participants ? (
                              selectedChat.participants
                                .find(p => p.id !== user?.id)?.firstName.charAt(0) +
                              selectedChat.participants
                                .find(p => p.id !== user?.id)?.lastName.charAt(0)
                            ) : "??"}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div>
                        <CardTitle className="text-lg">{getChatName(selectedChat)}</CardTitle>
                        {selectedChat.type === 'group' && selectedChat.participants && (
                          <p className="text-xs text-gray-500">
                            {selectedChat.participants.length} участников
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="flex-grow p-0 overflow-hidden">
                  <ScrollArea className="h-[calc(100vh-350px)] px-4" ref={scrollRef}>
                    {messagesLoading ? (
                      <div className="flex justify-center items-center h-20">
                        <Clock className="h-5 w-5 text-primary animate-spin" />
                      </div>
                    ) : sortedMessages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-gray-500 py-10">
                        <MessagesSquare className="h-12 w-12 mb-4" />
                        <p>Нет сообщений. Начните общение!</p>
                      </div>
                    ) : (
                      <div className="space-y-4 py-4">
                        {sortedMessages.map(message => {
                          const isSentByUser = message.senderId === user?.id;
                          const senderName = message.sender ? 
                            `${message.sender.firstName} ${message.sender.lastName}` : 
                            getUserName(message.senderId);
                          
                          return (
                            <div 
                              key={message.id} 
                              className={`flex ${isSentByUser ? 'justify-end' : 'justify-start'}`}
                            >
                              <div 
                                className={`max-w-[80%] p-3 rounded-lg ${
                                  isSentByUser 
                                    ? 'bg-primary text-white rounded-tr-none' 
                                    : 'bg-gray-100 text-gray-800 rounded-tl-none'
                                }`}
                              >
                                {selectedChat.type === 'group' && !isSentByUser && (
                                  <p className={`text-xs font-medium mb-1 ${
                                    isSentByUser ? 'text-primary-50' : 'text-gray-500'
                                  }`}>
                                    {senderName}
                                  </p>
                                )}
                                
                                {message.content && (
                                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                                )}
                                
                                {message.hasAttachment && message.attachmentUrl && (
                                  <div className="mt-2">
                                    {message.attachmentType === 'image' ? (
                                      <img 
                                        src={message.attachmentUrl} 
                                        alt="Изображение" 
                                        className="max-w-full rounded"
                                      />
                                    ) : message.attachmentType === 'video' ? (
                                      <video 
                                        src={message.attachmentUrl}
                                        controls
                                        className="max-w-full rounded"
                                      />
                                    ) : (
                                      <div className="flex items-center p-2 bg-white/20 rounded">
                                        <FileIcon className="h-4 w-4 mr-2" />
                                        <span className="text-sm truncate">Документ</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                                
                                <div 
                                  className={`flex items-center text-xs mt-1 ${
                                    isSentByUser ? 'text-primary-50' : 'text-gray-500'
                                  }`}
                                >
                                  <span>{formatMessageTime(message.sentAt)}</span>
                                  {isSentByUser && (
                                    <CheckCircle 
                                      className={`h-3 w-3 ml-1 ${
                                        message.isRead ? 'text-white' : 'text-primary-50'
                                      }`} 
                                    />
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
                
                <CardFooter className="p-4 border-t">
                  {selectedAttachment && (
                    <div className="flex items-center mb-2 p-2 bg-gray-100 rounded-md w-full">
                      {selectedAttachment.type.startsWith('image/') ? (
                        <Image className="h-4 w-4 mr-2 text-gray-600" />
                      ) : (
                        <FileIcon className="h-4 w-4 mr-2 text-gray-600" />
                      )}
                      <span className="text-sm text-gray-600 flex-grow truncate">
                        {selectedAttachment.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelAttachment}
                        className="ml-2 h-6 w-6 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  
                  <Form {...messageForm}>
                    <form 
                      onSubmit={messageForm.handleSubmit(onSubmitMessage)} 
                      className="flex gap-2 w-full"
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={openFileDialog}
                        className="h-10 w-10"
                      >
                        <PaperclipIcon className="h-4 w-4" />
                      </Button>
                      <FormField
                        control={messageForm.control}
                        name="content"
                        render={({ field }) => (
                          <FormItem className="flex-grow">
                            <FormControl>
                              <Textarea 
                                placeholder="Введите сообщение..." 
                                className="resize-none min-h-[60px]" 
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button 
                        type="submit" 
                        className="self-end" 
                        disabled={sendMessageMutation.isPending}
                      >
                        <Send className="h-4 w-4" />
                        <span className="sr-only">Отправить</span>
                      </Button>
                    </form>
                  </Form>
                </CardFooter>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <MessagesSquare className="h-12 w-12 mb-4" />
                <p>Выберите чат слева или создайте новый</p>
                <Button 
                  variant="outline" 
                  onClick={() => setIsNewChatDialogOpen(true)}
                  className="mt-4"
                >
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Создать чат
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
      
      {/* Диалог создания нового чата */}
      <Dialog open={isNewChatDialogOpen} onOpenChange={setIsNewChatDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Создать новый чат</DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="private">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="private">Личный чат</TabsTrigger>
              <TabsTrigger value="group">Групповой чат</TabsTrigger>
            </TabsList>
            
            <Form {...newChatForm}>
              <form onSubmit={newChatForm.handleSubmit(onSubmitNewChat)}>
                <TabsContent value="private" className="space-y-4 mt-4">
                  <div className="space-y-4">
                    <FormField
                      control={newChatForm.control}
                      name="participantIds"
                      render={() => (
                        <FormItem>
                          <Select
                            onValueChange={(value) => {
                              const userId = parseInt(value);
                              newChatForm.setValue("participantIds", [userId]);
                              
                              // Для личного чата используем имя собеседника
                              const participant = chatUsers.find(u => u.id === userId);
                              if (participant) {
                                newChatForm.setValue("name", `${participant.firstName} ${participant.lastName}`);
                              }
                              
                              // Устанавливаем тип чата как личный
                              newChatForm.setValue("type", "private");
                            }}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Выберите собеседника" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {usersLoading ? (
                                <div className="flex justify-center items-center py-2">
                                  <Clock className="h-4 w-4 text-primary animate-spin" />
                                </div>
                              ) : (
                                chatUsers
                                  .filter(u => u.id !== user?.id)
                                  .map(u => (
                                    <SelectItem key={u.id} value={u.id.toString()}>
                                      {u.firstName} {u.lastName} ({u.role})
                                    </SelectItem>
                                  ))
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>
                
                <TabsContent value="group" className="space-y-4 mt-4">
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
                  
                  <div>
                    <h4 className="text-sm font-medium mb-2">Выберите участников</h4>
                    <div className="border rounded-md p-2 max-h-60 overflow-y-auto space-y-2">
                      {usersLoading ? (
                        <div className="flex justify-center items-center py-2">
                          <Clock className="h-4 w-4 text-primary animate-spin" />
                        </div>
                      ) : (
                        chatUsers
                          .filter(u => u.id !== user?.id)
                          .map(u => {
                            const id = u.id.toString();
                            return (
                              <div key={id} className="flex items-center space-x-2">
                                <Checkbox 
                                  id={`user-${id}`}
                                  checked={newChatForm.getValues().participantIds.includes(u.id)}
                                  onCheckedChange={(checked) => {
                                    const currentParticipants = newChatForm.getValues().participantIds;
                                    if (checked) {
                                      newChatForm.setValue("participantIds", [...currentParticipants, u.id]);
                                    } else {
                                      newChatForm.setValue(
                                        "participantIds", 
                                        currentParticipants.filter(pid => pid !== u.id)
                                      );
                                    }
                                    
                                    // Устанавливаем тип чата как групповой
                                    newChatForm.setValue("type", "group");
                                  }}
                                />
                                <label 
                                  htmlFor={`user-${id}`}
                                  className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                  {u.firstName} {u.lastName}
                                  <span className="text-xs text-gray-500 ml-1">
                                    ({u.role === UserRoleEnum.TEACHER ? 'Учитель' : 
                                     u.role === UserRoleEnum.STUDENT ? 'Ученик' : 
                                     u.role === UserRoleEnum.PARENT ? 'Родитель' : 
                                     u.role})
                                  </span>
                                </label>
                              </div>
                            )
                          })
                      )}
                    </div>
                    {newChatForm.formState.errors.participantIds && (
                      <p className="text-sm font-medium text-destructive mt-1">
                        {newChatForm.formState.errors.participantIds.message}
                      </p>
                    )}
                    
                    {/* Показываем выбранных участников */}
                    {newChatForm.getValues().participantIds.length > 0 && (
                      <div className="mt-2">
                        <h4 className="text-sm font-medium mb-1">Выбрано участников: {newChatForm.getValues().participantIds.length}</h4>
                        <div className="flex flex-wrap gap-1">
                          {newChatForm.getValues().participantIds.map(pid => {
                            const participant = chatUsers.find(u => u.id === pid);
                            if (!participant) return null;
                            
                            return (
                              <Badge key={pid} variant="secondary" className="flex items-center gap-1">
                                {participant.firstName} {participant.lastName}
                                <X 
                                  className="h-3 w-3 cursor-pointer" 
                                  onClick={() => {
                                    const currentParticipants = newChatForm.getValues().participantIds;
                                    newChatForm.setValue(
                                      "participantIds", 
                                      currentParticipants.filter(id => id !== pid)
                                    );
                                  }}
                                />
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
                
                <DialogFooter className="mt-6">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsNewChatDialogOpen(false)}
                  >
                    Отмена
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createChatMutation.isPending}
                  >
                    {createChatMutation.isPending && (
                      <Clock className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Создать чат
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </Tabs>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
