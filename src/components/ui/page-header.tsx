import * as React from 'react';

import { cn } from '@/lib/utils';

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Small label above the title (breadcrumb-ish eyebrow). */
  eyebrow?: React.ReactNode;
}

/**
 * Standard page top: title + description on the left, actions on the right.
 * Replaces the hand-rolled `<header>` blocks on every admin page.
 */
export function PageHeader({ title, description, actions, eyebrow, className, children, ...props }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between', className)} {...props}>
      <div className="space-y-1">
        {eyebrow && (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
        )}
        <h1 className="font-headline text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {(actions || children) && <div className="flex flex-wrap items-center gap-2">{actions}{children}</div>}
    </div>
  );
}
