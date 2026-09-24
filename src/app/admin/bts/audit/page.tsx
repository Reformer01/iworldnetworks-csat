'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Download, FileText, GitCompareArrows, RadioTower, RefreshCw, ShieldAlert, TrendingUp, Users, Wifi, Zap } from 'lucide-react';

import { useAuth, useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { DataTable, DataTableColumnHeader } from '@/components/data-table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartCard } from '@/components/ui/chart-card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Progress } from '@/components/ui/progress';
import { StatCard, StatCardGrid } from '@/components/ui/stat-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BreakdownBarChart } from '@/components/charts/breakdown-bar-chart';
import { TrendAreaChart } from '@/components/charts/trend-area-chart';
import { HealthBadge, SyncBadge, TowerStatusBadge } from '@/components/admin/bts-status-badge';
import { TowerComparison } from '@/components/admin/TowerComparison';
import { TowerDetailPanel } from '@/components/admin/TowerDetailPanel';
import type { TowerAuditRow } from '@/lib/audit/computeTowerAudit';
import { formatNaira, healthBand, relativeTime, towerHealthScore, towerNeedsAttention, towerSyncClock } from '@/lib/bts-ui';
import { cn } from '@/lib/utils';

type DevicesMeta = { devicesSyncAt: number | null; devicesStale: boolean; uispConfigured: boolean };

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function BtsAuditPage() {
  const auth = useAuth();
  const { user, loading: authLoading } = useUser(auth);
  const { toast } = useToast();
  const [towers, setTowers] = useState<TowerAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [devicesMeta, setDevicesMeta] = useState<DevicesMeta | null>(null);
  const [selected, setSelected] = useState<TowerAuditRow | null>(null);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [comparisonOpen, setComparisonOpen] = useState(false);

  const fetchAudit = useCallback(async () => {
    if (authLoading) return;
    if (!user?.emailVerified) { setLoading(false); return; }
    try {
      setLoading(true);
      const token = await user.getIdToken();
      const response = await fetch(`/api/admin/bts/audit?includeEmpty=${includeEmpty}`, { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Failed: ${response.statusText}`);
      setTowers((result.data?.towers as TowerAuditRow[]) || []);
      setDevicesMeta((result.data?.meta as DevicesMeta) || null);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load the tower audit.');
    } finally { setLoading(false); }
  }, [authLoading, includeEmpty, user]);

  useEffect(() => { void fetchAudit(); }, [fetchAudit]);

  const visibleTowers = useMemo(() => attentionOnly ? towers.filter((tower) => towerNeedsAttention(tower)) : towers, [attentionOnly, towers]);
  const metrics = useMemo(() => {
    const customerTotal = towers.reduce((sum, tower) => sum + tower.customers.total, 0);
    const activeCustomers = towers.reduce((sum, tower) => sum + tower.customers.active, 0);
    const potentialMrr = towers.reduce((sum, tower) => sum + tower.mrrTotal, 0);
    const activeMrr = towers.reduce((sum, tower) => sum + tower.activeMrr, 0);
    const health = towers.length ? Math.round(towers.reduce((sum, tower) => sum + towerHealthScore(tower), 0) / towers.length) : 0;
    return { towers: towers.length, customerTotal, activeCustomers, potentialMrr, activeMrr, opportunity: potentialMrr - activeMrr, health, attention: towers.filter((tower) => towerNeedsAttention(tower)).length };
  }, [towers]);

  const healthProfile = useMemo(() => [...towers]
    .sort((a, b) => b.customers.total - a.customers.total)
    .slice(0, 12)
    .map((tower) => ({
      tower: tower.towerName.length > 15 ? `${tower.towerName.slice(0, 14)}…` : tower.towerName,
      health: towerHealthScore(tower),
      devices: tower.deviceCount ? Math.round(((tower.deviceCount - (tower.deviceOutageCount ?? 0)) / tower.deviceCount) * 100) : 100,
    })), [towers]);

  const regionalExposure = useMemo(() => {
    const regions = new Map<string, { active: number; opportunity: number }>();
    for (const tower of towers) {
      const current = regions.get(tower.region) || { active: 0, opportunity: 0 };
      current.active += tower.activeMrr;
      current.opportunity += tower.mrrTotal - tower.activeMrr;
      regions.set(tower.region, current);
    }
    return [...regions.entries()].map(([name, values]) => ({ name, value: values.opportunity, active: values.active })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [towers]);

  const comparisonTowers = useMemo(() => towers.filter((tower) => compareIds.has(tower.towerId)), [compareIds, towers]);

  const toggleCompare = useCallback((tower: TowerAuditRow) => {
    setCompareIds((current) => {
      const next = new Set(current);
      if (next.has(tower.towerId)) next.delete(tower.towerId);
      else if (next.size < 3) next.add(tower.towerId);
      else toast({ title: 'Compare up to three towers', description: 'Remove one selected tower before adding another.' });
      return next;
    });
  }, [toast]);

  const exportData = () => {
    downloadCsv(`bts-audit-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Tower', 'Region', 'Status', 'Health', 'Customers', 'Active customers', 'Potential MRR', 'Active MRR', 'Opportunity', 'Devices', 'Outages', 'Roster sync'],
      ...visibleTowers.map((tower) => [tower.towerName, tower.region, tower.status || 'unknown', towerHealthScore(tower), tower.customers.total, tower.customers.active, tower.mrrTotal, tower.activeMrr, tower.mrrTotal - tower.activeMrr, tower.deviceCount || 0, tower.deviceOutageCount || 0, relativeTime(towerSyncClock(tower))]),
    ]);
    toast({ title: 'Tower audit exported', description: `${visibleTowers.length} towers written to CSV.` });
  };

  const exportReport = () => {
    const top = [...towers].sort((a, b) => b.activeMrr - a.activeMrr).slice(0, 10);
    downloadCsv(`bts-audit-report-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['IWN BTS audit report'], ['Towers', metrics.towers], ['Customers', metrics.customerTotal], ['Average health', `${metrics.health}/100`], ['Potential MRR', metrics.potentialMrr], ['Active MRR', metrics.activeMrr], ['Needs attention', metrics.attention], [],
      ['Top towers by active MRR'], ['Tower', 'Region', 'Customers', 'Active MRR', 'Health'],
      ...top.map((tower) => [tower.towerName, tower.region, tower.customers.total, tower.activeMrr, towerHealthScore(tower)]),
    ]);
    toast({ title: 'Audit report exported', description: 'Summary and top-performing towers were written to CSV.' });
  };

  const columns = useMemo<ColumnDef<TowerAuditRow>[]>(() => [
    {
      id: 'towerName', accessorKey: 'towerName', header: ({ column }) => <DataTableColumnHeader column={column} title="Tower" />,
      cell: ({ row }) => <div className="min-w-[180px]"><p className="font-medium">{row.original.towerName}</p><p className="text-xs text-muted-foreground">{row.original.region}</p></div>,
    },
    {
      id: 'region', accessorKey: 'region', header: ({ column }) => <DataTableColumnHeader column={column} title="Region" />,
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.region}</span>,
    },
    {
      id: 'health', accessorFn: (tower) => towerHealthScore(tower), header: ({ column }) => <DataTableColumnHeader column={column} title="Health" />,
      cell: ({ row }) => <HealthBadge score={towerHealthScore(row.original)} />,
    },
    {
      id: 'status', accessorFn: (tower) => tower.suspended ? 'suspended' : tower.status || 'unknown', header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <TowerStatusBadge status={row.original.status} suspended={row.original.suspended} />,
    },
    {
      id: 'customers', accessorFn: (tower) => tower.customers.total, header: ({ column }) => <DataTableColumnHeader column={column} title="Customers" />,
      cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.customers.total}</span>,
    },
    {
      id: 'activeMrr', accessorFn: (tower) => tower.activeMrr, header: ({ column }) => <DataTableColumnHeader column={column} title="Active MRR" />,
      cell: ({ row }) => <span className="font-medium tabular-nums">{formatNaira(row.original.activeMrr)}</span>,
    },
    {
      id: 'opportunity', accessorFn: (tower) => tower.mrrTotal - tower.activeMrr, header: ({ column }) => <DataTableColumnHeader column={column} title="Opportunity" />,
      cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{formatNaira(row.original.mrrTotal - row.original.activeMrr)}</span>,
    },
    {
      id: 'sync', accessorFn: (tower) => towerSyncClock(tower) || 0, header: ({ column }) => <DataTableColumnHeader column={column} title="Sync" />,
      cell: ({ row }) => <div className="min-w-[86px]"><SyncBadge tower={row.original} /><p className="mt-1 text-xs text-muted-foreground">{relativeTime(towerSyncClock(row.original))}</p></div>,
    },
    {
      id: 'compare', enableSorting: false, enableHiding: false, header: () => <span className="sr-only">Compare</span>,
      cell: ({ row }) => <Button size="xs" variant={compareIds.has(row.original.towerId) ? 'secondary' : 'ghost'} onClick={(event) => { event.stopPropagation(); toggleCompare(row.original); }} aria-label={`Compare ${row.original.towerName}`}><GitCompareArrows />{compareIds.has(row.original.towerId) ? 'Selected' : 'Compare'}</Button>,
    },
  ], [compareIds, toggleCompare]);

  return (
    <SalesLayout>
      <div className="mx-auto max-w-[1600px] space-y-6">
        <PageHeader
          eyebrow="Network intelligence"
          title="BTS audit"
          description="Live tower health, customer coverage and commercial exposure from UISP and the unified Splynx roster."
          actions={(
            <>
              <Button variant="outline" size="sm" onClick={() => setAttentionOnly((value) => !value)} className={cn(attentionOnly && 'border-secondary text-secondary')}>
                <ShieldAlert />{attentionOnly ? 'Showing attention' : 'Needs attention'}{metrics.attention > 0 && <Badge variant="warning">{metrics.attention}</Badge>}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIncludeEmpty((value) => !value)} className={cn(includeEmpty && 'border-secondary text-secondary')}>
                <RadioTower />{includeEmpty ? 'Including empty' : 'Include empty'}
              </Button>
              <Button variant="outline" size="icon" onClick={() => void fetchAudit()} disabled={loading} aria-label="Refresh tower audit"><RefreshCw className={cn(loading && 'animate-spin')} /></Button>
              {compareIds.size >= 2 && <Button size="sm" onClick={() => setComparisonOpen(true)}><GitCompareArrows />Compare {compareIds.size}</Button>}
              <Button variant="outline" size="sm" onClick={exportReport}><FileText />Report</Button>
              <Button size="sm" onClick={exportData}><Download />Export CSV</Button>
            </>
          )}
        />

        {(metrics.attention > 0 || devicesMeta?.devicesStale) && !loading && (
          <div className="grid gap-3 lg:grid-cols-2">
            {metrics.attention > 0 && (
              <Alert className="cursor-pointer border-amber-200 bg-amber-50 text-amber-950" onClick={() => setAttentionOnly(true)}>
                <AlertTriangle />
                <AlertTitle>{metrics.attention} towers need attention</AlertTitle>
                <AlertDescription>Open the attention filter to isolate outages, suspended sites and stale customer rosters.</AlertDescription>
              </Alert>
            )}
            {devicesMeta?.devicesStale && (
              <Alert className="border-sky-200 bg-sky-50 text-sky-950">
                <Wifi />
                <AlertTitle>Device telemetry is stale</AlertTitle>
                <AlertDescription>UISP device data has not refreshed since {relativeTime(devicesMeta.devicesSyncAt)}. Customer and MRR data remain sourced from the live Splynx roster.</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <StatCardGrid columns={6}>
          <StatCard label="Towers" value={metrics.towers.toLocaleString()} detail="Audited sites" icon={RadioTower} />
          <StatCard label="Network health" value={`${metrics.health}%`} detail={healthBand(metrics.health)} icon={CheckCircle2} />
          <StatCard label="Customers" value={metrics.customerTotal.toLocaleString()} detail={`${metrics.activeCustomers.toLocaleString()} active`} icon={Users} />
          <StatCard label="Potential MRR" value={formatNaira(metrics.potentialMrr)} detail="Connected customer value" icon={TrendingUp} />
          <StatCard label="Active MRR" value={formatNaira(metrics.activeMrr)} detail="Realised recurring revenue" icon={CheckCircle2} />
          <StatCard label="Opportunity" value={formatNaira(metrics.opportunity)} detail={`${metrics.attention} need attention`} icon={Zap} />
        </StatCardGrid>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="towers">All towers</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-3">
              <ChartCard
                className="xl:col-span-2"
                title="Network health profile"
                description="Composite health and device availability for the highest-customer towers."
                legend={[{ label: 'Health score', color: 'var(--chart-1)' }, { label: 'Device availability', color: 'var(--chart-2)' }]}
                chartClassName="w-full"
              >
                {healthProfile.length ? (
                  <TrendAreaChart
                    data={healthProfile}
                    xKey="tower"
                    series={[{ key: 'health', label: 'Health score' }, { key: 'devices', label: 'Device availability', variant: 'line', color: 'var(--chart-2)' }]}
                    yDomain={[0, 100]}
                    height={300}
                    className="w-full"
                    valueFormatter={(value) => `${Math.round(value)}%`}
                  />
                ) : <EmptyState variant="plain" title="No tower health data" description="Refresh the audit after the next UISP or Splynx sync." />}
              </ChartCard>

              <ChartCard title="Revenue opportunity by region" description="Potential MRR not currently realised as active MRR.">
                <BreakdownBarChart items={regionalExposure.map((region) => ({ ...region, hint: `${formatNaira(region.active)} active MRR` }))} valueFormatter={(item) => formatNaira(item.value)} className="pt-1" />
              </ChartCard>
            </div>

            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div><CardTitle>Priority queue</CardTitle><CardDescription>Towers ordered by operational and commercial risk.</CardDescription></div>
                <Button variant="ghost" size="sm" onClick={() => setAttentionOnly(true)}>Open queue</Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {[...towers].filter((tower) => towerNeedsAttention(tower)).sort((a, b) => towerHealthScore(a) - towerHealthScore(b)).slice(0, 5).map((tower) => {
                  const score = towerHealthScore(tower);
                  return (
                    <button key={tower.towerId} onClick={() => setSelected(tower)} className="grid w-full gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 sm:grid-cols-[1fr_150px_auto] sm:items-center">
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{tower.towerName}</p><p className="text-xs text-muted-foreground">{tower.region} · {tower.customers.total} customers</p></div>
                      <div className="space-y-1"><div className="flex justify-between text-xs"><span className="text-muted-foreground">Health</span><span className="font-medium tabular-nums">{score}/100</span></div><Progress value={score} className="h-1.5" /></div>
                      <HealthBadge score={score} />
                    </button>
                  );
                })}
                {!towers.some((tower) => towerNeedsAttention(tower)) && <EmptyState variant="plain" icon={CheckCircle2} title="The network is clear" description="No tower currently reports an outage, suspension or stale roster." />}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="towers">
            {error ? <EmptyState icon={AlertTriangle} title="Tower audit unavailable" description={error} action={{ label: 'Try again', onClick: () => void fetchAudit() }} /> : (
              <DataTable
                columns={columns}
                data={visibleTowers}
                searchKey="towerName"
                searchPlaceholder="Search tower or region..."
                filters={[
                  { columnId: 'region', title: 'Region', options: [...new Set(towers.map((tower) => tower.region))].sort().map((region) => ({ label: region, value: region })) },
                  { columnId: 'status', title: 'Status', options: [...new Set(towers.map((tower) => tower.suspended ? 'suspended' : tower.status || 'unknown'))].sort().map((status) => ({ label: status, value: status })) },
                ]}
                initialSorting={[{ id: 'health', desc: false }]}
                initialPageSize={20}
                loading={loading}
                emptyTitle={attentionOnly ? 'No towers need attention' : 'No towers match these filters'}
                emptyDescription="Clear the filters or refresh the audit to include more sites."
                totalLabel={`${visibleTowers.length} towers in this view`}
                onRowClick={(tower) => setSelected(tower)}
                toolbarActions={compareIds.size ? <Button variant="outline" size="sm" onClick={() => setComparisonOpen(true)} disabled={compareIds.size < 2}><GitCompareArrows />Compare {compareIds.size}</Button> : undefined}
              />
            )}
          </TabsContent>
        </Tabs>

        {selected && <TowerDetailPanel tower={selected} onClose={() => setSelected(null)} />}
        {comparisonOpen && comparisonTowers.length >= 2 && <TowerComparison towers={comparisonTowers} onClose={() => setComparisonOpen(false)} />}
      </div>
    </SalesLayout>
  );
}
