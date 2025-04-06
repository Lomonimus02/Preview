import React, { useState } from "react";
import { Schedule, Class, Subject, User } from "@shared/schema";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Pencil, Trash, Clock, Book, ChevronDown, ChevronUp } from "lucide-react";
import { ScheduleItemDetails } from "./schedule-item-details";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { UserRoleEnum } from "@shared/schema";

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
  const [expandedItem, setExpandedItem] = useState<number | null>(null);

  // Get user role
  const isAdmin = user?.role === UserRoleEnum.ADMIN || user?.role === UserRoleEnum.SUPER_ADMIN;
  const isTeacher = user?.role === UserRoleEnum.TEACHER;

  // Sort schedules by start time
  const sortedSchedules = [...schedules].sort((a, b) => {
    const timeA = a.startTime.split(":").map(Number);
    const timeB = b.startTime.split(":").map(Number);
    return timeA[0] * 60 + timeA[1] - (timeB[0] * 60 + timeB[1]);
  });

  // Toggle expanded item
  const toggleExpand = (id: number) => {
    setExpandedItem(expandedItem === id ? null : id);
  };

  // Get class name by id
  const getClassName = (classId: number) => {
    const foundClass = classes.find((c) => c.id === classId);
    return foundClass ? foundClass.name : "Неизвестный класс";
  };

  // Get subject name by id
  const getSubjectName = (subjectId: number) => {
    const foundSubject = subjects.find((s) => s.id === subjectId);
    return foundSubject ? foundSubject.name : "Неизвестный предмет";
  };

  // Get teacher name by id
  const getTeacherName = (teacherId: number) => {
    const foundTeacher = users.find((u) => u.id === teacherId);
    return foundTeacher
      ? `${foundTeacher.lastName} ${foundTeacher.firstName.charAt(0)}.`
      : "Неизвестный учитель";
  };

  // Get formatted date string
  const getFormattedDate = (date: Date) => {
    return format(date, "d MMMM", { locale: ru });
  };

  return (
    <Card
      className={`h-full transition-all ${
        isCurrentDate
          ? "border-primary shadow-md"
          : "border-border hover:border-primary/50"
      }`}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="capitalize text-lg">{dayName}</CardTitle>
            <CardDescription>{getFormattedDate(date)}</CardDescription>
          </div>
          {isCurrentDate && <Badge>Сегодня</Badge>}
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        {sortedSchedules.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Нет уроков на этот день
          </p>
        ) : (
          <ScrollArea className="h-[250px] pr-2">
            <div className="space-y-3">
              {sortedSchedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="border rounded-lg overflow-hidden transition-all"
                >
                  <div
                    className={`p-3 flex justify-between items-center cursor-pointer hover:bg-muted/50 ${
                      expandedItem === schedule.id ? "bg-muted/50" : ""
                    }`}
                    onClick={() => toggleExpand(schedule.id)}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="h-6 px-2 font-mono">
                        {schedule.startTime} - {schedule.endTime}
                      </Badge>
                      <span className="font-medium">
                        {getSubjectName(schedule.subjectId)}
                      </span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      {expandedItem === schedule.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  <AnimatePresence>
                    {expandedItem === schedule.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="px-3 py-2 bg-muted/30 border-t">
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="flex items-center gap-1.5">
                              <Book className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>
                                Класс: <b>{getClassName(schedule.classId)}</b>
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>
                                Время: <b>{schedule.startTime} - {schedule.endTime}</b>
                              </span>
                            </div>
                          </div>
                          
                          <div className="mt-2 flex items-center gap-1.5 text-sm">
                            <span>
                              Учитель: <b>{getTeacherName(schedule.teacherId)}</b>
                            </span>
                          </div>

                          {schedule.room && (
                            <div className="mt-2 text-sm">
                              <span>
                                Кабинет: <b>{schedule.room}</b>
                              </span>
                            </div>
                          )}

                          {(isAdmin || isTeacher) && (
                            <div className="mt-3 flex gap-2">
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                  >
                                    Подробнее
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>
                                      {getSubjectName(schedule.subjectId)}
                                    </DialogTitle>
                                    <DialogDescription>
                                      Подробная информация о занятии
                                    </DialogDescription>
                                  </DialogHeader>
                                  <ScheduleItemDetails
                                    schedule={schedule}
                                    className={getClassName(schedule.classId)}
                                    subject={getSubjectName(schedule.subjectId)}
                                    teacher={getTeacherName(schedule.teacherId)}
                                  />
                                </DialogContent>
                              </Dialog>

                              {(isAdmin || 
                                (isTeacher && schedule.teacherId === user?.id)) && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onEditSchedule && onEditSchedule(schedule);
                                    }}
                                  >
                                    <Pencil className="h-3 w-3 mr-1" />
                                    Изменить
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteSchedule &&
                                        onDeleteSchedule(schedule.id);
                                    }}
                                  >
                                    <Trash className="h-3 w-3 mr-1" />
                                    Удалить
                                  </Button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}