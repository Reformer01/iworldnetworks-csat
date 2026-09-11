'use client';
import React from 'react';

export function BarList({
  data,
  valueFormatter,
}: {
  data: Array<{ name: string; value: number }>;
  valueFormatter?: (n: number) => string;
}) {
  return (
    <div className="space-y-2">
      {data.map((item) => (
        <div key={item.name} className="flex items-center gap-3">
          <span className="font-mono text-xs w-32 truncate">{item.name}</span>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-secondary" style={{ width: `${Math.min(100, item.value)}%` }} />
          </div>
          <span className="font-mono text-xs w-16 text-right">{valueFormatter ? valueFormatter(item.value) : item.value}</span>
        </div>
      ))}
    </div>
  );
}
