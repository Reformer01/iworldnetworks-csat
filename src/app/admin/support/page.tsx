'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Clock, ShieldCheck, Brain, Zap, Users, TrendingUp, AlertTriangle, Target, Star, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth, useUser } from '@/firebase';
import { useAdminFeedbacks } from '@/hooks/use-admin-feedbacks';
import type { FeedbackDoc } from '@/lib/feedback-types';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketStatus, setTicketStatus] = useState<'all' | 'open' | 'closed'>('all');
  const [ticketAssignee, setTicketAssignee] = useState<string>('');
  const [ticketPage, setTicketPage] = useState(1);
  const [workload, setWorkload] = useState<Array<{ assignee: string | null; name: string; open: number; total: number; pctOpen: number }>>([]);
  const [workloadTotalOpen, setWorkloadTotalOpen] = useState(0);
  const ticketsRef = useRef<HTMLDivElement>(null);
  const [tickets, setTickets] = useState<Array<{
    id?: string; ticketNumber: number; customerName: string; customerEmail?: string;
    description: string; status: string; priority?: number | null; assignedTo?: string;
    assignedToName?: string; createdAt: number; resolvedAt?: number; slaBreached: boolean;
    location: string; bts?: string; complaintType: string; resolutionNotes?: string;
  }>>([]);
  const [ticketsTotal, setTicketsTotal] = useState(0);
  const [ticketsPages, setTicketsPages] = useState(1);
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
    if (support.length === 0) return { professionalism: '0', clarity: '0', responsiveness: '0', knowledge: '0', friendliness: '0', fcrRate: 0, sentiment: { pos: 0, neu: 0, frust: 0 }, avgResponse: '—' };
    const avg = (key: string) => (support.reduce((a, f) => a + Number(f.ratings?.[key] || 0), 0) / support.length).toFixed(1);
    const fcrCount = support.filter((f) => f.ratings?.fcr === 'Yes').length;
    const pos = support.filter((f) => Number(f.ratings?.professionalism || 0) >= 4).length;
    const frust = support.filter((f) => Number(f.ratings?.professionalism || 0) <= 2).length;
    return {
      professionalism: avg('professionalism'), clarity: avg('clarity'), responsiveness: avg('responsiveness'),
      knowledge: avg('knowledge'), friendliness: avg('friendliness'),
      fcrRate: Math.round((fcrCount / support.length) * 100),
      sentiment: { pos: Math.round((pos / support.length) * 100), neu: Math.round(((support.length - pos - frust) / support.length) * 100), frust: Math.round((frust / support.length) * 100) },
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
    return Object.values(groups).sort((a, b) => a.ts - b.ts).map(({ name, tickets }) => ({ date: name, tickets }));
  }, [feedbacks]);

  const dimensionData = useMemo(() => [
    { name: 'Helpfulness', score: Number(stats.professionalism) },
    { name: 'Clarity', score: Number(stats.clarity) },
    { name: 'Response Speed', score: Number(stats.responsiveness) },
    { name: 'Agent Knowledge', score: Number(stats.knowledge) },
    { name: 'Friendliness', score: Number(stats.friendliness) },
  ], [stats]);

  const filteredStaff = useMemo(() => {
    if (activeTab === 'backend') return staffKPIs.filter((k) => k.role === 'Back-end Support');
    if (activeTab === 'frontend') return staffKPIs.filter((k) => k.role === 'Support Agent' || k.role === 'Front-end Support');
    return staffKPIs;
  }, [staffKPIs, activeTab]);

  useEffect(() => {
    setTicketPage(1);
  }, [ticketSearch, ticketStatus, ticketAssignee]);

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
          page: String(ticketPage),
          pageSize: '20',
          ...(ticketStatus !== 'all' ? { status: ticketStatus } : {}),
          ...(ticketAssignee ? { assignedTo: ticketAssignee } : {}),
          ...(ticketSearch.trim() ? { search: ticketSearch.trim() } : {}),
        });
        const res = await fetch(`/api/admin/tickets?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
          setTickets(data.data?.tickets || []);
          setTicketsTotal(data.data?.total || 0);
          setTicketsPages(Math.max(1, data.data?.totalPages || 1));
        }
      } catch {
        /* keep previous list on transient failure */
      } finally {
        setTicketsLoading(false);
      }
    }, 400);
    return () => clearTimeout(id);
  }, [user, ticketPage, ticketSearch, ticketStatus, ticketAssignee]);

  const avgSLA = staffKPIs.length > 0 ? Math.round(staffKPIs.reduce((s, k) => s + k.slaComplianceRate, 0) / staffKPIs.length) : 0;
  const avgFCR = staffKPIs.length > 0 ? (staffKPIs.reduce((s, k) => s + k.firstContactResolutionRate, 0) / staffKPIs.length).toFixed(1) : '—';

  const isLoading = loadingKPIs || feedbacksLoading;

  return (
    <AdminLayout>
      <div className="max-w-screen-2xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-primary uppercase tracking-tight">Support Overview</h1>
            <p className="font-mono text-[10px] uppercase tracking-widest font-bold mt-1 text-on-surface-variant/60">
              Performance & satisfaction ratings for the support team
            </p>
          </div>
          <div className="flex gap-1.5">
            {(['week', 'month', 'quarter'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  'px-3 py-1.5 rounded-full font-mono text-[10px] uppercase font-bold transition-colors',
                  period === p ? 'bg-secondary text-white' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-secondary" />
          </div>
        )}

        {/* Error */}
        {kpiError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 font-mono text-xs">
            {kpiError}
          </div>
        )}

        {!isLoading && (
          <>
            {/* Section 1: Team Summary — 1 unified card with 6 metrics */}
            <div className="bg-white p-6 md:p-8 rounded-2xl whisper-shadow border border-border mb-6">
              <h2 className="font-display font-bold text-sm uppercase text-primary mb-4">Team Summary</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-4">
                <MetricCell icon={Users} label="Team Size" value={String(staffKPIs.length)} />
                <MetricCell icon={TrendingUp} label="Assigned" value={String(teamAverages?.totalTicketsAssigned ?? 0)} />
                <MetricCell icon={ShieldCheck} label="Resolved" value={String(teamAverages?.totalTicketsResolved ?? 0)} />
                <MetricCell icon={Target} label="SLA Compliance" value={`${avgSLA}%`} />
                <MetricCell icon={Star} label="CSAT Score" value={`${teamAverages?.avgCustomerSatisfaction ?? '—'}/5`} />
                <MetricCell icon={Clock} label="Avg Resolution" value={teamAverages?.avgResolutionTimeHours ? formatHours(teamAverages.avgResolutionTimeHours) : '—'} />
              </div>
              {/* Progress bar for First-Time Fix */}
              <div className="mt-4 pt-4 border-t border-border/50">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/50">First-Time Fix Rate</span>
                  <span className="font-mono text-[11px] font-bold text-primary">{avgFCR}%</span>
                </div>
                <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div className="h-full bg-secondary rounded-full" style={{ width: `${avgFCR}%` }} />
                </div>
              </div>
            </div>

            {/* Section 2: Charts — above the fold */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
              <div className="lg:col-span-12 bg-white p-6 rounded-2xl whisper-shadow border border-border h-[320px] flex flex-col">
                <h3 className="font-display font-bold text-sm uppercase text-primary mb-4">Requests Over Time</h3>
                <div className="flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={volumeData}>
                      <defs>
                        <linearGradient id="colorTickets" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#448515" stopOpacity={0.1} />
                          <stop offset="95%" stopColor="#448515" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                      <Area type="monotone" dataKey="tickets" stroke="#448515" fill="url(#colorTickets)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-6 bg-white p-6 rounded-2xl whisper-shadow border border-border h-[320px] flex flex-col">
                <h3 className="font-display font-bold text-sm uppercase text-primary mb-4">Response Quality</h3>
                <div className="flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dimensionData} layout="vertical" margin={{ left: 20, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
                      <XAxis type="number" domain={[0, 5]} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} width={110} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                      <Bar dataKey="score" fill="#448515" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-6 bg-white p-6 rounded-2xl whisper-shadow border border-border h-[320px] flex flex-col">
                <h3 className="font-display font-bold text-sm uppercase text-primary mb-4">Customer Sentiment</h3>
                <div className="space-y-4 flex-1 flex flex-col justify-center">
                  {[
                    { label: 'Positive', val: stats.sentiment.pos, color: 'bg-emerald-500' },
                    { label: 'Neutral', val: stats.sentiment.neu, color: 'bg-zinc-400' },
                    { label: 'Frustrated', val: stats.sentiment.frust, color: 'bg-red-500' },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="flex justify-between mb-1">
                        <span className="font-mono text-[10px] uppercase tracking-wider font-bold text-on-surface-variant/70">{item.label}</span>
                        <span className="font-mono text-[11px] font-bold text-primary">{item.val}%</span>
                      </div>
                      <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all duration-700', item.color)} style={{ width: `${item.val}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Section 3: Staff Performance — single tabbed table */}
            <div className="bg-white p-6 rounded-2xl whisper-shadow border border-border mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h2 className="font-display font-bold text-sm uppercase text-primary">Staff Performance</h2>
                <div className="flex gap-1">
                  {([
                    { id: 'all' as Tab, label: 'All', count: staffKPIs.length },
                    { id: 'backend' as Tab, label: 'Backend', count: staffKPIs.filter((k) => k.role === 'Back-end Support').length },
                    { id: 'frontend' as Tab, label: 'Frontend', count: staffKPIs.filter((k) => k.role === 'Support Agent' || k.role === 'Front-end Support').length },
                  ]).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        'px-3 py-1 rounded-full font-mono text-[10px] uppercase font-bold transition-colors',
                        activeTab === tab.id ? 'bg-secondary text-white' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                      )}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>
              </div>

              {filteredStaff.length === 0 ? (
                <p className="font-mono text-[10px] text-on-surface-variant/40 text-center py-8">No staff data for this period</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left" aria-label="Staff performance table">
                    <thead>
                      <tr className="border-b border-border">
                        <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60">Staff</th>
                        <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60 text-right">Assigned</th>
                        <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60 text-right">Resolved</th>
                        <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60 text-right">Resolution</th>
                        <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60 text-right">SLA %</th>
                        <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60 text-right">FCR %</th>
                        <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60 text-right">CSAT</th>
                        <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60 text-right">Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStaff.map((kpi) => (
                        <tr key={kpi.staffId} className="border-b border-border/50 hover:bg-surface-container-low/50 transition-colors">
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => filterByAssignee(kpi.staffId)}
                              className="text-left hover:underline"
                              title={`Show ${kpi.staffName}'s tickets`}
                            >
                              <p className="font-mono text-xs font-bold text-primary">{kpi.staffName}</p>
                              <p className="font-mono text-[9px] text-on-surface-variant/50 capitalize">{kpi.role}</p>
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-on-surface-variant">{kpi.ticketsAssigned}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs font-bold text-primary">{kpi.ticketsResolved}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-on-surface-variant">{formatHours(kpi.avgResolutionTimeHours)}</td>
                          <td className="px-3 py-2.5 text-right">
                            <span className={cn('text-[9px] font-mono font-bold', getStatusColor(kpi.slaComplianceRate))}>
                              {kpi.slaComplianceRate.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-on-surface-variant">{kpi.firstContactResolutionRate.toFixed(1)}%</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-on-surface-variant">{kpi.avgCustomerSatisfaction.toFixed(1)}/5</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-on-surface-variant">{kpi.currentOpenTickets}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Section 4: Workload — open tickets per assignee (mirrors Splynx) */}
            <div className="bg-white p-6 rounded-2xl whisper-shadow border border-border mb-6">
              <h2 className="font-display font-bold text-sm uppercase text-primary mb-1">Workload by Assignee</h2>
              <p className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant/50 font-bold mb-4">
                Open tickets{workloadTotalOpen > 0 ? ` · ${workloadTotalOpen} total` : ''} — click a row to filter the list below
              </p>
              {workload.length === 0 ? (
                <p className="font-mono text-[10px] text-on-surface-variant/40 text-center py-4">No workload data</p>
              ) : (
                <div className="overflow-x-auto -mx-1 px-1">
                  <table className="w-full min-w-[520px] text-left" aria-label="Workload by assignee">
                    <thead>
                      <tr className="border-b border-border">
                        <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60">Assignee</th>
                        <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60 text-right">Open</th>
                        <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60 text-right">% of open</th>
                        <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workload.map((w) => (
                        <tr
                          key={w.assignee ?? '__unassigned__'}
                          onClick={() => filterByAssignee(w.assignee)}
                          className="border-b border-border/50 hover:bg-surface-container-low/50 transition-colors cursor-pointer"
                          title={`Show ${w.name}'s tickets`}
                        >
                          <td className="px-3 py-2.5 font-mono text-xs font-bold text-primary">{w.name}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs font-bold">{w.open}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-on-surface-variant">{w.pctOpen}%</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-on-surface-variant/60">{w.total.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Section 5: Tickets — searchable list with detail view */}
            <div ref={ticketsRef} className="bg-white p-6 rounded-2xl whisper-shadow border border-border mb-6 scroll-mt-20">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <h2 className="font-display font-bold text-sm uppercase text-primary">
                  Tickets {ticketsTotal > 0 && <span className="text-on-surface-variant/50">({ticketsTotal.toLocaleString()})</span>}
                </h2>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={ticketSearch}
                    onChange={(e) => setTicketSearch(e.target.value)}
                    placeholder="Search name, email, ticket #..."
                    className="px-4 py-2 rounded-full border border-border bg-background font-mono text-xs min-w-0 sm:w-56"
                    aria-label="Search tickets"
                  />
                  <select
                    value={ticketAssignee}
                    onChange={(e) => setTicketAssignee(e.target.value)}
                    className="px-4 py-2 rounded-full border border-border bg-background font-mono text-[10px] uppercase font-bold text-on-surface-variant min-w-0 sm:max-w-56"
                    aria-label="Filter by assignee"
                  >
                    <option value="">All assignees</option>
                    <option value="__unassigned__">Unassigned</option>
                    {workload
                      .filter((w) => w.assignee !== null)
                      .map((w) => (
                        <option key={w.assignee as string} value={w.assignee as string}>
                          {w.name} ({w.open} open)
                        </option>
                      ))}
                  </select>
                  {ticketAssignee && (
                    <button
                      onClick={() => setTicketAssignee('')}
                      className="px-3 py-2 rounded-full border border-border font-mono text-[10px] uppercase font-bold text-secondary hover:bg-surface-container-low transition-colors whitespace-nowrap"
                      title="Clear assignee filter"
                    >
                      ✕ {ticketAssignee === '__unassigned__' ? 'Unassigned' : (workload.find((w) => w.assignee === ticketAssignee)?.name ?? ticketAssignee)}
                    </button>
                  )}
                  <div className="flex gap-1">
                    {(['all', 'open', 'closed'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setTicketStatus(s)}
                        className={cn(
                          'px-3 py-2 rounded-full font-mono text-[10px] uppercase font-bold transition-colors',
                          ticketStatus === s ? 'bg-secondary text-white' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full min-w-[860px] text-left" aria-label="Tickets table">
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60">#</th>
                      <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60">Customer</th>
                      <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60">Subject</th>
                      <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60">Status</th>
                      <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60 text-right">Priority</th>
                      <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60">Assigned</th>
                      <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60 text-right">Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((t) => (
                      <tr
                        key={t.id ?? t.ticketNumber}
                        onClick={() => setSelectedTicket(t)}
                        className="border-b border-border/50 hover:bg-surface-container-low/50 transition-colors cursor-pointer"
                      >
                        <td className="px-3 py-2.5 font-mono text-xs font-bold text-primary whitespace-nowrap">#{t.ticketNumber}</td>
                        <td className="px-3 py-2.5">
                          <p className="font-bold text-primary text-sm whitespace-nowrap">{t.customerName || '—'}</p>
                          <p className="font-mono text-[10px] text-on-surface-variant/60 truncate max-w-[200px]">{t.customerEmail || ''}</p>
                        </td>
                        <td className="px-3 py-2.5 text-sm text-on-surface-variant max-w-[280px] truncate" title={t.description}>{t.description || '—'}</td>
                        <td className="px-3 py-2.5">
                          <span className={cn(
                            'text-[10px] font-bold font-mono whitespace-nowrap',
                            t.status === 'closed' ? 'text-green-700' : 'text-amber-700'
                          )}>
                            {t.status}
                          </span>
                          {t.slaBreached && (
                            <span className="ml-1 text-[10px] font-bold font-mono whitespace-nowrap text-red-600" title="Unresolved past the 1.5h SLA">
                              SLA
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs font-bold whitespace-nowrap">{priorityLabel(t.priority)}</td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-on-surface-variant whitespace-nowrap" title={t.assignedTo || ''}>{t.assignedToName || t.assignedTo || 'Unassigned'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-[11px] text-on-surface-variant whitespace-nowrap">{relTime(t.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ticketsLoading && (
                <p className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant/50 text-center py-4">Loading tickets…</p>
              )}
              {!ticketsLoading && tickets.length === 0 && (
                <p className="font-mono text-[10px] text-on-surface-variant/40 text-center py-8">No tickets match the current filters</p>
              )}
              {ticketsPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <span className="font-mono text-[10px] uppercase tracking-widest opacity-60 font-bold">
                    Page {ticketPage} of {ticketsPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={ticketPage <= 1}
                      onClick={() => setTicketPage((p) => Math.max(1, p - 1))}
                      className="px-4 py-2 rounded-xl border border-border font-mono text-[10px] uppercase font-bold text-on-surface-variant hover:bg-surface-container-low transition-colors disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <button
                      disabled={ticketPage >= ticketsPages}
                      onClick={() => setTicketPage((p) => p + 1)}
                      className="px-4 py-2 rounded-xl border border-border font-mono text-[10px] uppercase font-bold text-on-surface-variant hover:bg-surface-container-low transition-colors disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>

            {selectedTicket && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={() => setSelectedTicket(null)} role="dialog" aria-modal="true" aria-label={`Ticket ${selectedTicket.ticketNumber}`}>
                <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant/50 font-bold">Ticket #{selectedTicket.ticketNumber}</p>
                      <h3 className="font-display font-bold text-lg text-primary">{selectedTicket.customerName || 'Unknown customer'}</h3>
                    </div>
                    <button onClick={() => setSelectedTicket(null)} className="font-mono text-[10px] uppercase font-bold text-on-surface-variant hover:text-primary px-3 py-1.5" aria-label="Close ticket details">
                      Close
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    <span className={cn(
                      'text-[10px] font-bold font-mono',
                      selectedTicket.status === 'closed' ? 'text-green-700' : 'text-amber-700'
                    )}>
                      {selectedTicket.status}
                    </span>
                    <span className="text-[10px] font-bold font-mono text-zinc-600">
                      {priorityLabel(selectedTicket.priority)} priority
                    </span>
                    {selectedTicket.slaBreached && (
                      <span className="text-[10px] font-bold font-mono text-red-600">SLA breached (1.5h)</span>
                    )}
                  </div>
                  <p className="text-sm text-on-surface-variant whitespace-pre-wrap mb-4">{selectedTicket.description || 'No description.'}</p>
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
                  <p className="font-mono text-[10px] text-on-surface-variant/40 mt-4">Synced from Splynx — edit status and assignment there.</p>
                </div>
              </div>
            )}

            {/* Section 5: Feedback Ratings — compact single card */}
            <div className="bg-white p-6 rounded-2xl whisper-shadow border border-border mb-6">
              <h2 className="font-display font-bold text-sm uppercase text-primary mb-4">Feedback Ratings</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-4">
                <RatingCell label="Helpfulness" value={stats.professionalism} />
                <RatingCell label="Clarity" value={stats.clarity} />
                <RatingCell label="Response Speed" value={stats.responsiveness} />
                <RatingCell label="Knowledge" value={stats.knowledge} />
                <RatingCell label="Friendliness" value={stats.friendliness} />
                <RatingCell label="First-Time Fix" value={`${stats.fcrRate}%`} />
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

/* ---- Small sub-components ---- */

function MetricCell({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-secondary shrink-0" />
      <div className="min-w-0">
        <p className="font-mono text-[8px] uppercase tracking-widest font-bold text-on-surface-variant/50">{label}</p>
        <p className="font-mono text-base xl:text-lg font-bold break-words text-primary" title={value}>{value}</p>
      </div>
    </div>
  );
}

function RatingCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="font-mono text-[8px] uppercase tracking-widest font-bold text-on-surface-variant/50 mb-1">{label}</p>
      <p className="font-mono text-xl font-bold text-primary">{value}</p>
      <p className="font-mono text-[8px] text-on-surface-variant/30">/5</p>
    </div>
  );
}
