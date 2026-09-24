'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Activity, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, RadioTower, Search, ShieldAlert, Users, Wifi } from 'lucide-react';

import { useAuth, useUser } from '@/firebase';
import { useBtsCustomers } from '@/hooks/use-bts-data';
import { useToast } from '@/hooks/use-toast';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { DataTable, DataTableColumnHeader } from '@/components/data-table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatCard, StatCardGrid } from '@/components/ui/stat-card';
import { MatchBadge } from '@/components/admin/bts-status-badge';
import { getEffectiveMrr } from '@/lib/customer-mrr';
import { accountLabel, formatNaira } from '@/lib/bts-ui';
import { BTS_REGIONS } from '@/lib/bts-data';
import { toLocalDateString } from '@/lib/utils';
import type { UnifiedCustomerRecord } from '@/app/api/admin/bts/customers/route';

const PAGE_SIZE = 50;
const ALL = '__all';

function lifecycleTone(lifecycle: string | null) {
  if (lifecycle === 'active') return 'success' as const;
  if (lifecycle === 'blocked' || lifecycle === 'inactive') return 'warning' as const;
  return 'muted' as const;
}

function DeviceStatus({ status, outages }: { status: string | null; outages: number | null }) {
  const variant = status === 'active' ? 'success' : status === 'down' || status === 'disabled' ? 'danger' : 'muted';
  return (
    <div className="min-w-[86px]"><Badge variant={variant}>{status || 'unknown'}</Badge>{!!outages && <p className="mt-1 text-xs text-rose-600">{outages} outage{outages === 1 ? '' : 's'}</p>}</div>
  );
}

async function exportCustomers(user: NonNullable<ReturnType<typeof useUser>['user']>, filters: Record<string, string>, search: string) {
  const token = await user.getIdToken();
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value !== ALL) params.set(key, value); });
  if (search) params.set('search', search);
  params.set('pageSize', '500');
  const response = await fetch(`/api/admin/bts/customers?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('Unable to export the BTS customer roster.');
  const result = await response.json();
  const records = (result.data?.records || []) as UnifiedCustomerRecord[];
  const rows = [['Tower', 'Customer', 'Email', 'Lifecycle', 'Account type', 'Plan', 'MRR', 'Device status', 'Match', 'Matched at'], ...records.map((record) => [record.btsName || '', record.customerName || '', record.email || '', record.lifecycle || '', record.accountType || '', record.servicePlan || '', getEffectiveMrr({ mrrTotal: record.mrrTotal, servicePlan: record.servicePlan }), record.uispDeviceStatus || '', record.matchState, record.matchedAt ? new Date(record.matchedAt).toISOString() : ''])];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `bts-customers-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
}

