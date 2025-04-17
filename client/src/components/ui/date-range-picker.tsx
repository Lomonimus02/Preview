import * as React from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePickerProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: DateRange | undefined;
  onChange?: (date: DateRange | undefined) => void;
  locale?: any;
}

export function DateRangePicker({
  className,
  value,
  onChange,
  locale = ru,
  ...props
}: DateRangePickerProps) {
  const [date, setDate] = React.useState<DateRange | undefined>(value);

  const handleSelect = (selectedDate: DateRange | undefined) => {
    setDate(selectedDate);
    if (onChange) {
      onChange(selectedDate);
    }
  };

  React.useEffect(() => {
    setDate(value);
  }, [value]);

  return (
    <div className={cn("grid gap-2", className)} {...props}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-full justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "dd.MM.yyyy", { locale })} -{" "}
                  {format(date.to, "dd.MM.yyyy", { locale })}
                </>
              ) : (
                format(date.from, "dd.MM.yyyy", { locale })
              )
            ) : (
              <span>Выберите диапазон дат</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={handleSelect}
            numberOfMonths={2}
            locale={locale}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}