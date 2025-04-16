import { encrypt, decrypt } from '../server/utils/encryption';

/**
 * Создает зашифрованное поле для использования в Drizzle
 * @param value Значение для шифрования
 * @returns Зашифрованное значение или null, если значение пустое
 */
export function encryptField(value: string | null): string | null {
  if (!value) return null;
  return encrypt(value);
}

/**
 * Проверяет, может ли строка быть зашифрованной
 * @param text Строка для проверки
 * @returns true если строка может быть зашифрованной (состоит только из hex-символов)
 */
function isPossiblyEncrypted(text: string): boolean {
  return /^[0-9a-f]+$/i.test(text);
}

/**
 * Расшифровывает поле из базы данных
 * @param value Зашифрованное значение
 * @returns Расшифрованное значение или null, если значение пустое
 */
export function decryptField(value: string | null): string | null {
  if (!value) return null;
  
  // Если строка не похожа на зашифрованную, возвращаем как есть
  if (!isPossiblyEncrypted(value)) {
    return value;
  }
  
  try {
    return decrypt(value);
  } catch (error: any) {
    // Если расшифровка не удалась, возвращаем исходное значение
    // Это позволяет работать с данными, которые были созданы до внедрения шифрования
    console.log(`Decryption failed, returning original value: ${error.message || 'Unknown error'}`);
    return value;
  }
}

/**
 * Возвращает объект с расшифрованными полями для конкретной модели
 * @param model Объект модели с зашифрованными полями
 * @param encryptedFields Список названий зашифрованных полей
 * @returns Новый объект с расшифрованными полями
 */
export function decryptModel<T extends Record<string, any>>(
  model: T, 
  encryptedFields: (keyof T)[]
): T {
  if (!model) return model;
  
  const decryptedModel = { ...model };
  
  for (const field of encryptedFields) {
    if (model[field]) {
      decryptedModel[field] = decryptField(model[field]) as any;
    }
  }
  
  return decryptedModel;
}

/**
 * Зашифровывает указанные поля в объекте модели
 * @param model Объект модели с расшифрованными полями
 * @param encryptedFields Список названий полей для шифрования
 * @returns Новый объект с зашифрованными полями
 */
export function encryptModel<T extends Record<string, any>>(
  model: T, 
  encryptedFields: (keyof T)[]
): T {
  if (!model) return model;
  
  const encryptedModel = { ...model };
  
  for (const field of encryptedFields) {
    if (model[field]) {
      encryptedModel[field] = encryptField(model[field]) as any;
    }
  }
  
  return encryptedModel;
}