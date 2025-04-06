import React, { useState, useEffect, useRef } from "react";
import { Schedule, Class, Subject, User } from "@shared/schema";
import { ScheduleCard } from "./schedule-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Calendar, MoveHorizontal } from "lucide-react";
import { format, addDays, subDays, startOfWeek, addWeeks, isSameDay } from "date-fns";
import { ru } from "date-fns/locale";
import { motion } from "framer-motion";
import { useMediaQuery } from "@/hooks/use-media-query";

interface ScheduleCarouselProps {
  schedules: Schedule[];
  classes: Class[];
  subjects: Subject[];
  users: User[];
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onEditSchedule?: (schedule: Schedule) => void;
  onDeleteSchedule?: (scheduleId: number) => void;
}

export function ScheduleCarousel({
  schedules,
  classes,
  subjects,
  users,
  selectedDate,
  onDateSelect,
  onEditSchedule,
  onDeleteSchedule,
}: ScheduleCarouselProps) {
  // Number of days to display in carousel
  const isDesktop = useMediaQuery("md");
  const visibleDays = isDesktop ? 5 : 1;
  
  // Current date (today)
  const today = new Date();
  
  // State for dates in carousel
  const [dates, setDates] = useState<Date[]>([]);
  
  // State for carousel index
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // State for tracking if we're swiping
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const dragThreshold = 50; // Minimum drag distance to trigger swipe
  
  // Ref for the carousel container
  const carouselRef = useRef<HTMLDivElement>(null);
  
  // Initialize dates for the carousel
  useEffect(() => {
    const initDates = [];
    const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Start from Monday
    
    for (let i = 0; i < 7; i++) {
      initDates.push(addDays(weekStart, i));
    }
    
    setDates(initDates);
    
    // Check if selected date is in current week, otherwise navigate to its week
    const selectedDateIndex = initDates.findIndex(date => 
      isSameDay(date, selectedDate)
    );
    
    if (selectedDateIndex === -1) {
      // If not in current week, navigate to the week containing the selected date
      navigateToDate(selectedDate);
    } else {
      // Set current index to show the selected date
      setCurrentIndex(Math.max(0, selectedDateIndex - Math.floor(visibleDays / 2)));
    }
  }, [selectedDate, visibleDays]);
  
  // Navigate to specific date
  const navigateToDate = (date: Date) => {
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const newDates = [];
    
    for (let i = 0; i < 7; i++) {
      newDates.push(addDays(weekStart, i));
    }
    
    setDates(newDates);
    
    // Find selected date index in new dates
    const selectedDateIndex = newDates.findIndex(d => 
      isSameDay(d, date)
    );
    
    if (selectedDateIndex !== -1) {
      // Set current index to show the selected date
      setCurrentIndex(Math.max(0, selectedDateIndex - Math.floor(visibleDays / 2)));
    } else {
      setCurrentIndex(0);
    }
  };
  
  // Navigate to next or previous set of days
  const navigate = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      const newDates = dates.map(date => subDays(date, 7));
      setDates(newDates);
      setCurrentIndex(0);
    } else {
      const newDates = dates.map(date => addDays(date, 7));
      setDates(newDates);
      setCurrentIndex(0);
    }
  };
  
  // Navigate to next or previous day/week
  const navigateCarousel = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      if (currentIndex > 0) {
        setCurrentIndex(prevIndex => prevIndex - 1);
      } else {
        // If at the start of the week, go to previous week
        navigate('prev');
      }
    } else {
      const maxIndex = Math.max(0, dates.length - visibleDays);
      if (currentIndex < maxIndex) {
        setCurrentIndex(prevIndex => prevIndex + 1);
      } else {
        // If at the end of the week, go to next week
        navigate('next');
      }
    }
  };
  
  // Handle date selection
  const handleDateSelect = (date: Date) => {
    onDateSelect(date);
  };
  
  // Get day name with first letter capitalized
  const getDayName = (date: Date) => {
    return format(date, 'EEEE', { locale: ru });
  };
  
  // Get visible dates based on current index
  const getVisibleDates = () => {
    return dates.slice(currentIndex, currentIndex + visibleDays);
  };
  
  // Filter schedules for a specific date
  const getSchedulesForDate = (date: Date) => {
    const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay(); // Convert Sunday (0) to 7
    
    return schedules.filter(schedule => {
      // Check if it's a specific date schedule
      if (schedule.scheduleDate) {
        const scheduleDate = new Date(schedule.scheduleDate);
        return isSameDay(scheduleDate, date);
      }
      
      // Otherwise check day of week
      return schedule.dayOfWeek === dayOfWeek;
    });
  };
  
  // Handle mouse wheel scrolling
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        // Horizontal scrolling
        if (e.deltaX > 10) {
          navigateCarousel('next');
        } else if (e.deltaX < -10) {
          navigateCarousel('prev');
        }
      }
    };
    
    const carousel = carouselRef.current;
    if (carousel) {
      carousel.addEventListener('wheel', handleWheel);
    }
    
    return () => {
      if (carousel) {
        carousel.removeEventListener('wheel', handleWheel);
      }
    };
  }, [currentIndex, dates.length, visibleDays]);
  
  // Handle touch events for mobile swiping
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    setDragStartX(e.touches[0].clientX);
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    
    const currentX = e.touches[0].clientX;
    const diff = dragStartX - currentX;
    
    if (Math.abs(diff) > dragThreshold) {
      if (diff > 0) {
        navigateCarousel('next');
      } else {
        navigateCarousel('prev');
      }
      setIsDragging(false);
    }
  };
  
  const handleTouchEnd = () => {
    setIsDragging(false);
  };
  
  // Handle mouse events for desktop dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const currentX = e.clientX;
    const diff = dragStartX - currentX;
    
    if (Math.abs(diff) > dragThreshold) {
      if (diff > 0) {
        navigateCarousel('next');
      } else {
        navigateCarousel('prev');
      }
      setIsDragging(false);
    }
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  // Navigation to current week
  const goToCurrentWeek = () => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const newDates = [];
    
    for (let i = 0; i < 7; i++) {
      newDates.push(addDays(weekStart, i));
    }
    
    setDates(newDates);
    setCurrentIndex(0);
    
    // Select today's date
    onDateSelect(new Date());
  };
  
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('prev')}>
            <ChevronLeft className="h-4 w-4" />
            Пред. неделя
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToCurrentWeek}
            className="font-medium"
          >
            <Calendar className="h-4 w-4 mr-1" />
            Сегодня
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('next')}>
            След. неделя
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex items-center gap-1 text-muted-foreground text-sm">
          <MoveHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Прокрутите колесом мыши или</span>
          <span>свайпните для навигации</span>
        </div>
      </div>

      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          className="absolute -left-12 top-1/2 transform -translate-y-1/2 h-8 w-8 hidden md:flex"
          onClick={() => navigateCarousel('prev')}
          disabled={currentIndex === 0 && dates[0] && dates[0].getTime() <= startOfWeek(today, { weekStartsOn: 1 }).getTime()}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div
          className="overflow-hidden"
          ref={carouselRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <motion.div
            className="flex gap-4 cursor-grab active:cursor-grabbing"
            initial={false}
            animate={{ x: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.1}
            onDragEnd={(_, info) => {
              if (info.offset.x > dragThreshold) {
                navigateCarousel('prev');
              } else if (info.offset.x < -dragThreshold) {
                navigateCarousel('next');
              }
            }}
          >
            {getVisibleDates().map((date, index) => {
              const dateSchedules = getSchedulesForDate(date);
              const isCurrentDate = isSameDay(date, today);
              const isSelected = isSameDay(date, selectedDate);
              
              return (
                <div
                  key={date.toISOString()}
                  className={`flex-shrink-0 w-full md:w-[calc(${100 / visibleDays}%-${(4 * (visibleDays - 1)) / visibleDays}px)]`}
                  onClick={() => handleDateSelect(date)}
                >
                  <div 
                    className={`
                      h-full cursor-pointer transition-all
                      ${isSelected ? 'ring-2 ring-primary rounded-lg ring-offset-2' : ''}
                    `}
                  >
                    <ScheduleCard
                      date={date}
                      dayName={getDayName(date)}
                      schedules={dateSchedules}
                      classes={classes}
                      subjects={subjects}
                      users={users}
                      isCurrentDate={isCurrentDate}
                      onEditSchedule={onEditSchedule}
                      onDeleteSchedule={onDeleteSchedule}
                    />
                  </div>
                </div>
              );
            })}
          </motion.div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="absolute -right-12 top-1/2 transform -translate-y-1/2 h-8 w-8 hidden md:flex"
          onClick={() => navigateCarousel('next')}
          disabled={currentIndex === Math.max(0, dates.length - visibleDays)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex justify-center gap-1 mt-2">
        {dates.map((date, index) => (
          <button
            key={index}
            className={`h-1.5 rounded-full transition-all ${
              index >= currentIndex && index < currentIndex + visibleDays
                ? isSameDay(date, selectedDate)
                  ? "w-6 bg-primary"
                  : "w-3 bg-primary/60"
                : "w-3 bg-muted"
            }`}
            onClick={() => {
              setCurrentIndex(Math.min(Math.max(0, index - Math.floor(visibleDays / 2)), Math.max(0, dates.length - visibleDays)));
              handleDateSelect(date);
            }}
            title={format(date, "d MMMM", { locale: ru })}
          />
        ))}
      </div>
    </div>
  );
}