'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth, useUser } from '@/firebase';
import { cn } from '@/lib/utils';
import { Loader2, Mail, MousePointerClick, Eye, TrendingUp, BarChart3, Smartphone, ExternalLink } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface CampaignAnalytics {
  overall: {
    totalSent: number;
    totalOpens: number;
    totalClicks: number;
    openRate: number;
    clickRate: number;
    uniqueOpens: number;
    uniqueClicks: number;
  };
  byCampaign: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    subject: string;
    sentAt: number | null;
    createdAt: number;
    sent: number;
    opens: number;
    clicks: number;
    uniqueOpens: number;
    uniqueClicks: number;
    openRate: number;
    clickRate: number;
  }>;
  topLinks: Array<{ url: string; clicks: number }>;
  timeline: Array<{ date: string; opens: number; clicks: number }>;
  devices: Array<{ name: string; count: number }>;
}

const PIE_COLORS = ['#448515', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

function fmtDate(ms: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function MetricCard({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white p-5 rounded-2xl whisper-shadow border border-border">
      <div className="flex items-center gap-3 mb-2">
        <div className={cn('w-9 h-9 rounded-full flex items-center justify-center', color || 'bg-secondary/10')}>
          <Icon className={cn('w-4 h-4', color ? 'text-white' : 'text-secondary')} />
        </div>
        <p className="font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60">{label}</p>
      </div>
      <p className="font-mono text-2xl font-bold text-primary">{value}</p>
      {sub && <p className="font-mono text-[9px] text-on-surface-variant/40 mt-1">{sub}</p>}
    </div>
  );
}

export function AnalyticsTab() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [data, setData] = useState<CampaignAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/campaigns/analytics', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load analytics');
      const json = await res.json();
      setData(json.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading analytics');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-secondary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="font-mono text-xs text-red-500">{error}</p>
        <button onClick={fetchAnalytics} className="mt-2 font-mono text-[10px] text-secondary underline">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const overall = data?.overall ?? { totalSent: 0, totalOpens: 0, totalClicks: 0, openRate: 0, clickRate: 0, uniqueOpens: 0, uniqueClicks: 0 };
  const byCampaign = Array.isArray(data?.byCampaign) ? (data!.byCampaign as CampaignAnalytics['byCampaign']) : [];
  const topLinks = Array.isArray(data?.topLinks) ? (data!.topLinks as CampaignAnalytics['topLinks']) : [];
  const timeline = Array.isArray(data?.timeline) ? (data!.timeline as CampaignAnalytics['timeline']) : [];
  const devices = Array.isArray(data?.devices) ? (data!.devices as CampaignAnalytics['devices']) : [];

  return (
    <div className="space-y-6">
      {/* Overall Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard icon={Mail} label="Emails Sent" value={overall.totalSent.toLocaleString()} sub={`${overall.uniqueOpens} unique opens`} />
        <MetricCard icon={Eye} label="Open Rate" value={`${overall.openRate}%`} sub={`${overall.totalOpens} total opens`} color="bg-emerald-500" />
        <MetricCard icon={MousePointerClick} label="Click Rate" value={`${overall.clickRate}%`} sub={`${overall.totalClicks} total clicks`} color="bg-sky-500" />
        <MetricCard icon={TrendingUp} label="Engagement" value={`${overall.openRate + overall.clickRate}%`} sub="Open + Click rate" color="bg-violet-500" />
      </div>

      {/* Timeline Chart */}
      {timeline.length > 0 && (
        <div className="bg-white p-6 rounded-2xl whisper-shadow border border-border">
          <h3 className="font-display font-bold text-sm uppercase text-primary mb-4">Opens & Clicks Over Time</h3>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeline}>
                <defs>
                  <linearGradient id="opensGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#448515" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#448515" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="clicksGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="opens" stroke="#448515" fill="url(#opensGrad)" strokeWidth={2} name="Opens" />
                <Area type="monotone" dataKey="clicks" stroke="#0ea5e9" fill="url(#clicksGrad)" strokeWidth={2} name="Clicks" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Per-Campaign Table */}
      <div className="bg-white p-6 rounded-2xl whisper-shadow border border-border">
        <h3 className="font-display font-bold text-sm uppercase text-primary mb-4">Campaign Performance</h3>
        {byCampaign.length === 0 ? (
          <p className="font-mono text-[10px] text-on-surface-variant/40 text-center py-8">No campaigns with tracking data yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left" aria-label="Campaign performance table">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60">Campaign</th>
                  <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60 text-right">Sent</th>
                  <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60 text-right">Opens</th>
                  <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60 text-right">Open Rate</th>
                  <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60 text-right">Clicks</th>
                  <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60 text-right">Click Rate</th>
                  <th scope="col" className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60">Sent</th>
                </tr>
              </thead>
              <tbody>
                {byCampaign.map((c) => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-surface-container-low/50 transition-colors">
                    <td className="px-3 py-2.5">
                      <Link href={`/admin/campaigns/${c.id}`} className="font-mono text-xs font-bold text-primary hover:text-secondary transition-colors">
                        {c.name}
                      </Link>
                      <p className="font-mono text-[9px] text-on-surface-variant/50 truncate max-w-[200px]">{c.subject}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-on-surface-variant">{c.sent}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-on-surface-variant">{c.uniqueOpens}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-[9px] font-mono font-bold',
                        c.openRate >= 30 ? 'bg-emerald-50 text-emerald-600' : c.openRate >= 15 ? 'bg-amber-50 text-amber-600' : 'bg-zinc-100 text-zinc-500'
                      )}>
                        {c.openRate}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-on-surface-variant">{c.uniqueClicks}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-[9px] font-mono font-bold',
                        c.clickRate >= 10 ? 'bg-emerald-50 text-emerald-600' : c.clickRate >= 3 ? 'bg-amber-50 text-amber-600' : 'bg-zinc-100 text-zinc-500'
                      )}>
                        {c.clickRate}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[9px] text-on-surface-variant/50">{fmtDate(c.sentAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom Row: Top Links + Device Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Clicked Links */}
        <div className="bg-white p-6 rounded-2xl whisper-shadow border border-border">
          <h3 className="font-display font-bold text-sm uppercase text-primary mb-4">Top Clicked Links</h3>
          {topLinks.length === 0 ? (
            <p className="font-mono text-[10px] text-on-surface-variant/40 text-center py-8">No click data yet</p>
          ) : (
            <div className="space-y-3">
              {topLinks.map((link, i) => {
                const maxClicks = topLinks[0]?.clicks || 1;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[10px] text-on-surface-variant/70 truncate max-w-[250px] flex items-center gap-1">
                        <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        {link.url}
                      </span>
                      <span className="font-mono text-[10px] font-bold text-primary">{link.clicks}</span>
                    </div>
                    <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                      <div className="h-full bg-sky-500 rounded-full" style={{ width: `${(link.clicks / maxClicks) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Device / Client Breakdown */}
        <div className="bg-white p-6 rounded-2xl whisper-shadow border border-border">
          <h3 className="font-display font-bold text-sm uppercase text-primary mb-4 flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            Email Clients
          </h3>
          {devices.length === 0 ? (
            <p className="font-mono text-[10px] text-on-surface-variant/40 text-center py-8">No device data yet</p>
          ) : (
            <div className="flex items-center gap-6">
              <div className="w-40 h-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={devices}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={65}
                      paddingAngle={3}
                      dataKey="count"
                      nameKey="name"
                    >
                      {devices.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                {devices.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="font-mono text-[10px] text-on-surface-variant/70 flex-1">{d.name}</span>
                    <span className="font-mono text-[10px] font-bold text-primary">{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
