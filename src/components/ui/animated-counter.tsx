'use client';
import React from 'react';
import { cn } from '@/lib/utils';

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
    <div className="bg-white p-4 rounded-2xl whisper-shadow border flex items-center gap-3">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', color)}>
        {Icon ? <Icon className="w-5 h-5 text-white" /> : null}
      </div>
      <div className="min-w-0">
        <p className="font-mono text-[9px] uppercase tracking-widest font-bold opacity-60 truncate">{label}</p>
        <p className="font-display text-lg xl:text-xl font-black break-words" title={value.toLocaleString()}>{value.toLocaleString()}</p>
        {sub && <p className="font-mono text-[10px] opacity-60 break-words" title={sub}>{sub}</p>}
      </div>
    </div>
  );
}
