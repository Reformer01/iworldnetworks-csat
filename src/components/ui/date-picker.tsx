'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DatePickerProps {
  date?: Date;
  onSelect: (date: Date | undefined) => void;
  className?: string;
  placeholder?: string;
}

export function DatePicker({ date, onSelect, className, placeholder }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Date | undefined>(date);

  React.useEffect(() => {
    setSelected(date);
    return () => {};
  }, [date]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          type="button"
          className={cn(
            'justify-start text-left font-mono text-[10px] uppercase font-bold rounded-md border-border h-9 px-4 w-full bg-white text-primary',
            !date && 'text-on-surface-variant',
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5 text-secondary" />
          {date ? format(date, 'PPP') : placeholder || 'Select date'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3">
          <DayPicker
            mode="single"
            defaultMonth={date}
            selected={selected}
            onSelect={(d) => {
              setSelected(d);
              onSelect(d);
              setOpen(false);
            }}
            showOutsideDays
            className="p-0"
            classNames={{
              months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
              month: 'space-y-4',
              caption: 'flex justify-center pt-1 relative items-center',
              caption_label: 'text-sm font-medium',
              nav: 'space-x-1 flex items-center',
              nav_button: 'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 border border-border rounded-md',
              nav_button_previous: 'absolute left-1',
              nav_button_next: 'absolute right-1',
              table: 'w-full border-collapse space-y-1',
              head_row: 'flex',
              head_cell: 'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]',
              row: 'flex w-full mt-2',
              cell: 'h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
              day: 'h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-surface-container-low rounded-md transition-colors',
              day_selected: 'bg-secondary text-white hover:bg-secondary hover:text-white focus:bg-secondary focus:text-white',
              day_today: 'bg-accent text-accent-foreground',
              day_outside: 'day-outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground',
              day_disabled: 'text-muted-foreground opacity-50',
              day_hidden: 'invisible',
            }}
            components={{
              Chevron: ({ orientation, className: cls, ...props }) =>
                orientation === 'left' ? (
                  <ChevronLeft className={cn('h-4 w-4', cls)} {...props} />
                ) : (
                  <ChevronRight className={cn('h-4 w-4', cls)} {...props} />
                ),
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
