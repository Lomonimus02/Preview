import { decryptModel, encryptModel } from '../../shared/encryption-wrappers';
import { User, Message, InsertUser, InsertMessage } from '@shared/schema';

// Список полей, которые должны быть зашифрованы для каждой модели
export const encryptedFields = {
  users: ['email', 'phone'] as (keyof User)[],
  messages: ['content'] as (keyof Message)[]
};

// Функции для обработки пользователей
export function decryptUser(user: User | null): User | null {
  if (!user) return null;
  return decryptModel(user, encryptedFields.users);
}

export function encryptUser(user: InsertUser): InsertUser {
  if (!user) return user;
  return encryptModel(user, encryptedFields.users as (keyof InsertUser)[]);
}

// Функции для обработки сообщений
export function decryptMessage(message: Message | null): Message | null {
  if (!message) return null;
  return decryptModel(message, encryptedFields.messages);
}

export function encryptMessage(message: InsertMessage): InsertMessage {
  if (!message) return message;
  return encryptModel(message, encryptedFields.messages as (keyof InsertMessage)[]);
}

// Функция для расшифровки массива сообщений
export function decryptMessages(messages: Message[]): Message[] {
  return messages.map(message => decryptMessage(message)) as Message[];
}

// Функция для расшифровки массива пользователей
export function decryptUsers(users: User[]): User[] {
  return users.map(user => decryptUser(user)) as User[];
}