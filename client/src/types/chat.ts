import { z } from "zod";

export type ChatTypeEnum = "private" | "group";

export interface ChatUser {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  role: string;
  isAdmin?: boolean;
  lastReadMessageId?: number | null;
}

export interface Chat {
  id: number;
  name: string;
  type: ChatTypeEnum;
  creatorId: number;
  schoolId: number;
  avatarUrl: string | null;
  createdAt: string;
  lastMessageAt: string | null;
  participants?: ChatUser[];
  unreadCount?: number;
}

export interface ChatMessage {
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

export const messageFormSchema = z.object({
  content: z.string().optional(),
  attachmentFile: z.instanceof(File).optional(),
});

export const newChatFormSchema = z.object({
  name: z.string().min(1, "Название обязательно для группового чата").optional(),
  type: z.enum(["private", "group"]),
  participantIds: z.array(z.number()).min(1, "Выберите хотя бы одного участника"),
});

export type MessageFormValues = z.infer<typeof messageFormSchema>;
export type NewChatFormValues = z.infer<typeof newChatFormSchema>;