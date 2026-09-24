'use client';

import { ArrowDown, ArrowUp, Minus, RadioTower } from 'lucide-react';

import type { TowerAuditRow } from '@/lib/audit/computeTowerAudit';
import { accountLabel, formatNaira, relativeTime, towerHealthScore, towerSyncClock } from '@/lib/bts-ui';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function MetricRow({
  label,
  values,
  format = (value) => value.toLocaleString(),
  lowerIsBetter = false,
}: {
  label: string;
  values: number[];
  format?: (value: number) => string;
  lowerIsBetter?: boolean;
}) {
  const best = lowerIsBetter ? Math.min(...values) : Math.max(...values);
  return (
    <TableRow>
      <TableHead className="w-[28%]">{label}</TableHead>
      {values.map((value, index) => (
        <TableCell key={index} className={cn('font-medium tabular-nums', value === best && 'text-secondary')}>
          <span className="inline-flex items-center gap-1.5">
            {value === best ? (lowerIsBetter ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />) : values.every((item) => item === values[0]) ? <Minus className="size-3 text-muted-foreground" /> : null}
            {format(value)}
          </span>
        </TableCell>
      ))}
    </TableRow>
  );
}

export function TowerComparison({ towers, onClose }: { towers: TowerAuditRow[]; onClose: () => void }) {
  const shown = towers.slice(0, 3);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto p-0">
        <DialogHeader className="border-b px-6 py-5 text-left">
          <DialogTitle className="font-headline text-xl">Tower comparison</DialogTitle>
          <DialogDescription>Compare operational health and commercial exposure across {shown.length} selected towers.</DialogDescription>
        </DialogHeader>

        <div className="p-6">
          <div className="mb-5 grid gap-3" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
            {shown.map((tower) => (
              <div key={tower.towerId} className="rounded-lg border bg-muted/30 p-4">
                <div className="mb-2 flex items-center gap-2"><RadioTower className="size-4 text-secondary" /><Badge variant="outline">{tower.region}</Badge></div>
                <p className="font-headline font-semibold">{tower.towerName}</p>
                <p className="mt-1 text-xs text-muted-foreground">Roster synced {relativeTime(towerSyncClock(tower))}</p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader><TableRow><TableHead>Metric</TableHead>{shown.map((tower) => <TableHead key={tower.towerId} className="text-right">{tower.towerName}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                <MetricRow label="Health score" values={shown.map(towerHealthScore)} format={(value) => `${value}/100`} />
                <MetricRow label="Customers" values={shown.map((tower) => tower.customers.total)} />
                <MetricRow label="Active customers" values={shown.map((tower) => tower.customers.active)} />
                <MetricRow label="Potential MRR" values={shown.map((tower) => tower.mrrTotal)} format={formatNaira} />
                <MetricRow label="Active MRR" values={shown.map((tower) => tower.activeMrr)} format={formatNaira} />
                <MetricRow label="Revenue opportunity" values={shown.map((tower) => tower.mrrTotal - tower.activeMrr)} format={formatNaira} lowerIsBetter />
                <MetricRow label="Devices" values={shown.map((tower) => tower.deviceCount ?? 0)} />
                <MetricRow label="Device outages" values={shown.map((tower) => tower.deviceOutageCount ?? 0)} lowerIsBetter />
              </TableBody>
            </Table>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((tower) => {
              const segments = Object.entries(tower.customers.byAccountType).sort(([, a], [, b]) => b - a);
              return (
                <div key={tower.towerId} className="rounded-lg border p-4">
                  <p className="mb-3 text-sm font-medium">Account mix · {tower.towerName}</p>
                  <ul className="space-y-2 text-xs">
                    {segments.map(([segment, count]) => <li key={segment} className="flex justify-between gap-3"><span className="text-muted-foreground">{accountLabel(segment)}</span><span className="font-medium tabular-nums">{count}</span></li>)}
                    {!segments.length && <li className="text-muted-foreground">No customer segments</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end border-t px-6 py-4"><Button variant="outline" onClick={onClose}>Close comparison</Button></div>
      </DialogContent>
    </Dialog>
  );
}
