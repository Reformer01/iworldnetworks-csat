'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';

interface MobileCardRowProps {
  /** Primary text (e.g. customer name) */
  title: string;
  /** Status badge */
  status?: { label: string; color: string };
  /** Key metric to highlight (e.g. MRR, rating) */
  metric?: { label: string; value: string };
  /** Additional metadata rows */
  details?: Array<{ label: string; value: string }>;
  /** Action button */
  action?: React.ReactNode;
  /** Click handler for the entire card */
  onClick?: () => void;
  /** Whether the row is selected */
  selected?: boolean;
  className?: string;
}

/**
 * Responsive card row that shows as a card on mobile (< 768px)
 * and integrates with table layouts on desktop.
 *
 * Usage pattern:
 * ```tsx
 * <div className="md:hidden space-y-3">
 *   {records.map(r => (
 *     <MobileCardRow key={r.id} title={r.name} status={...} metric={...} />
 *   ))}
 * </div>
 * <div className="hidden md:block">
 *   <table>...</table>
 * </div>
 * ```
 */
export function MobileCardRow({ title, status, metric, details, action, onClick, selected, className }: MobileCardRowProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl border p-4 transition-all',
        selected ? 'border-secondary ring-1 ring-secondary/20' : 'border-border',
        onClick && 'cursor-pointer hover:border-secondary/50 active:scale-[0.99]',
        className,
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') onClick();
            }
          : undefined
      }
    >
      {/* Top row: title + status + metric */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-primary truncate">{title}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {status && (
            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold font-mono whitespace-nowrap', status.color)}>
              {status.label}
            </span>
          )}
          {metric && (
            <div className="text-right">
              <p className="font-mono text-xs font-bold text-primary">{metric.value}</p>
              <p className="font-mono text-[9px] text-on-surface-variant uppercase">{metric.label}</p>
            </div>
          )}
          {onClick && <ChevronRight className="w-4 h-4 text-on-surface-variant/40 shrink-0" />}
        </div>
      </div>

      {/* Details grid */}
      {details && details.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
          {details.map((d) => (
            <div key={d.label} className="min-w-0">
              <span className="font-mono text-[9px] uppercase text-on-surface-variant/60 font-bold">{d.label}</span>
              <p className="font-mono text-[11px] font-bold text-on-surface truncate">{d.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Action */}
      {action && <div className="mt-3 pt-3 border-t border-border/40">{action}</div>}
    </div>
  );
}