export default function BtsCustomersPage() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [region, setRegion] = useState(ALL);
  const [lifecycle, setLifecycle] = useState(ALL);
  const [accountType, setAccountType] = useState(ALL);
  const [overdue, setOverdue] = useState(ALL);
  const [page, setPage] = useState(1);

  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(search), 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => { setPage(1); }, [debouncedSearch, region, lifecycle, accountType, overdue]);

  const { records, summary, total, totalPages, loading, error } = useBtsCustomers({
    search: debouncedSearch || undefined,
    region: region !== ALL ? region : undefined,
    lifecycle: lifecycle !== ALL ? lifecycle : undefined,
    accountType: accountType !== ALL ? accountType : undefined,
    overdue: overdue !== ALL ? overdue as 'true' | 'false' : undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const coverage = summary?.total ? Math.round(((summary.matched + summary.manual) / summary.total) * 1000) / 10 : 0;
  const pendingShare = summary?.total ? Math.round((summary.pending / summary.total) * 1000) / 10 : 0;
  const effectiveMrr = useMemo(() => records.reduce((sum, record) => sum + getEffectiveMrr({ mrrTotal: record.mrrTotal, servicePlan: record.servicePlan }), 0), [records]);

  const columns = useMemo<ColumnDef<UnifiedCustomerRecord>[]>(() => [
    {
      id: 'customerName', accessorKey: 'customerName', header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
      cell: ({ row }) => <div className="min-w-[190px]"><p className="font-medium">{row.original.customerName || 'Unnamed customer'}</p><p className="max-w-[220px] truncate text-xs text-muted-foreground">{row.original.email || row.original.phone || `ID ${row.original.customerId}`}</p></div>,
    },
    {
      id: 'btsName', accessorKey: 'btsName', header: ({ column }) => <DataTableColumnHeader column={column} title="Tower" />,
      cell: ({ row }) => <div className="min-w-[140px]"><p className="font-medium">{row.original.btsName || 'Unassigned'}</p><p className="text-xs text-muted-foreground">{row.original.uispEndpointName || 'No endpoint'}</p></div>,
    },
    {
      id: 'lifecycle', accessorKey: 'lifecycle', header: ({ column }) => <DataTableColumnHeader column={column} title="Lifecycle" />,
      cell: ({ row }) => <Badge variant={lifecycleTone(row.original.lifecycle)}>{row.original.lifecycle || 'unknown'}</Badge>,
    },
    {
      id: 'accountType', accessorKey: 'accountType', header: ({ column }) => <DataTableColumnHeader column={column} title="Segment" />,
      cell: ({ row }) => <Badge variant="outline">{accountLabel(row.original.accountType || 'OTHER')}</Badge>,
    },
    {
      id: 'mrr', accessorFn: (record) => getEffectiveMrr({ mrrTotal: record.mrrTotal, servicePlan: record.servicePlan }), header: ({ column }) => <DataTableColumnHeader column={column} title="MRR" />,
      cell: ({ row }) => <span className="font-medium tabular-nums">{formatNaira(getEffectiveMrr({ mrrTotal: row.original.mrrTotal, servicePlan: row.original.servicePlan }))}</span>,
    },
    {
      id: 'device', accessorFn: (record) => record.uispDeviceStatus || 'unknown', header: ({ column }) => <DataTableColumnHeader column={column} title="Device" />,
      cell: ({ row }) => <DeviceStatus status={row.original.uispDeviceStatus} outages={row.original.uispOutageCount} />,
    },
    {
      id: 'match', accessorKey: 'matchState', header: ({ column }) => <DataTableColumnHeader column={column} title="Match" />,
      cell: ({ row }) => <div><MatchBadge state={row.original.matchState || 'pending'} />{row.original.matchScore != null && <p className="mt-1 text-xs text-muted-foreground">{Math.round(row.original.matchScore * 100)}% confidence</p>}</div>,
    },
    {
      id: 'matchedAt', accessorKey: 'matchedAt', header: ({ column }) => <DataTableColumnHeader column={column} title="Matched" />,
      cell: ({ row }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{row.original.matchedAt ? toLocalDateString(new Date(row.original.matchedAt)) : '—'}</span>,
    },
  ], []);

  const filters = { region, lifecycle, accountType, overdue };
  const filterControls = (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={region} onValueChange={setRegion}><SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Region" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All regions</SelectItem>{BTS_REGIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
      <Select value={lifecycle} onValueChange={setLifecycle}><SelectTrigger className="h-8 w-[125px] text-xs"><SelectValue placeholder="Lifecycle" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All lifecycles</SelectItem>{['active', 'blocked', 'inactive', 'churned'].map((item) => <SelectItem key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</SelectItem>)}</SelectContent></Select>
      <Select value={accountType} onValueChange={setAccountType}><SelectTrigger className="h-8 w-[135px] text-xs"><SelectValue placeholder="Segment" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All segments</SelectItem>{['ENTERPRISE', 'RETAIL', 'SME', 'RESIDENTIAL', 'PARTNERS_HOSTS', 'NEIGHBOURHOOD', 'BUNDLED', 'OTHER'].map((item) => <SelectItem key={item} value={item}>{accountLabel(item)}</SelectItem>)}</SelectContent></Select>
      <Select value={overdue} onValueChange={setOverdue}><SelectTrigger className="h-8 w-[125px] text-xs"><SelectValue placeholder="Billing" /></SelectTrigger><SelectContent><SelectItem value={ALL}>All billing</SelectItem><SelectItem value="true">Overdue</SelectItem><SelectItem value="false">Not overdue</SelectItem></SelectContent></Select>
    </div>
  );

  return (
    <SalesLayout>
      <div className="mx-auto max-w-[1600px] space-y-6">
        <PageHeader
          eyebrow="Unified customer roster"
          title="BTS customers"
          description="Splynx customers mapped to UISP towers, with lifecycle, billing, device and match-confidence context."
          actions={(
            <>
              <Button variant="outline" size="sm" asChild><a href="/admin/intelligence"><Activity />Intelligence</a></Button>
              <Button size="sm" disabled={!user} onClick={async () => {
                if (!user) return;
                try { await exportCustomers(user, filters, debouncedSearch); toast({ title: 'Customer roster exported' }); }
                catch (caught) { toast({ variant: 'destructive', title: 'Export failed', description: caught instanceof Error ? caught.message : 'Unknown error' }); }
              }}><Download />Export CSV</Button>
            </>
          )}
        />

        <StatCardGrid columns={6}>
          <StatCard label="Customers" value={(summary?.total ?? 0).toLocaleString()} detail="Current roster" icon={Users} />
          <StatCard label="Coverage" value={`${coverage}%`} detail="Matched or manual" icon={CheckCircle2} />
          <StatCard label="Matched" value={(summary?.matched ?? 0).toLocaleString()} detail="Automatic mapping" icon={Wifi} />
          <StatCard label="Manual" value={(summary?.manual ?? 0).toLocaleString()} detail="Reviewed mapping" icon={ShieldAlert} />
          <StatCard label="Pending" value={`${pendingShare}%`} detail="Needs review" icon={AlertTriangle} />
          <StatCard label="Page MRR" value={formatNaira(effectiveMrr)} detail={`${summary?.towers ?? 0} towers in view`} icon={RadioTower} />
        </StatCardGrid>

        <Alert className="border-sky-200 bg-sky-50 text-sky-950">
          <Activity />
          <AlertTitle>How roster coverage is calculated</AlertTitle>
          <AlertDescription>Coverage is matched plus manual mappings divided by the total roster. Pending customers remain in the review queue. Potential MRR includes connected services; active MRR is shown by lifecycle in the detailed audit.</AlertDescription>
        </Alert>

        <div className="space-y-3 rounded-xl border bg-card p-3 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative w-full xl:max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer, email, login or tower..." className="h-9 pl-9" /></div>
            {filterControls}
          </div>
        </div>

        {error ? <EmptyState icon={AlertTriangle} title="Customer roster unavailable" description={error} /> : (
          <DataTable
            columns={columns}
            data={records}
            initialPageSize={50}
            showPagination={false}
            loading={loading}
            maxHeight="680px"
            emptyTitle="No customers match these filters"
            emptyDescription="Clear one or more filters to widen the roster."
          />
        )}

        <div className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">Page {page} of {Math.max(totalPages, 1)} · {total.toLocaleString()} customers</p>
          <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading}><ChevronLeft />Previous</Button><Button variant="outline" size="sm" onClick={() => setPage((value) => value + 1)} disabled={page >= totalPages || loading}>Next<ChevronRight /></Button></div>
        </div>
      </div>
    </SalesLayout>
  );
}
