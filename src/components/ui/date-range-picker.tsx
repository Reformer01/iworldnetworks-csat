'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { DateRange, DayPicker } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DateRangePickerProps {
  from?: Date;
  to?: Date;
  onSelect: (range: DateRange | undefined) => void;
  className?: string;
  placeholder?: string;
}

function formatDisplayRange(from?: Date, to?: Date): string {
  if (from && to) return `${format(from, 'MMM d, yyyy')} – ${format(to, 'MMM d, yyyy')}`;
  if (from) return `From ${format(from, 'MMM d, yyyy')}`;
  if (to) return `Up to ${format(to, 'MMM d, yyyy')}`;
  return 'Select date range';
}

export function DateRangePicker({ from, to, onSelect, className, placeholder }: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<DateRange | undefined>({ from, to });

  React.useEffect(() => {
    setSelected({ from, to });
  }, [from, to]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'justify-start text-left font-mono text-[10px] uppercase font-bold rounded-full border-border h-9 px-4',
            !from && !to && 'text-on-surface-variant',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
          {placeholder || formatDisplayRange(from, to)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3">
          <DayPicker
            mode="range"
            defaultMonth={from}
            selected={selected}
            onSelect={(range) => {
              setSelected(range);
              onSelect(range);
            }}
            numberOfMonths={2}
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
              cell: 'h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
              day: 'h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-surface-container-low rounded-md transition-colors',
              day_range_end: 'day-range-end',
              day_selected: 'bg-secondary text-white hover:bg-secondary hover:text-white focus:bg-secondary focus:text-white',
              day_today: 'bg-accent text-accent-foreground',
              day_outside: 'day-outside text-muted-foreground aria-selected:bg-accent/50 aria-selected:text-muted-foreground',
              day_disabled: 'text-muted-foreground opacity-50',
              day_range_middle: 'aria-selected:bg-secondary/15 aria-selected:text-secondary',
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
          {(from || to) && (
            <div className="flex justify-between items-center pt-3 border-t border-border mt-3">
              <button
                onClick={() => { setSelected(undefined); onSelect(undefined); }}
                className="font-mono text-[10px] uppercase font-bold text-on-surface-variant hover:text-destructive transition-colors"
              >
                Clear
              </button>
              <button
                onClick={() => setOpen(false)}
                className="font-mono text-[10px] uppercase font-bold text-secondary hover:text-primary transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
