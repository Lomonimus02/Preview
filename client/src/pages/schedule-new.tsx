import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Schedule, Class, Subject, User } from "@shared/schema";
import { ScheduleCarousel } from "@/components/schedule/schedule-carousel";
import { UserRoleEnum } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Plus, Loader2, CalendarIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminScheduleForm } from "@/components/schedule/admin-schedule-form";
import { useAuth } from "@/hooks/use-auth";

export default function ScheduleNewPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');

  // Get user role
  const isTeacher = user?.role === UserRoleEnum.TEACHER;
  const isAdmin = user?.role === UserRoleEnum.ADMIN || user?.role === UserRoleEnum.SUPER_ADMIN;
  const isStudent = user?.role === UserRoleEnum.STUDENT;
  const isParent = user?.role === UserRoleEnum.PARENT;

  // Get day of week (1-7 where 1 is Monday and 7 is Sunday)
  const getDayOfWeek = (date: Date) => {
    const day = date.getDay();
    return day === 0 ? 7 : day;
  };

  // Get schedules
  const {
    data: schedules = [],
    isLoading: isLoadingSchedules,
    error: schedulesError,
  } = useQuery({
    queryKey: ["/api/schedules"],
  });

  // Get classes
  const {
    data: classes = [],
    isLoading: isLoadingClasses,
    error: classesError,
  } = useQuery({
    queryKey: ["/api/classes"],
  });

  // Get subjects
  const {
    data: subjects = [],
    isLoading: isLoadingSubjects,
    error: subjectsError,
  } = useQuery({
    queryKey: ["/api/subjects"],
  });

  // Get users (teachers)
  const {
    data: users = [],
    isLoading: isLoadingUsers,
    error: usersError,
  } = useQuery({
    queryKey: ["/api/users"],
  });

  // Filter users to get only teachers
  const teachers = users?.filter(u => u.role === UserRoleEnum.TEACHER) || [];

  // Filter schedules by teacher if the user is a teacher
  const filteredSchedules = schedules?.filter(schedule => {
    if (isTeacher) {
      return schedule.teacherId === user?.id;
    }
    return true;
  });

  // Check errors
  const hasErrors = schedulesError || classesError || subjectsError || usersError;
  
  // Check loading states
  const isLoading = isLoadingSchedules || isLoadingClasses || isLoadingSubjects || isLoadingUsers;

  // Handle date select
  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
  };

  // Handle add schedule
  const handleAddSchedule = () => {
    setSelectedSchedule(null);
    setFormMode('add');
    setIsFormOpen(true);
  };

  // Handle edit schedule
  const handleEditSchedule = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setFormMode('edit');
    setIsFormOpen(true);
  };

  // Handle form close
  const handleFormClose = () => {
    setIsFormOpen(false);
    setSelectedSchedule(null);
  };

  return (
    <div className="container py-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Расписание</h1>
          <p className="text-muted-foreground">
            Просмотр и управление расписанием занятий
          </p>
        </div>

        {(isAdmin || isTeacher) && (
          <Button onClick={handleAddSchedule}>
            <Plus className="mr-2 h-4 w-4" />
            Добавить урок
          </Button>
        )}
      </div>

      {hasErrors && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Ошибка</AlertTitle>
          <AlertDescription>
            Произошла ошибка при загрузке данных. Пожалуйста, попробуйте позже.
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <div className="flex justify-between">
            <Skeleton className="h-10 w-[250px]" />
            <Skeleton className="h-10 w-[150px]" />
          </div>
          <Skeleton className="h-[350px] w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          <ScheduleCarousel
            schedules={filteredSchedules}
            classes={classes}
            subjects={subjects}
            users={users}
            onDateSelect={handleDateSelect}
            selectedDate={selectedDate}
          />
        </div>
      )}

      {isFormOpen && (
        <AdminScheduleForm
          isOpen={isFormOpen}
          onClose={handleFormClose}
          classes={classes}
          subjects={subjects}
          teachers={teachers}
          selectedSchedule={selectedSchedule}
          mode={formMode}
        />
      )}
    </div>
  );
}