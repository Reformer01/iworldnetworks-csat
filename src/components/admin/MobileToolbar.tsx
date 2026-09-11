'use client';

import React, { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

interface MobileToolbarProps {
  /** The primary controls visible at all sizes (e.g. search input). */
  primary?: React.ReactNode;
  /** Secondary controls that collapse on mobile (e.g. filter dropdowns, action buttons). */
  secondary?: React.ReactNode;
  /** Label for the mobile filter button. */
  label?: string;
  /** Additional classes for the outer container. */
  className?: string;
}

/**
 * Responsive toolbar that shows `primary` controls inline and collapses
 * `secondary` controls into a Sheet (slide-out panel) on mobile (< 768px).
 *
 * On desktop (md+) all controls render inline as a flex row.
 */
export function MobileToolbar({
  primary,
  secondary,
  label = 'Filters',
  className,
}: MobileToolbarProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Desktop: everything inline */}
      <div className="hidden md:flex md:items-center md:gap-3 md:flex-wrap">
        {primary}
        {secondary}
      </div>

      {/* Mobile: primary inline + secondary in Sheet */}
      <div className="flex md:hidden items-center gap-2 flex-wrap">
        {primary}
        {secondary && (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl font-mono text-[10px] uppercase font-bold h-9"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />
                {label}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-auto max-h-[80vh] rounded-t-2xl">
              <SheetHeader className="mb-4">
                <SheetTitle className="font-mono text-xs uppercase font-bold">
                  {label}
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-3 pb-6">
                {secondary}
              </div>
              <div className="sticky bottom-0 bg-background pt-3 border-t border-border">
                <Button
                  variant="outline"
                  className="w-full rounded-xl font-mono text-[10px] uppercase font-bold"
                  onClick={() => setOpen(false)}
                >
                  <X className="w-3 h-3 mr-1.5" /> Close
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </div>
  );
}
