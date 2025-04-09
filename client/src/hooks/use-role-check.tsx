import { useAuth } from "./use-auth";
import { UserRoleEnum } from "@shared/schema";
import { useState, useEffect } from "react";

/**
 * Хук для проверки текущей активной роли пользователя
 * Используется для условного рендеринга компонентов в зависимости от роли
 * @param requiredRoles - Необязательный параметр: список ролей, которые должны быть у пользователя
 */
export function useRoleCheck(requiredRoles?: UserRoleEnum[]) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    // Простая имитация загрузки для проверки ролей
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [user]);
  
  // Получаем активную роль пользователя
  const activeRole = user?.activeRole || user?.role;
  
  // Функция для проверки, имеет ли пользователь одну из указанных ролей
  const hasRole = (roles: UserRoleEnum[]) => {
    if (!activeRole) return false;
    return roles.includes(activeRole);
  };
  
  // Функция для проверки, является ли пользователь админом (суперадмин или школьный админ)
  const isAdmin = () => {
    if (!activeRole) return false;
    return [UserRoleEnum.SUPER_ADMIN, UserRoleEnum.SCHOOL_ADMIN].includes(activeRole);
  };
  
  // Функция для проверки, является ли пользователь суперадмином
  const isSuperAdmin = () => {
    if (!activeRole) return false;
    return activeRole === UserRoleEnum.SUPER_ADMIN;
  };
  
  // Функция для проверки, является ли пользователь школьным админом
  const isSchoolAdmin = () => {
    if (!activeRole) return false;
    return activeRole === UserRoleEnum.SCHOOL_ADMIN;
  };
  
  // Функция для проверки, является ли пользователь учителем
  const isTeacher = () => {
    if (!activeRole) return false;
    return activeRole === UserRoleEnum.TEACHER;
  };
  
  // Функция для проверки, является ли пользователь классным руководителем
  const isClassTeacher = () => {
    if (!activeRole) return false;
    return activeRole === UserRoleEnum.CLASS_TEACHER;
  };
  
  // Функция для проверки, является ли пользователь учеником
  const isStudent = () => {
    if (!activeRole) return false;
    return activeRole === UserRoleEnum.STUDENT;
  };
  
  // Функция для проверки, является ли пользователь родителем
  const isParent = () => {
    if (!activeRole) return false;
    return activeRole === UserRoleEnum.PARENT;
  };
  
  // Получаем текущую активную роль
  const currentRole = () => activeRole;
  
  // Если переданы требуемые роли, проверяем их
  const hasRequiredRole = requiredRoles ? hasRole(requiredRoles) : true;
  
  return {
    hasRole,
    isAdmin: hasRequiredRole && isAdmin(),
    isSuperAdmin: isSuperAdmin,
    isSchoolAdmin: isSchoolAdmin,
    isTeacher: isTeacher,
    isClassTeacher: isClassTeacher,
    isStudent: isStudent,
    isParent: isParent,
    currentRole,
    isLoading
  };
}