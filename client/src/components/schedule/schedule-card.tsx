import React, { useState } from "react";
import { Schedule, Class, Subject, User, UserRoleEnum } from "@shared/schema";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { ScheduleItemDetails } from "./schedule-item-details";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { ChevronDown, ChevronUp, Pencil, Clock, GraduationCap } from "lucide-react";

interface ScheduleCardProps {
  date: Date;
  dayName: string;
  schedules: Schedule[];
  classes: Class[];
  subjects: Subject[];
  users: User[];
  isCurrentDate?: boolean;
  onEditSchedule?: (schedule: Schedule) => void;
  onDeleteSchedule?: (scheduleId: number) => void;
}

export function ScheduleCard({
  date,
  dayName,
  schedules,
  classes,
  subjects,
  users,
  isCurrentDate = false,
  onEditSchedule,
  onDeleteSchedule,
}: ScheduleCardProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === UserRoleEnum.ADMIN || user?.role === UserRoleEnum.SUPER_ADMIN;
  
  // State for expanded items
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});
  
  // State for selected schedule (for details dialog)
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Sort schedules by start time
  const sortedSchedules = [...schedules].sort((a, b) => {
    return a.startTime.localeCompare(b.startTime);
  });
  
  // Toggle expanded state for a schedule item
  const toggleExpanded = (scheduleId: number) => {
    setExpandedItems((prev) => ({
      ...prev,
      [scheduleId]: !prev[scheduleId],
    }));
  };
  
  // Get class name for a schedule
  const getClassName = (classId: number): string => {
    const cls = classes.find((c) => c.id === classId);
    return cls ? cls.name : "Unknown";
  };
  
  // Get subject name for a schedule
  const getSubjectName = (subjectId: number): string => {
    const subject = subjects.find((s) => s.id === subjectId);
    return subject ? subject.name : "Unknown";
  };
  
  // Get teacher name for a schedule
  const getTeacherName = (teacherId: number): string => {
    const teacher = users.find((u) => u.id === teacherId);
    return teacher
      ? `${teacher.lastName} ${teacher.firstName}`
      : "Unknown";
  };
  
  // Handle edit schedule
  const handleEditSchedule = (schedule: Schedule) => {
    if (onEditSchedule) {
      onEditSchedule(schedule);
    }
  };
  
  // Show schedule details in dialog
  const showScheduleDetails = (schedule: Schedule) => {
    setSelectedSchedule(schedule);
    setDialogOpen(true);
  };
  
  // Helper function to check if a time is current
  const isCurrentTime = (start: string, end: string): boolean => {
    if (!isCurrentDate) return false;
    
    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    
    const [startHours, startMinutes] = start.split(":").map(Number);
    const [endHours, endMinutes] = end.split(":").map(Number);
    
    const currentTimeMinutes = currentHours * 60 + currentMinutes;
    const startTimeMinutes = startHours * 60 + startMinutes;
    const endTimeMinutes = endHours * 60 + endMinutes;
    
    return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes;
  };
  
  // Render date in card header
  const renderDate = () => {
    return format(date, "d MMMM", { locale: ru });
  };
  
  return (
    <Card className={`h-full ${isCurrentDate ? "border-primary" : ""}`}>
      <CardHeader className={`py-3 ${isCurrentDate ? "bg-primary/5" : ""}`}>
        <CardTitle className="flex flex-col items-center justify-center">
          <span className="text-lg font-medium capitalize">{dayName}</span>
          <span className="text-sm text-muted-foreground">{renderDate()}</span>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-3 h-full overflow-y-auto max-h-[350px]">
        {sortedSchedules.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Нет занятий в этот день</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedSchedules.map((schedule) => {
              const isExpanded = expandedItems[schedule.id] || false;
              const isCurrent = isCurrentTime(schedule.startTime, schedule.endTime);
              
              return (
                <Collapsible
                  key={schedule.id}
                  open={isExpanded}
                  onOpenChange={() => toggleExpanded(schedule.id)}
                  className={`border rounded-md transition-all ${
                    isCurrent
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                >
                  <div className="p-2 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={isCurrent ? "default" : "outline"}
                          className="whitespace-nowrap"
                        >
                          {schedule.startTime} - {schedule.endTime}
                        </Badge>
                        <div className="font-medium truncate">
                          {getSubjectName(schedule.subjectId)}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <GraduationCap className="h-3 w-3" />
                        <span className="truncate">
                          {getClassName(schedule.classId)}
                        </span>
                        
                        {schedule.room && (
                          <>
                            <span className="mx-1">•</span>
                            <span>Каб. {schedule.room}</span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditSchedule(schedule);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      
                      <Dialog open={dialogOpen && selectedSchedule?.id === schedule.id} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              showScheduleDetails(schedule);
                            }}
                          >
                            Подробнее
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[600px]">
                          <ScheduleItemDetails
                            schedule={schedule}
                            className={getClassName(schedule.classId)}
                            subject={getSubjectName(schedule.subjectId)}
                            teacher={getTeacherName(schedule.teacherId)}
                          />
                        </DialogContent>
                      </Dialog>
                      
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </div>
                  
                  <CollapsibleContent>
                    <div className="p-3 pt-0 border-t">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs text-muted-foreground">
                            Учитель
                          </div>
                          <div className="text-sm">
                            {getTeacherName(schedule.teacherId)}
                          </div>
                        </div>
                      </div>
                      
                      {schedule.notes && (
                        <div className="mt-2">
                          <div className="text-xs text-muted-foreground">
                            Заметки
                          </div>
                          <div className="text-sm">{schedule.notes}</div>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}
      </CardContent>
      
      {sortedSchedules.length > 0 && (
        <CardFooter className="px-3 py-2 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{sortedSchedules.length} занятий</span>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}