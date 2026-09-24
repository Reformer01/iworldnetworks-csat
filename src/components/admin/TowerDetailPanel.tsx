'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Clock3, RadioTower, TrendingUp, Users, Wifi, WifiOff } from 'lucide-react';

import { useAuth, useUser } from '@/firebase';
import type { TowerAuditRow } from '@/lib/audit/computeTowerAudit';
import { accountLabel, formatExactNaira, formatNaira, relativeTime, towerSyncClock } from '@/lib/bts-ui';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartCard } from '@/components/ui/chart-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableShell } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendAreaChart } from '@/components/charts/trend-area-chart';
import { SyncBadge, TowerStatusBadge } from '@/components/admin/bts-status-badge';

interface TrendData {
  date: string;
  total?: number;
  active?: number;
  potential?: number;
  score?: number;
}

interface TowerDetailPanelProps {
  tower: TowerAuditRow;
  onClose: () => void;
}

function historyRows(payload: unknown): TrendData[] {
  if (!payload || typeof payload !== 'object') return [];
  const body = payload as { data?: unknown };
  const rows = Array.isArray(body.data) ? body.data : [];
  return rows.filter((row): row is TrendData => !!row && typeof row === 'object');
}

export function TowerDetailPanel({ tower, onClose }: TowerDetailPanelProps) {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [customerTrend, setCustomerTrend] = useState<TrendData[]>([]);
  const [mrrTrend, setMrrTrend] = useState<TrendData[]>([]);
  const [healthTrend, setHealthTrend] = useState<TrendData[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(true);

  const fetchTrends = useCallback(async () => {
    if (!user) return;
    setLoadingTrends(true);
    try {
      const token = await user.getIdToken();
      const types = ['customer-trend', 'mrr-trend', 'health-trend'] as const;
      const responses = await Promise.all(types.map((type) => fetch(
        `/api/admin/bts/audit/history?towerId=${encodeURIComponent(tower.towerId)}&type=${type}&limit=30`,
        { headers: { Authorization: `Bearer ${token}` } },
      )));
      if (responses[0].ok) setCustomerTrend(historyRows(await responses[0].json()));
      if (responses[1].ok) setMrrTrend(historyRows(await responses[1].json()));
      if (responses[2].ok) setHealthTrend(historyRows(await responses[2].json()));
    } catch {
      // History is supplementary; current audit data remains usable.
    } finally {
      setLoadingTrends(false);
    }
  }, [user, tower.towerId]);

  useEffect(() => { void fetchTrends(); }, [fetchTrends]);

  const mrrUtilisation = tower.mrrTotal > 0 ? Math.round((tower.activeMrr / tower.mrrTotal) * 100) : 100;
  const deviceAvailability = tower.deviceCount
    ? Math.round(((tower.deviceCount - (tower.deviceOutageCount ?? 0)) / tower.deviceCount) * 100)
    : 100;
  const lastRosterSync = towerSyncClock(tower);
  const trendData = useMemo(() => (healthTrend.length ? healthTrend : customerTrend).map((point) => ({
    date: point.date,
    health: point.score ?? 0,
  })), [healthTrend, customerTrend]);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <SheetHeader className="border-b bg-card px-6 py-5 text-left">
          <div className="pr-8">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline"><RadioTower className="size-3" />{tower.region}</Badge>
              <TowerStatusBadge status={tower.status} suspended={tower.suspended} />
              <SyncBadge tower={tower} />
            </div>
            <SheetTitle className="font-headline text-xl">{tower.towerName}</SheetTitle>
            <SheetDescription className="mt-1">Live network, commercial and customer-roster audit for this tower.</SheetDescription>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-5 bg-muted/20 p-4 sm:p-6">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Customers" value={tower.customers.total.toLocaleString()} detail={`${tower.customers.active} active`} icon={Users} />
            <StatCard label="Potential MRR" value={formatNaira(tower.mrrTotal)} detail={`${formatNaira(tower.activeMrr)} active`} icon={TrendingUp} />
            <StatCard label="Devices" value={(tower.deviceCount ?? 0).toLocaleString()} detail={`${deviceAvailability}% available`} icon={Wifi} />
            <StatCard label="Roster sync" value={relativeTime(lastRosterSync)} detail={`Devices ${relativeTime(tower.lastSyncAt)}`} icon={Clock3} />
          </div>

          <Card>
            <CardHeader className="pb-3"><CardTitle>Commercial utilisation</CardTitle><CardDescription>Active MRR as a share of potential MRR.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end justify-between gap-4"><span className="text-sm text-muted-foreground">Realised recurring revenue</span><span className="font-headline text-2xl font-semibold tabular-nums">{mrrUtilisation}%</span></div>
              <Progress value={mrrUtilisation} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground"><span>{formatExactNaira(tower.activeMrr)} active</span><span>{formatExactNaira(tower.mrrTotal - tower.activeMrr)} opportunity</span></div>
            </CardContent>
          </Card>

          <Tabs defaultValue="history" className="space-y-4">
            <TabsList>
              <TabsTrigger value="history"><Activity />History</TabsTrigger>
              <TabsTrigger value="customers"><Users />Customers</TabsTrigger>
            </TabsList>
            <TabsContent value="history" className="space-y-4">
              <ChartCard
                title="Tower health over time"
                description="Composite score from the audit snapshot history."
                loading={loadingTrends}
                legend={[{ label: 'Health score', color: 'var(--chart-1)' }]}
              >
                {trendData.length ? (
                  <TrendAreaChart data={trendData} xKey="date" series={[{ key: 'health', label: 'Health score' }]} yDomain={[0, 100]} height={230} valueFormatter={(value) => `${Math.round(value)}/100`} />
                ) : (
                  <EmptyState variant="plain" title="No health history yet" description="History will appear after snapshots are recorded." />
                )}
              </ChartCard>
              <div className="grid gap-3 sm:grid-cols-2">
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Latest customer count</CardTitle></CardHeader><CardContent className="font-headline text-2xl font-semibold tabular-nums">{customerTrend.at(-1)?.total ?? tower.customers.total}</CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Latest potential MRR</CardTitle></CardHeader><CardContent className="font-headline text-2xl font-semibold tabular-nums">{formatNaira(mrrTrend.at(-1)?.potential ?? tower.mrrTotal)}</CardContent></Card>
              </div>
            </TabsContent>
            <TabsContent value="customers">
              {tower.customers.customerDetails.length ? (
                <TableShell maxHeight="560px" sticky>
                  <Table className="min-w-[720px]">
                    <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Segment</TableHead><TableHead>Plan</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Potential</TableHead><TableHead className="text-right">Active</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {tower.customers.customerDetails.map((customer) => (
                        <TableRow key={`${customer.customerId ?? customer.customerName}-${customer.servicePlan}`}>
                          <TableCell><p className="font-medium">{customer.customerName || 'Unnamed'}</p><p className="text-xs text-muted-foreground">#{customer.customerId || '—'}</p></TableCell>
                          <TableCell>{accountLabel(customer.accountType)}</TableCell>
                          <TableCell>{customer.servicePlan || '—'}</TableCell>
                          <TableCell><Badge variant={customer.lifecycle === 'active' ? 'success' : 'muted'}>{customer.lifecycle || 'unknown'}</Badge></TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{formatExactNaira(customer.potentialMrr)}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums text-emerald-700">{formatExactNaira(customer.activeMrr)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableShell>
              ) : <EmptyState title="No customers on this tower" description="The roster is synced, but no customer is currently mapped here." />}
            </TabsContent>
          </Tabs>

          {(tower.deviceOutageCount ?? 0) > 0 && (
            <Card className="border-rose-200 bg-rose-50/60"><CardContent className="flex items-center gap-3 p-4 text-sm text-rose-800"><WifiOff className="size-4 shrink-0" />{tower.deviceOutageCount} device{tower.deviceOutageCount === 1 ? '' : 's'} reporting an outage on this tower.</CardContent></Card>
          )}
        </div>

        <div className="sticky bottom-0 border-t bg-card px-6 py-4"><Button variant="outline" className="w-full" onClick={onClose}>Close details</Button></div>
      </SheetContent>
    </Sheet>
  );
}
