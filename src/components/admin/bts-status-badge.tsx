import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  freshnessTone,
  healthBand,
  healthTone,
  statusTone,
  towerSyncClock,
  type BadgeTone,
} from '@/lib/bts-ui';
import type { TowerAuditRow } from '@/lib/audit/computeTowerAudit';

export function HealthBadge({ score, className }: { score: number; className?: string }) {
  return (
    <Badge variant={healthTone(score)} className={cn('tabular-nums', className)}>
      {score} · {healthBand(score)}
    </Badge>
  );
}

export function TowerStatusBadge({
  status,
  suspended,
  className,
}: {
  status: string | null;
  suspended?: boolean | null;
  className?: string;
}) {
  const label = suspended ? 'Suspended' : status || 'Unknown';
  return (
    <Badge variant={statusTone(status, suspended)} className={className}>
      {label}
    </Badge>
  );
}

export function SyncBadge({
  tower,
  className,
}: {
  tower: Pick<TowerAuditRow, 'rosterSyncAt' | 'lastSyncAt'>;
  className?: string;
}) {
  const clock = towerSyncClock(tower);
  const label = !clock ? 'Never synced' : clock === tower.lastSyncAt && !tower.rosterSyncAt ? 'Unknown' : 'Live';
  return (
    <Badge variant={freshnessTone(clock)} className={className}>
      {label}
    </Badge>
  );
}

export function MatchBadge({ state, className, ...props }: BadgeProps & { state: string }) {
  const variant: BadgeTone =
    state === 'matched' ? 'success' : state === 'manual' ? 'info' : 'warning';
  return (
    <Badge variant={variant} className={className} {...props}>
      {state}
    </Badge>
  );
}
