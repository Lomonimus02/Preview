import { ClockIcon, BookOpenCheck, CheckCircleIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Schedule, Subject, Class, Assignment, AssignmentTypeEnum } from "@shared/schema";
import { Badge } from "@/components/ui/badge";

export function TeacherSchedule() {
  const { user } = useAuth();
  
  const { data: schedules = [], isLoading: schedulesLoading } = useQuery<Schedule[]>({
    queryKey: ["/api/schedules"],
    enabled: !!user
  });
  
  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ["/api/subjects"],
    enabled: !!user
  });
  
  const { data: classes = [] } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
    enabled: !!user
  });
  
  const { data: assignments = [] } = useQuery<Assignment[]>({
    queryKey: ["/api/assignments"],
    enabled: !!user
  });
  
  // Get today's schedules
  const today = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.
  const dayOfWeek = today === 0 ? 7 : today; // Convert to 1-7 format where 1 is Monday, 7 is Sunday
  
  const todaySchedules = schedules
    .filter(schedule => schedule.dayOfWeek === dayOfWeek)
    .sort((a, b) => {
      // Sort by start time
      const timeA = a.startTime.split(':').map(Number);
      const timeB = b.startTime.split(':').map(Number);
      
      if (timeA[0] !== timeB[0]) return timeA[0] - timeB[0];
      return timeA[1] - timeB[1];
    });
  
  // Function to get subject name by ID
  const getSubjectName = (subjectId: number) => {
    const subject = subjects.find(s => s.id === subjectId);
    return subject?.name || 'Предмет';
  };
  
  // Function to get class name by ID
  const getClassName = (classId: number) => {
    const classObj = classes.find(c => c.id === classId);
    return classObj?.name || 'Класс';
  };

  // Function to get assignments for a schedule
  const getScheduleAssignments = (scheduleId: number) => {
    return assignments.filter(assignment => assignment.scheduleId === scheduleId);
  };

  // Function to get assignment type name
  const getAssignmentTypeName = (type: AssignmentTypeEnum) => {
    const typeNames: Record<AssignmentTypeEnum, string> = {
      [AssignmentTypeEnum.CONTROL_WORK]: "Контрольная работа",
      [AssignmentTypeEnum.TEST_WORK]: "Проверочная работа",
      [AssignmentTypeEnum.CURRENT_WORK]: "Текущая работа",
      [AssignmentTypeEnum.HOMEWORK]: "Домашнее задание",
      [AssignmentTypeEnum.CLASSWORK]: "Работа на уроке",
      [AssignmentTypeEnum.PROJECT_WORK]: "Работа с проектом",
      [AssignmentTypeEnum.CLASS_ASSIGNMENT]: "Классная работа"
    };
    return typeNames[type] || type;
  };

  // Function to get color for assignment type
  const getAssignmentTypeColor = (type: AssignmentTypeEnum) => {
    const typeColors: Record<AssignmentTypeEnum, string> = {
      [AssignmentTypeEnum.CONTROL_WORK]: "bg-red-100 text-red-800 border-red-200",
      [AssignmentTypeEnum.TEST_WORK]: "bg-blue-100 text-blue-800 border-blue-200",
      [AssignmentTypeEnum.CURRENT_WORK]: "bg-green-100 text-green-800 border-green-200",
      [AssignmentTypeEnum.HOMEWORK]: "bg-amber-100 text-amber-800 border-amber-200",
      [AssignmentTypeEnum.CLASSWORK]: "bg-indigo-100 text-indigo-800 border-indigo-200",
      [AssignmentTypeEnum.PROJECT_WORK]: "bg-purple-100 text-purple-800 border-purple-200",
      [AssignmentTypeEnum.CLASS_ASSIGNMENT]: "bg-emerald-100 text-emerald-800 border-emerald-200"
    };
    return typeColors[type] || "bg-gray-100 text-gray-800 border-gray-200";
  };
  
  return (
    <div className="bg-white rounded-lg shadow-sm p-4 col-span-1 lg:col-span-2">
      <h3 className="text-lg font-heading font-semibold text-gray-800 mb-4">Расписание на сегодня</h3>
      {schedulesLoading ? (
        <div className="text-center py-4 text-gray-500">Загрузка...</div>
      ) : todaySchedules.length === 0 ? (
        <div className="text-center py-4 text-gray-500">Нет занятий на сегодня</div>
      ) : (
        <div className="space-y-3">
          {todaySchedules.map((schedule) => {
            const scheduleAssignments = getScheduleAssignments(schedule.id);
            
            return (
              <div key={schedule.id} className="p-3 bg-primary-50 bg-opacity-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <ClockIcon className="h-5 w-5 mr-3 text-primary-dark" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {schedule.startTime} - {schedule.endTime}
                      </p>
                      <p className="text-sm text-gray-700">
                        {getSubjectName(schedule.subjectId)}, {getClassName(schedule.classId)}
                      </p>
                      {schedule.room && (
                        <p className="text-xs text-gray-500">
                          Кабинет: {schedule.room}
                        </p>
                      )}
                    </div>
                  </div>
                  {schedule.status === 'conducted' && (
                    <CheckCircleIcon className="h-5 w-5 text-green-500" title="Урок проведен" />
                  )}
                </div>
                
                {scheduleAssignments.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-1 mb-1.5">
                      <BookOpenCheck className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium text-gray-700">Задания:</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {scheduleAssignments.map(assignment => (
                        <Badge 
                          key={assignment.id}
                          variant="outline"
                          className={`text-xs ${getAssignmentTypeColor(assignment.assignmentType)}`}
                        >
                          {getAssignmentTypeName(assignment.assignmentType).substring(0, 2)} ({assignment.maxScore} б.)
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
