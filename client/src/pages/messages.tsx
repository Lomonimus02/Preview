import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { useAuth } from "@/hooks/use-auth";
import { UserRoleEnum, Message, insertMessageSchema, User } from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Search, Send, User as UserIcon, CheckCircle, Clock, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Avatar,
  AvatarFallback,
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
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// Schema for sending messages
const messageFormSchema = z.object({
  receiverId: z.number({
    required_error: "Выберите получателя",
  }),
  content: z.string().min(1, "Введите текст сообщения"),
});

type MessageFormValues = z.infer<typeof messageFormSchema>;

export default function MessagesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [contacts, setContacts] = useState<User[]>([]);
  
  // Fetch messages
  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages"],
    enabled: !!user,
    refetchInterval: 10000 // Refetch every 10 seconds to check for new messages
  });
  
  // Fetch users for contacts
  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: !!user
  });
  
  // Form for sending messages
  const form = useForm<MessageFormValues>({
    resolver: zodResolver(messageFormSchema),
    defaultValues: {
      receiverId: undefined,
      content: "",
    },
  });
  
  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (data: MessageFormValues) => {
      const res = await apiRequest("POST", "/api/messages", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      form.setValue("content", "");
      toast({
        title: "Сообщение отправлено",
        description: "Ваше сообщение успешно отправлено",
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось отправить сообщение",
        variant: "destructive",
      });
    },
  });
  
  // Mark message as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (messageId: number) => {
      const res = await apiRequest("POST", `/api/messages/${messageId}/read`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
    },
  });
  
  // Extract unique contacts from messages
  useEffect(() => {
    if (users.length === 0 || messages.length === 0) return;
    
    const contactIds = new Set<number>();
    
    // Add contacts from sent and received messages
    messages.forEach(message => {
      if (message.senderId !== user?.id) {
        contactIds.add(message.senderId);
      }
      if (message.receiverId !== user?.id) {
        contactIds.add(message.receiverId);
      }
    });
    
    // Filter users to only include contacts
    const contactList = users.filter(u => contactIds.has(u.id));
    
    // Select first contact if none selected
    if (contactList.length > 0 && !selectedContactId) {
      setSelectedContactId(contactList[0].id);
    }
    
    setContacts(contactList);
  }, [messages, users, user, selectedContactId]);
  
  // Handle form submission
  const onSubmit = (values: MessageFormValues) => {
    sendMessageMutation.mutate(values);
  };
  
  // Select a contact
  const selectContact = (contactId: number) => {
    setSelectedContactId(contactId);
    
    // If sending to a new recipient, update the form
    form.setValue("receiverId", contactId);
    
    // Mark unread messages from this contact as read
    const unreadMessages = messages.filter(
      m => m.senderId === contactId && m.receiverId === user?.id && !m.isRead
    );
    
    unreadMessages.forEach(m => {
      markAsReadMutation.mutate(m.id);
    });
  };
  
  // Filter contacts based on search
  const filteredContacts = contacts.filter(contact => {
    const fullName = `${contact.firstName} ${contact.lastName}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });
  
  // Get messages for the selected contact
  const contactMessages = messages.filter(
    m => (m.senderId === selectedContactId && m.receiverId === user?.id) || 
         (m.receiverId === selectedContactId && m.senderId === user?.id)
  ).sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
  
  // Get unread message count for a contact
  const getUnreadCount = (contactId: number) => {
    return messages.filter(
      m => m.senderId === contactId && m.receiverId === user?.id && !m.isRead
    ).length;
  };
  
  // Helper to format time
  const formatMessageTime = (date: Date) => {
    const now = new Date();
    const messageDate = new Date(date);
    
    // If message is from today, show only time
    if (messageDate.toDateString() === now.toDateString()) {
      return messageDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    
    // If message is from this year, show date without year
    if (messageDate.getFullYear() === now.getFullYear()) {
      return messageDate.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) + 
             ' ' + 
             messageDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    
    // Otherwise show full date
    return messageDate.toLocaleDateString('ru-RU') + 
           ' ' + 
           messageDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };
  
  // Get user name by id
  const getUserName = (userId: number) => {
    const userFound = users.find(u => u.id === userId);
    return userFound ? `${userFound.firstName} ${userFound.lastName}` : `Пользователь ${userId}`;
  };
  
  // Get user initials
  const getUserInitials = (userId: number) => {
    const userFound = users.find(u => u.id === userId);
    return userFound ? userFound.firstName[0] + userFound.lastName[0] : "??";
  };
  
  // Create a new message
  const newMessageForm = useForm<{ receiverId: number }>({
    defaultValues: {
      receiverId: undefined,
    },
  });
  
  const startNewConversation = (userId: number) => {
    setSelectedContactId(userId);
    form.setValue("receiverId", userId);
  };
  
  return (
    <MainLayout>
      <h2 className="text-2xl font-heading font-bold text-gray-800 mb-6">Сообщения</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Contacts Column */}
        <div className="md:col-span-1">
          <Card className="h-[calc(100vh-220px)]">
            <CardHeader className="p-4 pb-2">
              <div className="flex justify-between items-center mb-2">
                <CardTitle className="text-lg">Контакты</CardTitle>
                <Select 
                  onValueChange={(value) => startNewConversation(parseInt(value))}
                >
                  <SelectTrigger className="w-auto">
                    <Button variant="ghost" size="sm">
                      <Send className="h-4 w-4 mr-2" />
                      Новое сообщение
                    </Button>
                  </SelectTrigger>
                  <SelectContent>
                    {users
                      .filter(u => u.id !== user?.id)
                      .map(u => (
                        <SelectItem key={u.id} value={u.id.toString()}>
                          {u.firstName} {u.lastName}
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <Input 
                  placeholder="Поиск контактов..." 
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-300px)]">
                {usersLoading || messagesLoading ? (
                  <div className="flex justify-center items-center h-20">
                    <Clock className="h-5 w-5 text-primary animate-spin" />
                  </div>
                ) : filteredContacts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-500">
                    <UserIcon className="h-8 w-8 mb-2" />
                    {searchQuery ? "Контакты не найдены" : "Нет контактов"}
                  </div>
                ) : (
                  filteredContacts.map(contact => {
                    const unreadCount = getUnreadCount(contact.id);
                    const isSelected = contact.id === selectedContactId;
                    
                    return (
                      <div 
                        key={contact.id}
                        className={`flex items-center p-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100 ${
                          isSelected ? 'bg-primary-50' : ''
                        }`}
                        onClick={() => selectContact(contact.id)}
                      >
                        <Avatar className="h-10 w-10 mr-3">
                          <AvatarFallback className={isSelected ? 'bg-primary text-white' : 'bg-gray-200'}>
                            {contact.firstName[0]}{contact.lastName[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-grow">
                          <p className="font-medium text-gray-800">
                            {contact.firstName} {contact.lastName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {contact.role === UserRoleEnum.TEACHER ? 'Учитель' : 
                             contact.role === UserRoleEnum.STUDENT ? 'Ученик' : 
                             contact.role === UserRoleEnum.PARENT ? 'Родитель' : 
                             contact.role}
                          </p>
                        </div>
                        {unreadCount > 0 && (
                          <span className="bg-primary text-white text-xs px-2 py-1 rounded-full">
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
        
        {/* Messages Column */}
        <div className="md:col-span-2">
          <Card className="h-[calc(100vh-220px)] flex flex-col">
            <CardHeader className="p-4 pb-2 border-b">
              {selectedContactId ? (
                <div className="flex items-center">
                  <Avatar className="h-10 w-10 mr-3">
                    <AvatarFallback className="bg-primary text-white">
                      {getUserInitials(selectedContactId)}
                    </AvatarFallback>
                  </Avatar>
                  <CardTitle className="text-lg">{getUserName(selectedContactId)}</CardTitle>
                </div>
              ) : (
                <CardTitle className="text-lg">Выберите контакт</CardTitle>
              )}
            </CardHeader>
            
            <CardContent className="flex-grow p-0 overflow-hidden">
              {!selectedContactId ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <MessagesSquare className="h-12 w-12 mb-4" />
                  <p>Выберите контакт, чтобы начать общение</p>
                </div>
              ) : contactMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <MessagesSquare className="h-12 w-12 mb-4" />
                  <p>Нет сообщений. Начните общение!</p>
                </div>
              ) : (
                <ScrollArea className="h-[calc(100vh-380px)] p-4">
                  <div className="space-y-4 mb-4">
                    {contactMessages.map(message => {
                      const isSentByUser = message.senderId === user?.id;
                      
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
                            <p>{message.content}</p>
                            <div 
                              className={`flex items-center text-xs mt-1 ${
                                isSentByUser ? 'text-primary-50' : 'text-gray-500'
                              }`}
                            >
                              <span>{formatMessageTime(new Date(message.sentAt))}</span>
                              {isSentByUser && (
                                <CheckCircle className={`h-3 w-3 ml-1 ${message.isRead ? 'text-white' : 'text-primary-50'}`} />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
            
            {selectedContactId && (
              <div className="p-4 border-t">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-2">
                    <FormField
                      control={form.control}
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
                    <Button type="submit" className="self-end" disabled={sendMessageMutation.isPending}>
                      <Send className="h-4 w-4" />
                      <span className="sr-only">Отправить</span>
                    </Button>
                  </form>
                </Form>
              </div>
            )}
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
