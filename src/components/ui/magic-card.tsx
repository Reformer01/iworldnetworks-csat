'use client';
import React from 'react';
import { cn } from '@/lib/utils';

export function MagicCard({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-2xl border bg-white', className)} {...props}>
      {children}
    </div>
  );
}
