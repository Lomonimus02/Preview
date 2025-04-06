import React, { useState, useRef, useEffect } from "react";
import { Schedule, Class, Subject, User } from "@shared/schema";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { ScheduleCard } from "./schedule-card";
import { Button } from "@/components/ui/button";
import { CalendarIcon, ArrowLeftIcon, ArrowRightIcon, FilterIcon } from "lucide-react";
import { format, addDays, isSameDay } from "date-fns";
import { ru } from "date-fns/locale";
import { motion } from "framer-motion";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

interface ScheduleCarouselProps {
  schedules: Schedule[];
  classes: Class[];
  subjects: Subject[];
  users: User[];
  onDateSelect?: (date: Date) => void;
  selectedDate?: Date;
}

export function ScheduleCarousel({
  schedules,
  classes,
  subjects,
  users,
  onDateSelect,
  selectedDate,
}: ScheduleCarouselProps) {
  const today = new Date();
  const [date, setDate] = useState<Date | undefined>(selectedDate || today);
  const [visibleDates, setVisibleDates] = useState<Date[]>([]);
  const carouselRef = useRef<HTMLDivElement>(null);
  const isTabletOrMobile = useMediaQuery("(max-width: 768px)");
  const isMobile = useMediaQuery("(max-width: 480px)");

  // The number of days to show at once
  const visibleDaysCount = isMobile ? 1 : isTabletOrMobile ? 2 : 4;

  // Generate an array of 14 days from today
  useEffect(() => {
    const days = [];
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 7); // Start 7 days before today
    
    for (let i = 0; i < 21; i++) {
      const newDate = new Date(startDate);
      newDate.setDate(newDate.getDate() + i);
      days.push(newDate);
    }
    
    setVisibleDates(days);
  }, [today]);

  // Navigate to given date
  const navigateToDate = (date: Date) => {
    setDate(date);
    if (onDateSelect) {
      onDateSelect(date);
    }

    // Find the index of the date in visibleDates
    const dateIndex = visibleDates.findIndex(d => 
      d.getDate() === date.getDate() && 
      d.getMonth() === date.getMonth() && 
      d.getFullYear() === date.getFullYear()
    );

    if (dateIndex >= 0 && carouselRef.current) {
      // Scroll to that index in the carousel
      carouselRef.current.scrollTo({
        left: dateIndex * (carouselRef.current.offsetWidth / visibleDaysCount),
        behavior: "smooth"
      });
    }
  };

  // Get day name from date
  const getDayName = (date: Date) => {
    return format(date, "EEEE", { locale: ru });
  };

  // Format date for description
  const getFormattedDate = (date: Date) => {
    return format(date, "d MMMM yyyy", { locale: ru });
  };

  // Filter schedules for a particular date
  const getSchedulesForDate = (date: Date) => {
    // Get day of week (1-7 where 1 is Monday and 7 is Sunday)
    const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();
    
    return schedules.filter(schedule => {
      if (schedule.scheduleDate) {
        // If the schedule has a specific date, check if it matches
        const scheduleDate = new Date(schedule.scheduleDate);
        return isSameDay(scheduleDate, date);
      } else {
        // Otherwise, check if the day of week matches
        return schedule.dayOfWeek === dayOfWeek;
      }
    });
  };

  // Check if a date is today
  const isToday = (date: Date) => {
    return isSameDay(date, today);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex space-x-2"
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateToDate(today)}
            className="flex items-center"
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            Сегодня
          </Button>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center">
                <FilterIcon className="mr-2 h-4 w-4" />
                Выбрать дату
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(date) => date && navigateToDate(date)}
                initialFocus
                locale={ru}
              />
            </PopoverContent>
          </Popover>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="hidden md:flex space-x-2"
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newDate = new Date(date || today);
              newDate.setDate(newDate.getDate() - 1);
              navigateToDate(newDate);
            }}
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Пред. день
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newDate = new Date(date || today);
              newDate.setDate(newDate.getDate() + 1);
              navigateToDate(newDate);
            }}
          >
            След. день
            <ArrowRightIcon className="h-4 w-4 ml-2" />
          </Button>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {date && (
          <div className="text-center mb-4">
            <h2 className="text-lg font-medium">{getDayName(date)}</h2>
            <p className="text-sm text-muted-foreground">{getFormattedDate(date)}</p>
          </div>
        )}

        <Carousel
          opts={{
            align: "start",
            loop: false,
          }}
          className="w-full"
        >
          <CarouselContent className="-ml-2 md:-ml-4" ref={carouselRef}>
            {visibleDates.map((day, index) => (
              <CarouselItem 
                key={day.toISOString()} 
                className="pl-2 md:pl-4 basis-full md:basis-1/2 lg:basis-1/4"
              >
                <div className="p-1">
                  <ScheduleCard
                    date={day}
                    dayName={getDayName(day)}
                    schedules={getSchedulesForDate(day)}
                    classes={classes}
                    subjects={subjects}
                    users={users}
                    isCurrentDate={isToday(day)}
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="left-2" />
          <CarouselNext className="right-2" />
        </Carousel>
      </motion.div>
    </div>
  );
}