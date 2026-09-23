'use client';
import React from 'react';
import { iconToneClass } from '@/lib/icon-tone';

export function AnimatedCounter({
  label,
  value,
  sub,
  icon: Icon,
  color,
  samples,
}: {
  label: string;
  value: number;
  sub?: string;
  icon: React.ElementType;
  color: string;
  samples?: number[];
}) {
  void samples;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      {Icon ? <Icon className={`size-5 shrink-0 ${iconToneClass(color)}`} aria-hidden="true" /> : null}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="font-headline text-lg font-semibold tabular-nums break-words xl:text-xl" title={value.toLocaleString()}>
          {value.toLocaleString()}
        </p>
        {sub && (
          <p className="text-xs text-muted-foreground break-words" title={sub}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}
