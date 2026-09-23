import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Status-as-signal chip ported from the incident hub: tinted background
 * with a dot plus a text label (never color alone).
 */
const TONES: Record<string, string> = {
  red: 'border-red-200 bg-red-50 text-red-700',
  orange: 'border-orange-200 bg-orange-50 text-orange-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  sky: 'border-sky-200 bg-sky-50 text-sky-700',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
  slate: 'border-slate-200 bg-slate-100 text-slate-600',
};

const DOTS: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  green: 'bg-emerald-500',
  sky: 'bg-sky-500',
  violet: 'bg-violet-500',
  slate: 'bg-slate-400',
};

export function StatusChip({
  tone = 'slate',
  label,
  dot = true,
  className,
}: {
  tone?: keyof typeof TONES;
  label: string;
  dot?: boolean;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn('gap-1.5 whitespace-nowrap border font-medium', TONES[tone], className)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[tone])} />}
      {label}
    </Badge>
  );
}
