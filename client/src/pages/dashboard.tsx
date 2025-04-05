import { MainLayout } from "@/components/layout/main-layout";
import { StatCard } from "@/components/dashboard/stat-card";
import { SystemStatus } from "@/components/dashboard/system-status";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import { SchoolList } from "@/components/dashboard/school-list";
import { TeacherSchedule } from "@/components/dashboard/teacher-schedule";
import { StudentSchedule } from "@/components/dashboard/student-schedule";
import { HomeworkList } from "@/components/dashboard/homework-list";
import { AdminClassList } from "@/components/dashboard/admin-class-list";
import { AdminSubjectList } from "@/components/dashboard/admin-subject-list";
import { UserRoleEnum } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useRoleCheck } from "@/hooks/use-role-check";
import { 
  School, 
  Users, 
  Bell, 
  BookOpen, 
  BarChart3, 
  GraduationCap
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function Dashboard() {
  const { user } = useAuth();
  const { isSuperAdmin, isSchoolAdmin, isTeacher, isStudent, isParent, currentRole } = useRoleCheck();
  
  // Get user counts by role for admin dashboard
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    enabled: !!user && (isSuperAdmin() || isSchoolAdmin())
  });
  
  // Get number of schools for super admin
  const { data: schools = [] } = useQuery<any[]>({
    queryKey: ["/api/schools"],
    enabled: !!user
  });
  
  // Get notifications count
  const { data: notifications = [] } = useQuery<any[]>({
    queryKey: ["/api/notifications"],
    enabled: !!user
  });
  
  // Get homework count
  const { data: homework = [] } = useQuery<any[]>({
    queryKey: ["/api/homework"],
    enabled: !!user && (isTeacher() || isStudent() || isParent())
  });
  
  // Stats based on user role
  const getRoleStats = () => {
    if (!user) return [];
    
    const role = currentRole();
    if (!role) return [];
    
    switch (role) {
      case UserRoleEnum.SUPER_ADMIN:
        return [
          { title: "Школы", value: schools.length, icon: School },
          { title: "Пользователи", value: users.length, icon: Users },
          { title: "Уведомления", value: notifications.length, icon: Bell },
          { title: "Система", value: "Стабильна", icon: BarChart3 },
        ];
      case UserRoleEnum.SCHOOL_ADMIN:
        const students = users.filter(u => u.role === UserRoleEnum.STUDENT).length;
        const teachers = users.filter(u => u.role === UserRoleEnum.TEACHER).length;
        return [
          { title: "Ученики", value: students, icon: GraduationCap },
          { title: "Учителя", value: teachers, icon: Users },
          { title: "Уведомления", value: notifications.length, icon: Bell },
          { title: "Задания", value: homework.length, icon: BookOpen },
        ];
      case UserRoleEnum.TEACHER:
        return [
          { title: "Заданий", value: homework.length, icon: BookOpen },
          { title: "Уведомления", value: notifications.length, icon: Bell },
        ];
      case UserRoleEnum.STUDENT:
      case UserRoleEnum.PARENT:
        return [
          { title: "Задания", value: homework.length, icon: BookOpen },
          { title: "Уведомления", value: notifications.length, icon: Bell },
        ];
      default:
        return [];
    }
  };
  
  const stats = getRoleStats();
  
  // Dashboard content based on user role
  const getDashboardContent = () => {
    if (!user) return null;
    
    if (isSuperAdmin()) {
      return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SchoolList />
          <div className="lg:col-span-1 space-y-6">
            <SystemStatus />
            <RecentActivity />
          </div>
        </div>
      );
    }
    
    if (isSchoolAdmin()) {
      return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <AdminClassList />
          <div className="lg:col-span-1 space-y-6">
            <AdminSubjectList />
            <RecentActivity />
          </div>
        </div>
      );
    }
    
    if (isTeacher()) {
      return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <TeacherSchedule />
          <HomeworkList />
        </div>
      );
    }
    
    if (isStudent()) {
      return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <StudentSchedule />
          <HomeworkList />
        </div>
      );
    }
    
    // Для родителей и других ролей
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-lg shadow-sm p-4">
          <h3 className="text-lg font-heading font-semibold text-gray-800 mb-4">Общая статистика</h3>
          <p className="text-gray-600">Здесь будет отображаться общая статистика и отчеты.</p>
        </div>
        <HomeworkList />
      </div>
    );
  };
  
  return (
    <MainLayout>
      <h2 className="text-2xl font-heading font-bold text-gray-800 mb-4">Панель управления</h2>
      
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat, index) => (
          <StatCard 
            key={index}
            title={stat.title}
            value={stat.value}
            icon={stat.icon}
          />
        ))}
      </div>
      
      {/* Role-specific dashboard content */}
      {getDashboardContent()}
    </MainLayout>
  );
}
