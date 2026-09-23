'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Clock, ShieldCheck, Zap, Users, TrendingUp, AlertTriangle, Target, Star, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth, useUser } from '@/firebase';
import { useAdminFeedbacks } from '@/hooks/use-admin-feedbacks';
import type { FeedbackDoc } from '@/lib/feedback-types';
import type { ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard, StatCardGrid } from '@/components/ui/stat-card';
import { ChartCard } from '@/components/ui/chart-card';
import { TrendAreaChart } from '@/components/charts/trend-area-chart';
import { BreakdownBarChart } from '@/components/charts/breakdown-bar-chart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, DataTableColumnHeader } from '@/components/data-table';

interface SupportStaffKPI {
  staffId: string;
  staffName: string;
  role: string;
  ticketsAssigned: number;
  ticketsResolved: number;
  ticketsEscalated: number;
  ticketsReopened: number;
  avgResolutionTimeHours: number;
  slaComplianceRate: number;
  firstContactResolutionRate: number;
  avgCustomerSatisfaction: number;
  slaBreaches: number;
  currentOpenTickets: number;
  avgDailyTickets: number;
}

type Tab = 'all' | 'backend' | 'frontend';

function formatHours(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

const PRIORITY_LABELS: Record<number, string> = { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Urgent', 5: 'Critical' };

function priorityLabel(priority?: number | null): string {
  if (priority == null) return '—';
  return PRIORITY_LABELS[priority] ?? `P${priority}`;
}

function relTime(ms?: number | null): string {
  if (!ms) return '—';
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getStatusColor(rate: number) {
  if (rate >= 90) return 'text-green-600';
  if (rate >= 75) return 'text-yellow-600';
  return 'text-red-600';
}

export default function AdminSupport() {
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('month');
  const [staffKPIs, setStaffKPIs] = useState<SupportStaffKPI[]>([]);
  const [teamAverages, setTeamAverages] = useState<Record<string, number> | null>(null);
  const [loadingKPIs, setLoadingKPIs] = useState(true);
  const [kpiError, setKpiError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('all');
  // Search, assignee chip and server-side paging now live inside the tickets DataTable.
  const [ticketStatus, setTicketStatus] = useState<'all' | 'open' | 'closed'>('all');
  const [ticketAssignee, setTicketAssignee] = useState<string>('');
  const [workload, setWorkload] = useState<Array<{ assignee: string | null; name: string; open: number; total: number; pctOpen: number }>>(
    [],
  );
  const [workloadTotalOpen, setWorkloadTotalOpen] = useState(0);
  const ticketsRef = useRef<HTMLDivElement>(null);
  const [tickets, setTickets] = useState<
    Array<{
      id?: string;
      ticketNumber: number;
      customerName: string;
      customerEmail?: string;
      description: string;
      status: string;
      priority?: number | null;
      assignedTo?: string;
      assignedToName?: string;
      createdAt: number;
      resolvedAt?: number;
      slaBreached: boolean;
      location: string;
      bts?: string;
      complaintType: string;
      resolutionNotes?: string;
    }>
  >([]);
  const [ticketsTotal, setTicketsTotal] = useState(0);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<(typeof tickets)[number] | null>(null);

  const auth = useAuth();
  const { user } = useUser(auth);
  const { feedbacks, loading: feedbacksLoading } = useAdminFeedbacks();

  useEffect(() => {
    const fetchKPIs = async () => {
      if (!user) return;
      setLoadingKPIs(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/support/staff-metrics?period=${period}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
          setStaffKPIs(data.data.staffKPIs || []);
          setTeamAverages(data.data.teamAverages);
        } else {
          setKpiError(data.error || 'Failed to load KPIs');
        }
      } catch {
        setKpiError('Failed to load staff metrics');
      } finally {
        setLoadingKPIs(false);
      }
    };
    fetchKPIs();
  }, [period, user]);

  // Feedback stats
  const stats = useMemo(() => {
    const support = (feedbacks || []).filter((f: FeedbackDoc) => f.category === 'Support');
    if (support.length === 0)
      return {
        professionalism: '0',
        clarity: '0',
        responsiveness: '0',
        knowledge: '0',
        friendliness: '0',
        fcrRate: 0,
        sentiment: { pos: 0, neu: 0, frust: 0 },
        avgResponse: '—',
      };
    const avg = (key: string) => (support.reduce((a, f) => a + Number(f.ratings?.[key] || 0), 0) / support.length).toFixed(1);
    const fcrCount = support.filter((f) => f.ratings?.fcr === 'Yes').length;
    const pos = support.filter((f) => Number(f.ratings?.professionalism || 0) >= 4).length;
    const frust = support.filter((f) => Number(f.ratings?.professionalism || 0) <= 2).length;
    return {
      professionalism: avg('professionalism'),
      clarity: avg('clarity'),
      responsiveness: avg('responsiveness'),
      knowledge: avg('knowledge'),
      friendliness: avg('friendliness'),
      fcrRate: Math.round((fcrCount / support.length) * 100),
      sentiment: {
        pos: Math.round((pos / support.length) * 100),
        neu: Math.round(((support.length - pos - frust) / support.length) * 100),
        frust: Math.round((frust / support.length) * 100),
      },
      avgResponse: `${Math.round(45 - ((Number(avg('responsiveness')) - 1) / 4) * 37)}m`,
    };
  }, [feedbacks]);

  // Charts
  const volumeData = useMemo(() => {
    const support = (feedbacks || []).filter((f: FeedbackDoc) => f.category === 'Support');
    const groups: Record<string, { name: string; tickets: number; ts: number }> = {};
    support.forEach((f) => {
      const label = new Date(f.timestamp ?? 0).toLocaleDateString([], { month: 'short', day: 'numeric' });
      if (!groups[label]) groups[label] = { name: label, tickets: 0, ts: f.timestamp ?? 0 };
      groups[label].tickets += 1;
    });
    return Object.values(groups)
      .sort((a, b) => a.ts - b.ts)
      .map(({ name, tickets }) => ({ date: name, tickets }));
  }, [feedbacks]);

  const dimensionData = useMemo(
    () => [
      { name: 'Helpfulness', score: Number(stats.professionalism) },
      { name: 'Clarity', score: Number(stats.clarity) },
      { name: 'Response Speed', score: Number(stats.responsiveness) },
      { name: 'Agent Knowledge', score: Number(stats.knowledge) },
      { name: 'Friendliness', score: Number(stats.friendliness) },
    ],
    [stats],
  );

  const totalRequests = volumeData.reduce((sum, d) => sum + d.tickets, 0);

  type TicketRow = (typeof tickets)[number];

  const filteredStaff = useMemo(() => {
    if (activeTab === 'backend') return staffKPIs.filter((k) => k.role === 'Back-end Support');
    if (activeTab === 'frontend') return staffKPIs.filter((k) => k.role === 'Support Agent' || k.role === 'Front-end Support');
    return staffKPIs;
  }, [staffKPIs, activeTab]);

  const staffColumns = useMemo<ColumnDef<SupportStaffKPI>[]>(
    () => [
      {
        accessorKey: 'staffName',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Staff" />,
        cell: ({ row }) => (
          <button
            onClick={() => filterByAssignee(row.original.staffId)}
            className="text-left hover:underline"
            title={`Show ${row.original.staffName}'s tickets`}
          >
            <p className="font-mono text-xs font-bold text-primary">{row.original.staffName}</p>
            <p className="font-mono text-[9px] text-on-surface-variant/50 capitalize">{row.original.role}</p>
          </button>
        ),
      },
      {
        accessorKey: 'ticketsAssigned',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Assigned" />,
        cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.ticketsAssigned}</span>,
      },
      {
        accessorKey: 'ticketsResolved',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Resolved" />,
        cell: ({ row }) => <span className="font-mono text-xs font-bold text-primary">{row.original.ticketsResolved}</span>,
      },
      {
        accessorKey: 'avgResolutionTimeHours',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Resolution" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">{formatHours(row.original.avgResolutionTimeHours)}</span>
        ),
      },
      {
        accessorKey: 'slaComplianceRate',
        header: ({ column }) => <DataTableColumnHeader column={column} title="SLA %" />,
        cell: ({ row }) => (
          <span className={cn('font-mono text-xs font-bold', getStatusColor(row.original.slaComplianceRate))}>
            {row.original.slaComplianceRate.toFixed(1)}%
          </span>
        ),
      },
      {
        accessorKey: 'firstContactResolutionRate',
        header: ({ column }) => <DataTableColumnHeader column={column} title="FCR %" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">{row.original.firstContactResolutionRate.toFixed(1)}%</span>
        ),
      },
      {
        accessorKey: 'avgCustomerSatisfaction',
        header: ({ column }) => <DataTableColumnHeader column={column} title="CSAT" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">{row.original.avgCustomerSatisfaction.toFixed(1)}/5</span>
        ),
      },
      {
        accessorKey: 'currentOpenTickets',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Open" />,
        cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.currentOpenTickets}</span>,
      },
    ],
    [],
  );

  const workloadColumns = useMemo<ColumnDef<(typeof workload)[number]>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Assignee" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs font-bold text-primary" title={`Show ${row.original.name}'s tickets`}>
            {row.original.name}
          </span>
        ),
      },
      {
        accessorKey: 'open',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Open" />,
        cell: ({ row }) => <span className="font-mono text-xs font-bold">{row.original.open}</span>,
      },
      {
        accessorKey: 'pctOpen',
        header: ({ column }) => <DataTableColumnHeader column={column} title="% of open" />,
        cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.pctOpen}%</span>,
      },
      {
        accessorKey: 'total',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
        cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.total.toLocaleString()}</span>,
      },
    ],
    [],
  );

  const ticketColumns = useMemo<ColumnDef<TicketRow>[]>(
    () => [
      {
        accessorKey: 'ticketNumber',
        header: ({ column }) => <DataTableColumnHeader column={column} title="#" />,
        cell: ({ row }) => <span className="whitespace-nowrap font-mono text-xs font-bold text-primary">#{row.original.ticketNumber}</span>,
      },
      {
        accessorKey: 'customerName',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
        cell: ({ row }) => (
          <div className="min-w-[170px]">
            <p className="whitespace-nowrap text-sm font-bold text-primary">{row.original.customerName || '—'}</p>
            <p className="max-w-[200px] truncate font-mono text-[10px] text-muted-foreground">{row.original.customerEmail || ''}</p>
          </div>
        ),
      },
      {
        accessorKey: 'description',
        header: 'Subject',
        enableSorting: false,
        cell: ({ row }) => (
          <span className="block max-w-[280px] truncate text-sm text-muted-foreground" title={row.original.description}>
            {row.original.description || '—'}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-1">
            <Badge variant={row.original.status === 'closed' ? 'success' : 'warning'}>{row.original.status}</Badge>
            {row.original.slaBreached && (
              <Badge variant="danger" title="Unresolved past the 1.5h SLA">
                SLA
              </Badge>
            )}
          </span>
        ),
        filterFn: (row, id, value: string[]) => value.includes(String(row.getValue(id))),
      },
      {
        accessorKey: 'priority',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Priority" />,
        cell: ({ row }) => <span className="whitespace-nowrap font-mono text-xs font-bold">{priorityLabel(row.original.priority)}</span>,
        filterFn: (row, id, value: string[]) => value.includes(String(row.getValue(id) ?? '')),
      },
      {
        accessorKey: 'assignedToName',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Assigned" />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground" title={row.original.assignedTo || ''}>
            {row.original.assignedToName || row.original.assignedTo || 'Unassigned'}
          </span>
        ),
        filterFn: (row, id, value: string[]) => value.includes(String(row.getValue(id) ?? 'Unassigned')),
      },
      {
        accessorKey: 'createdAt',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Age" />,
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">{relTime(row.original.createdAt)}</span>
        ),
      },
    ],
    [],
  );

  const ticketStatusOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tickets) counts.set(t.status || 'open', (counts.get(t.status || 'open') || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([status, count]) => ({ label: `${status} (${count})`, value: status }));
  }, [tickets]);

  const ticketAssigneeOptions = useMemo(
    () =>
      workload.map((w) => ({
        label: `${w.name} (${w.open})`,
        value: w.name,
      })),
    [workload],
  );

  const scrollToTickets = () => {
    ticketsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const filterByAssignee = (assignee: string | null) => {
    setTicketAssignee(assignee ?? '__unassigned__');
    setTicketStatus('all');
    scrollToTickets();
  };

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const loadWorkload = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/tickets/summary', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!cancelled && data.success) {
          setWorkload(data.data?.breakdown || []);
          setWorkloadTotalOpen(data.data?.totalOpen || 0);
        }
      } catch {
        /* workload stays empty on transient failure */
      }
    };
    loadWorkload();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setTicketsLoading(true);
    const id = setTimeout(async () => {
      try {
        const token = await user.getIdToken();
        const params = new URLSearchParams({
          page: '1',
          pageSize: '200',
          ...(ticketStatus !== 'all' ? { status: ticketStatus } : {}),
          ...(ticketAssignee ? { assignedTo: ticketAssignee } : {}),
        });
        const res = await fetch(`/api/admin/tickets?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
          setTickets(data.data?.tickets || []);
          setTicketsTotal(data.data?.total || 0);
        }
      } catch {
        /* keep previous list on transient failure */
      } finally {
        setTicketsLoading(false);
      }
    }, 400);
    return () => clearTimeout(id);
  }, [user, ticketStatus, ticketAssignee]);

  const avgSLA = staffKPIs.length > 0 ? Math.round(staffKPIs.reduce((s, k) => s + k.slaComplianceRate, 0) / staffKPIs.length) : 0;
  const avgFCR =
    staffKPIs.length > 0 ? (staffKPIs.reduce((s, k) => s + k.firstContactResolutionRate, 0) / staffKPIs.length).toFixed(1) : '—';

  const isLoading = loadingKPIs || feedbacksLoading;

  return (
    <AdminLayout>
      <div className="max-w-screen-2xl mx-auto">
        {/* Header */}
        <PageHeader
          eyebrow="Support"
          title="Support Overview"
          description="Performance & satisfaction ratings for the support team."
          actions={
            <Tabs value={period} onValueChange={(value) => setPeriod(value as 'week' | 'month' | 'quarter')}>
              <TabsList variant="segmented">
                {(['week', 'month', 'quarter'] as const).map((p) => (
                  <TabsTrigger key={p} value={p}>
                    {p}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          }
        />

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-secondary" />
          </div>
        )}

        {/* Error */}
        {kpiError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mt-4 mb-6 font-mono text-xs">{kpiError}</div>
        )}

        {!isLoading && (
          <div className="mt-6">
            {/* Section 1: KPI tiles */}
            <StatCardGrid columns={6}>
              <StatCard label="Team Size" value={String(staffKPIs.length)} icon={Users} />
              <StatCard label="Assigned" value={String(teamAverages?.totalTicketsAssigned ?? 0)} icon={TrendingUp} />
              <StatCard label="Resolved" value={String(teamAverages?.totalTicketsResolved ?? 0)} icon={ShieldCheck} />
              <StatCard label="SLA Compliance" value={avgSLA} unit="%" icon={Target} />
              <StatCard
                label="CSAT Score"
                value={teamAverages?.avgCustomerSatisfaction ?? '—'}
                unit={teamAverages?.avgCustomerSatisfaction ? '/5' : ''}
                icon={Star}
              />
              <StatCard
                label="Avg Resolution"
                value={teamAverages?.avgResolutionTimeHours ? formatHours(teamAverages.avgResolutionTimeHours) : '—'}
                icon={Clock}
              />
            </StatCardGrid>
            {/* First-time fix progress */}
            <div className="mt-4 rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[9px] uppercase tracking-widest font-bold text-muted-foreground">First-Time Fix Rate</span>
                <span className="font-mono text-[11px] font-bold text-primary">{avgFCR}%</span>
              </div>
              <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                <div className="h-full bg-secondary rounded-full" style={{ width: `${avgFCR}%` }} />
              </div>
            </div>

            {/* Section 2: Charts — above the fold */}
            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
              <ChartCard
                className="lg:col-span-12"
                title="Requests over time"
                description={`${totalRequests} support requests in period.`}
                legend={[{ label: 'Requests', color: 'var(--chart-1)', value: String(totalRequests) }]}
              >
                {volumeData.length === 0 ? (
                  <EmptyState
                    title="No requests in this period"
                    description="Widen the period above to see the request volume trend."
                    className="border-0"
                  />
                ) : (
                  <TrendAreaChart
                    data={volumeData}
                    xKey="date"
                    height={260}
                    valueFormatter={(value) => `${value}`}
                    series={[{ key: 'tickets', label: 'Requests', color: 'var(--chart-1)' }]}
                  />
                )}
              </ChartCard>

              <ChartCard className="lg:col-span-6" title="Response quality" description="Average score per dimension (0–5).">
                <BreakdownBarChart
                  items={dimensionData.map((d) => ({ name: d.name, value: d.score }))}
                  max={5}
                  valueFormatter={(item) => `${Number(item.value).toFixed(1)}/5`}
                  emptyLabel="No quality data for this period"
                />
              </ChartCard>

              <ChartCard
                className="lg:col-span-6"
                title="Customer sentiment"
                description="Share of positive, neutral and frustrated answers."
              >
                <BreakdownBarChart
                  items={[
                    { name: 'Positive', value: stats.sentiment.pos, barClassName: 'bg-emerald-500' },
                    { name: 'Neutral', value: stats.sentiment.neu, barClassName: 'bg-zinc-400' },
                    { name: 'Frustrated', value: stats.sentiment.frust, barClassName: 'bg-red-500' },
                  ]}
                  max={100}
                  valueFormatter={(item) => `${item.value}%`}
                  emptyLabel="No sentiment data for this period"
                />
              </ChartCard>
            </div>

            {/* Section 3: Staff Performance — single tabbed table */}
            <ChartCard
              className="mt-6"
              title="Staff performance"
              description="Click a row to filter the tickets below."
              actions={
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as Tab)}>
                  <TabsList variant="segmented">
                    {(
                      [
                        { id: 'all', label: 'All', count: staffKPIs.length },
                        { id: 'backend', label: 'Backend', count: staffKPIs.filter((k) => k.role === 'Back-end Support').length },
                        {
                          id: 'frontend',
                          label: 'Frontend',
                          count: staffKPIs.filter((k) => k.role === 'Support Agent' || k.role === 'Front-end Support').length,
                        },
                      ] as { id: Tab; label: string; count: number }[]
                    ).map((tab) => (
                      <TabsTrigger key={tab.id} value={tab.id}>
                        {tab.label} ({tab.count})
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              }
              chartClassName="p-0"
            >
              {filteredStaff.length === 0 ? (
                <EmptyState title="No staff data for this period" className="border-0" />
              ) : (
                <DataTable
                  columns={staffColumns}
                  data={filteredStaff}
                  searchKey="staffName"
                  searchPlaceholder="Search staff…"
                  initialPageSize={8}
                  showPagination
                  emptyTitle="No staff data for this period"
                  onRowClick={(row) => filterByAssignee(row.staffId)}
                />
              )}
            </ChartCard>

            {/* Section 4: Workload — open tickets per assignee (mirrors Splynx) */}
            <ChartCard
              className="mt-6"
              title="Workload by assignee"
              description={
                workloadTotalOpen > 0
                  ? `Open tickets · ${workloadTotalOpen} total — click a row to filter the list below`
                  : 'Open tickets — click a row to filter the list below'
              }
              chartClassName="p-0"
            >
              {workload.length === 0 ? (
                <EmptyState title="No workload data" className="border-0" />
              ) : (
                <DataTable
                  columns={workloadColumns}
                  data={workload}
                  searchKey="name"
                  searchPlaceholder="Search assignees…"
                  initialPageSize={8}
                  showPagination
                  emptyTitle="No workload data"
                  onRowClick={(row) => filterByAssignee(row.assignee)}
                />
              )}
            </ChartCard>

            {/* Section 5: Tickets — searchable list with detail view */}
            <div ref={ticketsRef} className="scroll-mt-20">
              <ChartCard
                className="mt-6"
                title={ticketsTotal > 0 ? `Tickets (${ticketsTotal.toLocaleString()})` : 'Tickets'}
                description="Click a row for the full detail."
                actions={
                  <Tabs value={ticketStatus} onValueChange={(value) => setTicketStatus(value as 'all' | 'open' | 'closed')}>
                    <TabsList variant="segmented">
                      {(['all', 'open', 'closed'] as const).map((s) => (
                        <TabsTrigger key={s} value={s}>
                          {s}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                }
                chartClassName="p-0"
              >
                <DataTable
                  columns={ticketColumns}
                  data={tickets}
                  searchKey="customerName"
                  searchPlaceholder="Search name, email, ticket #…"
                  filters={[
                    { columnId: 'status', title: 'Status', options: ticketStatusOptions },
                    { columnId: 'assignedToName', title: 'Assignee', options: ticketAssigneeOptions },
                  ]}
                  toolbarActions={
                    ticketAssignee ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full font-mono text-[10px] uppercase font-bold"
                        onClick={() => setTicketAssignee('')}
                        title="Clear assignee filter"
                      >
                        ✕{' '}
                        {ticketAssignee === '__unassigned__'
                          ? 'Unassigned'
                          : (workload.find((w) => w.assignee === ticketAssignee)?.name ?? ticketAssignee)}
                      </Button>
                    ) : undefined
                  }
                  loading={ticketsLoading}
                  emptyTitle="No tickets match the current filters"
                  onRowClick={(row) => setSelectedTicket(row)}
                />
              </ChartCard>
            </div>

            {selectedTicket && (
              <div
                className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
                onClick={() => setSelectedTicket(null)}
                role="dialog"
                aria-modal="true"
                aria-label={`Ticket ${selectedTicket.ticketNumber}`}
              >
                <div
                  className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant/50 font-bold">
                        Ticket #{selectedTicket.ticketNumber}
                      </p>
                      <h3 className="font-display font-bold text-lg text-primary">{selectedTicket.customerName || 'Unknown customer'}</h3>
                    </div>
                    <button
                      onClick={() => setSelectedTicket(null)}
                      className="font-mono text-[10px] uppercase font-bold text-on-surface-variant hover:text-primary px-3 py-1.5"
                      aria-label="Close ticket details"
                    >
                      Close
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    <span
                      className={cn(
                        'text-[10px] font-bold font-mono',
                        selectedTicket.status === 'closed' ? 'text-green-700' : 'text-amber-700',
                      )}
                    >
                      {selectedTicket.status}
                    </span>
                    <span className="text-[10px] font-bold font-mono text-zinc-600">{priorityLabel(selectedTicket.priority)} priority</span>
                    {selectedTicket.slaBreached && (
                      <span className="text-[10px] font-bold font-mono text-red-600">SLA breached (1.5h)</span>
                    )}
                  </div>
                  <p className="text-sm text-on-surface-variant whitespace-pre-wrap mb-4">
                    {selectedTicket.description || 'No description.'}
                  </p>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-xs border-t border-border/50 pt-4">
                    <dt className="text-on-surface-variant/50 uppercase text-[10px] font-bold">Customer email</dt>
                    <dd className="text-right break-words">{selectedTicket.customerEmail || '—'}</dd>
                    <dt className="text-on-surface-variant/50 uppercase text-[10px] font-bold">Location / Tower</dt>
                    <dd className="text-right">{[selectedTicket.location, selectedTicket.bts].filter(Boolean).join(' · ') || '—'}</dd>
                    <dt className="text-on-surface-variant/50 uppercase text-[10px] font-bold">Assigned to</dt>
                    <dd className="text-right">{selectedTicket.assignedTo || 'Unassigned'}</dd>
                    <dt className="text-on-surface-variant/50 uppercase text-[10px] font-bold">Complaint type</dt>
                    <dd className="text-right">{selectedTicket.complaintType || '—'}</dd>
                    <dt className="text-on-surface-variant/50 uppercase text-[10px] font-bold">Created</dt>
                    <dd className="text-right">{selectedTicket.createdAt ? new Date(selectedTicket.createdAt).toLocaleString() : '—'}</dd>
                    <dt className="text-on-surface-variant/50 uppercase text-[10px] font-bold">Resolved</dt>
                    <dd className="text-right">{selectedTicket.resolvedAt ? new Date(selectedTicket.resolvedAt).toLocaleString() : '—'}</dd>
                  </dl>
                  {selectedTicket.resolutionNotes && (
                    <div className="mt-4 p-4 bg-muted rounded-xl text-xs border-l-4 border-secondary">
                      <p className="font-mono text-[10px] uppercase font-bold text-secondary mb-1">Resolution notes</p>
                      {selectedTicket.resolutionNotes}
                    </div>
                  )}
                  <p className="font-mono text-[10px] text-on-surface-variant/40 mt-4">
                    Synced from Splynx — edit status and assignment there.
                  </p>
                </div>
              </div>
            )}

            {/* Section 6: Feedback Ratings — compact single card */}
            <ChartCard className="mt-6" title="Feedback ratings" description="Average score per dimension.">
              <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-4">
                <RatingCell label="Helpfulness" value={stats.professionalism} />
                <RatingCell label="Clarity" value={stats.clarity} />
                <RatingCell label="Response Speed" value={stats.responsiveness} />
                <RatingCell label="Knowledge" value={stats.knowledge} />
                <RatingCell label="Friendliness" value={stats.friendliness} />
                <RatingCell label="First-Time Fix" value={`${stats.fcrRate}%`} />
              </div>
            </ChartCard>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

/* ---- Small sub-components ---- */

function RatingCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="font-mono text-[8px] uppercase tracking-widest font-bold text-on-surface-variant/50 mb-1">{label}</p>
      <p className="font-mono text-xl font-bold text-primary">{value}</p>
      <p className="font-mono text-[8px] text-on-surface-variant/30">/5</p>
    </div>
  );
}
