'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Clock, ShieldCheck, Brain, Zap, Users, TrendingUp, AlertTriangle, Target, Star } from 'lucide-react';
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

interface StaffMetricsResponse {
  success: boolean;
  data: {
    period: string;
    periodStart: number;
    periodEnd: number;
    teamAverages: {
      avgResolutionTimeHours: number;
      avgCustomerSatisfaction: number;
      avgFirstContactResolutionRate: number;
      totalTicketsAssigned: number;
      totalTicketsResolved: number;
      totalTicketsEscalated: number;
      totalSlaBreaches: number;
      totalOpenTickets: number;
    };
    staffKPIs: SupportStaffKPI[];
    calculatedAt: number;
  };
}

export default function AdminSupport() {
  const [barsAnimated, setBarsAnimated] = useState(false);
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('month');
  const [staffKPIs, setStaffKPIs] = useState<SupportStaffKPI[]>([]);
  const [teamAverages, setTeamAverages] = useState<any>(null);
  const [loadingKPIs, setLoadingKPIs] = useState(true);
  const [kpiError, setKpiError] = useState<string | null>(null);

  const auth = useAuth();
  const { user } = useUser(auth);

  const { feedbacks, loading: feedbacksLoading } = useAdminFeedbacks();

  // Fetch staff KPIs
  useEffect(() => {
    const fetchKPIs = async () => {
      if (!user) return;
      try {
        setLoadingKPIs(true);
        const token = await user.getIdToken();
        if (!token) {
          setKpiError('Not authenticated');
          return;
        }
        const response = await fetch(`/api/admin/support/staff-metrics?period=${period}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (data.success) {
          setStaffKPIs(data.data.staffKPIs || []);
          setTeamAverages(data.data.teamAverages);
        } else {
          setKpiError(data.error || 'Failed to load KPIs');
        }
      } catch (err) {
        setKpiError('Failed to load staff metrics');
      } finally {
        setLoadingKPIs(false);
      }
    };
    fetchKPIs();
  }, [period, user]);

  const stats = useMemo(() => {
    if (!feedbacks || feedbacks.length === 0) {
      return {
        professionalism: '0.0',
        clarity: '0.0',
        responsiveness: '0.0',
        knowledge: '0.0',
        friendliness: '0.0',
        fcrRate: 0,
        sentiment: { pos: 0, neu: 0, frust: 0 },
        avgResponse: '—',
      };
    }

    const supportItems = feedbacks.filter((f: FeedbackDoc) => f.category === 'Support');
    if (supportItems.length === 0) {
      return {
        professionalism: '0.0',
        clarity: '0.0',
        responsiveness: '0.0',
        knowledge: '0.0',
        friendliness: '0.0',
        fcrRate: 0,
        sentiment: { pos: 0, neu: 0, frust: 0 },
        avgResponse: '—',
      };
    }

    const totalProf = supportItems.reduce((acc, f: FeedbackDoc) => acc + Number(f.ratings?.professionalism || 0), 0);
    const totalClarity = supportItems.reduce((acc, f: FeedbackDoc) => acc + Number(f.ratings?.clarity || 0), 0);
    const totalResp = supportItems.reduce((acc, f: FeedbackDoc) => acc + Number(f.ratings?.responsiveness || 0), 0);
    const totalKnowledge = supportItems.reduce((acc, f: FeedbackDoc) => acc + Number(f.ratings?.knowledge || 0), 0);
    const totalFriendliness = supportItems.reduce((acc, f: FeedbackDoc) => acc + Number(f.ratings?.friendliness || 0), 0);
    const fcrCount = supportItems.filter((f: FeedbackDoc) => f.ratings?.fcr === 'Yes').length;

    // Derived sentiment from professionalism rating
    const pos = supportItems.filter((f: FeedbackDoc) => Number(f.ratings?.professionalism || 0) >= 4).length;
    const frust = supportItems.filter((f: FeedbackDoc) => Number(f.ratings?.professionalism || 0) <= 2).length;
    const neu = supportItems.length - pos - frust;

    // Derive avg response from responsiveness rating (1-5 mapped to minutes)
    const totalRespForTime = supportItems.reduce(
      (acc, f: FeedbackDoc) => acc + Number(f.ratings?.responsiveness || f.ratings?.professionalism || 0),
      0,
    );
    const avgRespForTime = totalRespForTime / supportItems.length;
    // Map 5=fast(8m), 1=slow(45m)
    const avgMinutes = Math.round(45 - ((avgRespForTime - 1) / 4) * 37);

    return {
      professionalism: (totalProf / supportItems.length).toFixed(1),
      clarity: (totalClarity / supportItems.length).toFixed(1),
      responsiveness: (totalResp / supportItems.length).toFixed(1),
      knowledge: (totalKnowledge / supportItems.length).toFixed(1),
      friendliness: (totalFriendliness / supportItems.length).toFixed(1),
      fcrRate: Math.round((fcrCount / supportItems.length) * 100),
      sentiment: {
        pos: Math.round((pos / supportItems.length) * 100),
        neu: Math.round((neu / supportItems.length) * 100),
        frust: Math.round((frust / supportItems.length) * 100),
      },
      avgResponse: `${avgMinutes}m`,
    };
  }, [feedbacks]);

  // Derived trend data from recent feedbacks
  const volumeData = useMemo(() => {
    if (!feedbacks || feedbacks.length === 0) return [];
    const supportItems = feedbacks.filter((f: FeedbackDoc) => f.category === 'Support');

    const groups: Record<string, { name: string; tickets: number; timestamp: number }> = {};

    supportItems.forEach((f: FeedbackDoc) => {
      const date = new Date(f.timestamp ?? 0);
      const label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      if (!groups[label]) {
        groups[label] = {
          name: label,
          tickets: 0,
          timestamp: f.timestamp ?? 0,
        };
      }
      groups[label].tickets += 1;
    });

    return Object.values(groups)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(({ name, tickets }) => ({
        date: name,
        tickets,
      }));
  }, [feedbacks]);

  const dimensionData = useMemo(() => {
    return [
      { name: 'Helpfulness', score: Number(stats.professionalism) },
      { name: 'Clarity', score: Number(stats.clarity) },
      { name: 'Response Speed', score: Number(stats.responsiveness) },
      { name: 'Agent Knowledge', score: Number(stats.knowledge) },
      { name: 'Friendliness', score: Number(stats.friendliness) },
    ];
  }, [stats]);

  const backendStaff = useMemo(() => staffKPIs.filter((kpi) => kpi.role === 'Back-end Support'), [staffKPIs]);

  const frontendStaff = useMemo(
    () => staffKPIs.filter((kpi) => kpi.role === 'Support Agent' || kpi.role === 'Front-end Support'),
    [staffKPIs],
  );

  useEffect(() => {
    const timer = setTimeout(() => setBarsAnimated(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const formatHours = (hours: number) => {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  };

  const getStatusColor = (rate: number) => {
    if (rate >= 90) return 'text-green-600 bg-green-50';
    if (rate >= 75) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getTrendIcon = (value: number | null) => {
    if (value === null || value === 0) return <span className="text-slate-400">—</span>;
    if (value > 0) return <TrendingUp className="w-4 h-4 text-green-600" />;
    return <TrendingUp className="w-4 h-4 text-red-600 rotate-180" />;
  };

  return (
    <AdminLayout>
      <div className="mb-12">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display text-3xl md:text-display-lg text-primary tracking-tight mb-2">Support Overview</h1>
            <p className="text-on-surface-variant mt-2 max-w-2xl font-body-md">
              Performance and satisfaction ratings for our support team.
            </p>
          </div>
          <div className="flex gap-2">
            {['week', 'month', 'quarter'].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p as 'week' | 'month' | 'quarter')}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  period === p
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-surface-container text-on-surface hover:bg-surface-container-high',
                )}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Team Overview Cards */}
        {teamAverages && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-gutter mb-12">
            <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
              <Users className="w-8 h-8 text-secondary mb-4" />
              <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Team Size</p>
              <h3 className="font-mono text-3xl font-black mt-2">{staffKPIs.length}</h3>
              <div className="flex items-center gap-1 mt-4 text-green-600 font-bold text-[9px]">
                <TrendingUp className="w-3.5 h-3.5" /> Active
              </div>
            </div>

            <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
              <TrendingUp className="w-8 h-8 text-secondary mb-4" />
              <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Total Assigned</p>
              <h3 className="font-mono text-3xl font-black mt-2">{teamAverages.totalTicketsAssigned}</h3>
              <p className="text-on-surface-variant mt-2 text-[10px]">This period</p>
            </div>

            <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
              <ShieldCheck className="w-8 h-8 text-secondary mb-4" />
              <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Resolved</p>
              <h3 className="font-mono text-3xl font-black mt-2">{teamAverages.totalTicketsResolved}</h3>
              <p className="text-on-surface-variant mt-2 text-[10px]">Completed tickets</p>
            </div>

            <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
              <Target className="w-8 h-8 text-secondary mb-4" />
              <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">SLA Compliance</p>
              <h3 className="font-mono text-3xl font-black mt-2">
                {staffKPIs.length > 0
                  ? Math.round(staffKPIs.reduce((sum, k) => sum + k.slaComplianceRate, 0) / staffKPIs.length).toFixed(1)
                  : '—'}
                %
              </h3>
              <p className="text-on-surface-variant mt-2 text-[10px]">Team average</p>
            </div>

            <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
              <Star className="w-8 h-8 text-secondary mb-4" />
              <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">CSAT Score</p>
              <h3 className="font-mono text-3xl font-black mt-2">{teamAverages.avgCustomerSatisfaction || '—'}/5</h3>
              <p className="text-on-surface-variant mt-2 text-[10px]">Customer satisfaction</p>
            </div>

            <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
              <Zap className="w-8 h-8 text-secondary mb-4" />
              <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">First-Time Fix</p>
              <h3 className="font-mono text-3xl font-black mt-2">
                {staffKPIs.length > 0
                  ? (staffKPIs.reduce((sum, k) => sum + k.firstContactResolutionRate, 0) / staffKPIs.length).toFixed(1) + '%'
                  : '—'}
              </h3>
              <div className="w-full bg-muted h-1 rounded-full mt-6">
                <div
                  className="bg-secondary h-1 rounded-full transition-all duration-1000"
                  style={{
                    width: `${staffKPIs.length > 0 ? staffKPIs.reduce((sum, k) => sum + k.firstContactResolutionRate, 0) / staffKPIs.length : 0}%`,
                  }}
                ></div>
              </div>
            </div>

            <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
              <AlertTriangle className="w-8 h-8 text-destructive mb-4" />
              <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Open Tickets</p>
              <h3 className="font-mono text-3xl font-black mt-2">{teamAverages.totalOpenTickets}</h3>
              <p className="text-on-surface-variant mt-2 text-[10px]">Currently open</p>
            </div>

            <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
              <Clock className="w-8 h-8 text-secondary mb-4" />
              <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Avg Resolution</p>
              <h3 className="font-mono text-3xl font-black mt-2">
                {teamAverages.avgResolutionTime ? `${teamAverages.avgResolutionTime.toFixed(1)}h` : '—'}
              </h3>
              <p className="text-on-surface-variant mt-2 text-[10px]">Avg resolution time</p>
            </div>
          </div>
        )}

        {/* Backend Support Staff KPIs */}
        {backendStaff.length > 0 && (
          <div className="mb-12">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
              <h2 className="font-display text-2xl text-primary font-bold">Backend Support Staff KPIs</h2>
              <div className="flex gap-2">
                <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                  Backend Support ({backendStaff.length})
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">Staff</th>
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant text-right">
                      Assigned
                    </th>
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant text-right">
                      Resolved
                    </th>
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant text-right">
                      Resolution
                    </th>
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant text-right">SLA %</th>
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant text-right">FCR %</th>
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant text-right">CSAT</th>
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant text-right">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {backendStaff.map((kpi) => (
                    <tr key={kpi.staffId} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="font-medium text-on-surface">{kpi.staffName}</div>
                        <div className="text-[10px] text-on-surface-variant capitalize">{kpi.role}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-on-surface">{kpi.ticketsAssigned}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-green-600 font-medium">{kpi.ticketsResolved}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-on-surface-variant">
                        {kpi.avgResolutionTimeHours < 1
                          ? `${Math.round(kpi.avgResolutionTimeHours * 60)}m`
                          : `${kpi.avgResolutionTimeHours.toFixed(1)}h`}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn('px-2 py-0.5 rounded-full text-[9px] font-medium', getStatusColor(kpi.slaComplianceRate))}>
                          {kpi.slaComplianceRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-on-surface">
                        {kpi.firstContactResolutionRate.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-on-surface">{kpi.avgCustomerSatisfaction.toFixed(1)}/5</td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-on-surface-variant">{kpi.currentOpenTickets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Detailed Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
              {backendStaff.map((kpi) => (
                <div key={kpi.staffId} className="bg-white p-5 border border-border whisper-shadow rounded-xl">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center">
                      <Users className="w-5 h-5 text-on-surface-variant" />
                    </div>
                    <div>
                      <div className="font-semibold text-on-surface">{kpi.staffName}</div>
                      <div className="text-[10px] text-on-surface-variant capitalize">{kpi.role}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg border border-border/50">
                      <div className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">Resolution Time</div>
                      <div className="font-mono text-lg font-bold text-on-surface">
                        {kpi.avgResolutionTimeHours < 1
                          ? `${Math.round(kpi.avgResolutionTimeHours * 60)}m`
                          : `${kpi.avgResolutionTimeHours.toFixed(1)}h`}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg border border-border/50">
                      <div className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">SLA Compliance</div>
                      <div className="font-mono text-lg font-bold text-on-surface">{kpi.slaComplianceRate.toFixed(1)}%</div>
                    </div>
                    <div className="p-3 rounded-lg border border-border/50">
                      <div className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">FCR Rate</div>
                      <div className="font-mono text-lg font-bold text-on-surface">{kpi.firstContactResolutionRate.toFixed(1)}%</div>
                    </div>
                    <div className="p-3 rounded-lg border border-border/50">
                      <div className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">Open Tickets</div>
                      <div className="font-mono text-lg font-bold text-on-surface">{kpi.currentOpenTickets}</div>
                    </div>
                    <div className="p-3 rounded-lg border border-border/50 col-span-2">
                      <div className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">Daily Avg Tickets</div>
                      <div className="font-mono text-lg font-bold text-on-surface">{kpi.avgDailyTickets.toFixed(1)}</div>
                    </div>
                    <div className="p-3 rounded-lg border border-border/50 col-span-2">
                      <div className="font-mono text-[10px] text-on-surface-variant uppercase tracking-wider">SLA Breaches</div>
                      <div className="font-mono text-lg font-bold text-on-surface">{kpi.slaBreaches}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Frontend Support Staff KPIs */}
        {frontendStaff.length > 0 && (
          <div className="mb-12">
            <h2 className="font-display text-2xl text-primary font-bold mb-8 flex items-center gap-3">
              <Users className="w-6 h-6 text-secondary" />
              Frontend Support Staff KPIs
              <span className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
                Frontend Support ({frontendStaff.length})
              </span>
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">Staff</th>
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant text-right">
                      Assigned
                    </th>
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant text-right">
                      Resolved
                    </th>
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant text-right">
                      Resolution
                    </th>
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant text-right">SLA %</th>
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant text-right">FCR %</th>
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant text-right">CSAT</th>
                    <th className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant text-right">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {frontendStaff.map((kpi) => (
                    <tr key={kpi.staffId} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="font-medium text-on-surface">{kpi.staffName}</div>
                        <div className="text-[10px] text-on-surface-variant capitalize">{kpi.role}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-on-surface">{kpi.ticketsAssigned}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-green-600 font-medium">{kpi.ticketsResolved}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-on-surface-variant">
                        {kpi.avgResolutionTimeHours < 1
                          ? `${Math.round(kpi.avgResolutionTimeHours * 60)}m`
                          : `${kpi.avgResolutionTimeHours.toFixed(1)}h`}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn('px-2 py-0.5 rounded-full text-[9px] font-medium', getStatusColor(kpi.slaComplianceRate))}>
                          {kpi.slaComplianceRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-on-surface">
                        {kpi.firstContactResolutionRate.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-on-surface">{kpi.avgCustomerSatisfaction.toFixed(1)}/5</td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-on-surface-variant">{kpi.currentOpenTickets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {loadingKPIs && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        )}

        {kpiError && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-xl mb-8">
            <p className="font-medium">Failed to load staff KPIs</p>
            <p className="text-sm mt-1">{kpiError}</p>
          </div>
        )}

        {/* Original Support Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-gutter mb-12">
          <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
            <Clock className="w-8 h-8 text-secondary mb-4" />
            <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Avg Response</p>
            <h3 className="font-mono text-3xl font-black mt-2">{stats.avgResponse}</h3>
            <div className="flex items-center gap-1 mt-4 text-green-600 font-bold text-[9px]">
              <Zap className="w-3.5 h-3.5" /> Estimated time
            </div>
          </div>

          <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
            <ShieldCheck className="w-8 h-8 text-secondary mb-4" />
            <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Helpfulness</p>
            <h3 className="font-mono text-3xl font-black mt-2">{stats.professionalism}/5</h3>
            <p className="text-on-surface-variant mt-2 text-[10px]">Staff helpfulness</p>
          </div>

          <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
            <Zap className="w-8 h-8 text-secondary mb-4" />
            <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Clarity Score</p>
            <h3 className="font-mono text-3xl font-black mt-2">{stats.clarity}/5</h3>
            <p className="text-on-surface-variant mt-2 text-[10px]">Explanation quality</p>
          </div>

          <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
            <Clock className="w-8 h-8 text-secondary mb-4" />
            <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Response Speed</p>
            <h3 className="font-mono text-3xl font-black mt-2">{stats.responsiveness}/5</h3>
            <p className="text-on-surface-variant mt-2 text-[10px]">Response speed</p>
          </div>

          <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
            <Brain className="w-8 h-8 text-secondary mb-4" />
            <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Staff Knowledge</p>
            <h3 className="font-mono text-3xl font-black mt-2">{stats.knowledge}/5</h3>
            <p className="text-on-surface-variant mt-2 text-[10px]">Knowledge rating</p>
          </div>

          <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
            <ShieldCheck className="w-8 h-8 text-secondary mb-4" />
            <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">Friendliness</p>
            <h3 className="font-mono text-3xl font-black mt-2">{stats.friendliness}/5</h3>
            <p className="text-on-surface-variant mt-2 text-[10px]">Friendliness rating</p>
          </div>

          <div className="bg-white p-6 border border-border whisper-shadow rounded-xl">
            <Brain className="w-8 h-8 text-secondary mb-4" />
            <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">First-Time Fix Rate</p>
            <h3 className="font-mono text-3xl font-black mt-2">{stats.fcrRate}%</h3>
            <div className="w-full bg-muted h-1 rounded-full mt-6">
              <div className="bg-secondary h-1 rounded-full transition-all duration-1000" style={{ width: `${stats.fcrRate}%` }}></div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-gutter mb-24">
          <div className="col-span-12 bg-white p-8 border border-border whisper-shadow rounded-xl h-[400px] flex flex-col mb-6">
            <h4 className="font-display text-xl text-primary font-bold mb-10">Requests Over Time</h4>
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

          <div className="col-span-12 lg:col-span-6 bg-white p-8 border border-border whisper-shadow rounded-xl h-[400px] flex flex-col">
            <h4 className="font-display text-xl text-primary font-bold mb-6">Response Quality</h4>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dimensionData} layout="vertical" margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
                  <XAxis type="number" domain={[0, 5]} axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fontWeight: 'bold' }}
                    width={110}
                  />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                  <Bar dataKey="score" fill="#448515" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-6 bg-white p-8 border border-border whisper-shadow rounded-xl h-[400px] flex flex-col">
            <h4 className="font-display text-xl mb-8 text-primary font-bold">Customer Sentiment</h4>
            <div className="space-y-6 flex-1 flex flex-col justify-center">
              {[
                { label: 'Positive', val: stats.sentiment.pos, color: 'bg-secondary' },
                { label: 'Neutral', val: stats.sentiment.neu, color: 'bg-slate-400' },
                { label: 'Frustrated', val: stats.sentiment.frust, color: 'bg-destructive' },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between mb-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider">{item.label}</span>
                    <span className="font-bold text-xs">{item.val}%</span>
                  </div>
                  <div className="w-full bg-muted h-3 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full transition-all duration-1000', item.color)}
                      style={{ width: barsAnimated ? `${item.val}%` : '0%' }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
