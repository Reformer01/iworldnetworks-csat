import * as React from 'react';
import { Inbox } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: { label: string; onClick?: () => void; href?: string };
  /** Dashed-border variant used inside cards/tables; `plain` sits on the page canvas. */
  variant?: 'dashed' | 'plain';
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  variant = 'dashed',
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-14 text-center',
        variant === 'dashed' && 'rounded-xl border border-dashed border-border',
        className,
      )}
      {...props}
    >
      <Icon className="size-6 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && (
        <Button size="sm" variant="outline" className="mt-2" onClick={action.onClick} asChild={!!action.href}>
          {action.href ? <a href={action.href}>{action.label}</a> : action.label}
        </Button>
      )}
    </div>
  );
}

/** Table/chart loading state shared by migrated pages. */
export function LoadingRows({ rows = 5, columns = 4, className }: { rows?: number; columns?: number; className?: string }) {
  return (
    <div className={cn('space-y-2 p-4', className)}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4">
          {Array.from({ length: columns }).map((__, c) => (
            <Skeleton key={c} className={cn('h-4', c === 0 ? 'w-40' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}
