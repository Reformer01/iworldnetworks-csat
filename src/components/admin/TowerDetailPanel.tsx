'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn, toLocalDateString } from '@/lib/utils';
import { useAuth, useUser } from '@/firebase';
import { Sparkline, TrendIndicator } from '@/components/admin/Sparkline';
import {
  Loader2,
  X,
  Users,
  DollarSign,
  Wifi,
  WifiOff,
  Clock,
  Shield,
  TrendingUp,
  TrendingDown,
  BarChart3,
} from 'lucide-react';

interface TowerAuditRow {
  towerId: string;
  towerName: string;
  region: string;
  status: string | null;
  suspended: boolean | null;
  deviceCount: number | null;
  deviceOutageCount: number | null;
  lastSyncAt: number | null;
  rosterSyncAt?: number | null;
  customers: {
    total: number;
    active: number;
    byAccountType: Record<string, number>;
    byServicePlan: Record<string, number>;
    customerDetails: Array<{
      customerId: string | null;
      customerName: string | null;
      lifecycle: string | null;
      accountType: string;
      servicePlan: string | null;
      potentialMrr: number;
      activeMrr: number;
    }>;
  };
  mrrTotal: number;
  activeMrr: number;
  mrrByAccountType: Record<string, number>;
  activeMrrByAccountType: Record<string, number>;
}

interface TrendData {
  date: string;
  total?: number;
  active?: number;
  potential?: number;
  score?: number;
}

function fmtNaira(amount: number) {
  if (amount >= 1000000) return '₦' + (amount / 1000000).toFixed(2) + 'M';
  if (amount >= 1000) return '₦' + (amount / 1000).toFixed(1) + 'K';
  return '₦' + amount.toLocaleString();
}

function fmtExactNaira(amount: number) {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`;
}

function accountLabel(key: string): string {
  if (key === 'NEIGHBOURHOOD') return 'Residential';
  if (key === 'PARTNERS_HOSTS') return 'Partners';
  if (key === 'BUNDLED') return 'Bundled';
  if (key === 'OTHER') return 'Other';
  return key;
}

function relTime(ms: number | null): string {
  if (!ms) return '—';
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function syncFreshness(ms: number | null): { color: string; label: string } {
  if (!ms) return { color: 'bg-zinc-400', label: 'Unknown' };
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 60) return { color: 'bg-emerald-500', label: 'Fresh' };
  if (mins < 1440) return { color: 'bg-amber-500', label: 'Aging' };
  return { color: 'bg-red-500', label: 'Stale' };
}

interface TowerDetailPanelProps {
  tower: TowerAuditRow;
  onClose: () => void;
}

type Tab = 'overview' | 'customers';

export function TowerDetailPanel({ tower, onClose }: TowerDetailPanelProps) {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [customerTrend, setCustomerTrend] = useState<TrendData[]>([]);
  const [mrrTrend, setMrrTrend] = useState<TrendData[]>([]);
  const [healthTrend, setHealthTrend] = useState<TrendData[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(true);

  const fetchTrends = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingTrends(true);
      const token = await user.getIdToken();
      const [custRes, mrrRes, healthRes] = await Promise.all([
        fetch(`/api/admin/bts/audit/history?towerId=${tower.towerId}&type=customer-trend&limit=30`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/admin/bts/audit/history?towerId=${tower.towerId}&type=mrr-trend&limit=30`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/admin/bts/audit/history?towerId=${tower.towerId}&type=health-trend&limit=30`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (custRes.ok) {
        const data = await custRes.json();
        setCustomerTrend(data.data || []);
      }
      if (mrrRes.ok) {
        const data = await mrrRes.json();
        setMrrTrend(data.data || []);
      }
      if (healthRes.ok) {
        const data = await healthRes.json();
        setHealthTrend(data.data || []);
      }
    } catch {
      // Trends are optional — don't block the panel
    } finally {
      setLoadingTrends(false);
    }
  }, [user, tower.towerId]);

  useEffect(() => {
    fetchTrends();
  }, [fetchTrends]);

  const mrrPercentage = tower.mrrTotal > 0
    ? Math.round((tower.activeMrr / tower.mrrTotal) * 100)
    : 0;
  const freshness = syncFreshness(tower.rosterSyncAt ?? tower.lastSyncAt);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${tower.towerName} tower details`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-border/60 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="font-display font-bold text-lg uppercase">{tower.towerName}</h2>
              <span className={cn('w-2.5 h-2.5 rounded-full', tower.status === 'active' ? 'bg-emerald-500' : 'bg-red-500')} />
            </div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant/60">{tower.region}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center hover:bg-zinc-200 transition-colors"
            aria-label="Close tower details"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3 border-b border-border/60">
          {([
            { id: 'overview' as Tab, label: 'Overview', icon: BarChart3 },
            { id: 'customers' as Tab, label: 'Customers', icon: Users },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 font-mono text-[10px] uppercase font-bold border-b-2 transition-colors',
                activeTab === tab.id ? 'border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-primary'
              )}
            >
              <tab.icon className="w-3 h-3" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Primary metrics with sparklines */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-container-lowest rounded-xl p-4 border border-border/40">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60">Customers</p>
                    {customerTrend.length >= 2 && (
                      <TrendIndicator
                        current={customerTrend[customerTrend.length - 1]?.total ?? 0}
                        previous={customerTrend[customerTrend.length - 2]?.total ?? 0}
                      />
                    )}
                  </div>
                  <p className="font-display text-2xl font-bold text-primary">{tower.customers.total}</p>
                  <p className="font-mono text-[11px] text-emerald-600 font-bold">{tower.customers.active} active</p>
                  {customerTrend.length > 0 && (
                    <div className="mt-2">
                      <Sparkline
                        data={customerTrend.map((d) => d.total ?? 0)}
                        color="#0ea5e9"
                        fillColor="#0ea5e9"
                        width={160}
                        height={32}
                        ariaLabel="Customer count trend"
                      />
                    </div>
                  )}
                </div>

                <div className="bg-surface-container-lowest rounded-xl p-4 border border-border/40">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60">MRR</p>
                    {mrrTrend.length >= 2 && (
                      <TrendIndicator
                        current={mrrTrend[mrrTrend.length - 1]?.potential ?? 0}
                        previous={mrrTrend[mrrTrend.length - 2]?.potential ?? 0}
                        format={fmtNaira}
                      />
                    )}
                  </div>
                  <p className="font-display text-2xl font-bold text-primary">{fmtNaira(tower.mrrTotal)}</p>
                  <p className="font-mono text-[11px] font-bold">{fmtNaira(tower.activeMrr)} <span className="text-emerald-600">active</span></p>
                  {mrrTrend.length > 0 && (
                    <div className="mt-2">
                      <Sparkline
                        data={mrrTrend.map((d) => d.potential ?? 0)}
                        color="#10b981"
                        fillColor="#10b981"
                        width={160}
                        height={32}
                        ariaLabel="MRR trend"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* MRR Utilization */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/50">MRR Utilization</span>
                  <span className="font-mono text-[11px] font-bold text-primary">{mrrPercentage}%</span>
                </div>
                <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      mrrPercentage >= 80 ? 'bg-emerald-500' : mrrPercentage >= 50 ? 'bg-amber-500' : 'bg-red-500'
                    )}
                    style={{ width: `${mrrPercentage}%` }}
                  />
                </div>
              </div>

              {/* Revenue Opportunity */}
              {tower.mrrTotal - tower.activeMrr > 0 && (
                <div className="flex items-center justify-between px-4 py-3 bg-orange-50 rounded-xl border border-orange-200">
                  <span className="font-mono text-[9px] uppercase tracking-widest font-bold text-orange-700">Revenue Opportunity</span>
                  <span className="font-mono text-[11px] font-bold text-orange-600">{fmtNaira(tower.mrrTotal - tower.activeMrr)}</span>
                </div>
              )}

              {/* Device + Sync status */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-container-lowest rounded-xl p-4 border border-border/40">
                  <p className="font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60 mb-1">Devices</p>
                  <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-emerald-500" />
                    <span className="font-mono text-sm font-bold text-primary">{tower.deviceCount ?? 0}</span>
                    {tower.deviceOutageCount != null && tower.deviceOutageCount > 0 && (
                      <>
                        <WifiOff className="w-4 h-4 text-red-500" />
                        <span className="font-mono text-sm font-bold text-red-600">{tower.deviceOutageCount}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="bg-surface-container-lowest rounded-xl p-4 border border-border/40">
                  <p className="font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/60 mb-1">Last Sync</p>
                  <div className="flex items-center gap-2">
                    <span className={cn('w-2.5 h-2.5 rounded-full', freshness.color)} />
                    <span className="font-mono text-sm font-bold text-primary">{relTime(tower.rosterSyncAt ?? tower.lastSyncAt)}</span>
                  </div>
                </div>
              </div>

              {/* Health trend */}
              {healthTrend.length > 0 && (
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/50 mb-2">Health Score Trend</p>
                  <Sparkline
                    data={healthTrend.map((d) => d.score ?? 0)}
                    color="#6366f1"
                    fillColor="#6366f1"
                    width={240}
                    height={40}
                    ariaLabel="Health score trend"
                  />
                </div>
              )}

              {/* Account Type Breakdown */}
              {Object.keys(tower.customers.byAccountType).length > 0 && (
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-widest font-bold text-on-surface-variant/50 mb-2">Account Mix</p>
                  <div className="space-y-2">
                    {Object.entries(tower.customers.byAccountType).map(([key, count]) => {
                      const total = tower.customers.total || 1;
                      const pct = Math.round((count / total) * 100);
                      return (
                        <div key={key} className="flex items-center gap-3">
                          <span className="font-mono text-[10px] text-on-surface-variant/60 w-24">{accountLabel(key)}</span>
                          <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                            <div className="h-full bg-secondary rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="font-mono text-[10px] font-bold text-primary w-16 text-right">{count} · {pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'customers' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="font-mono text-[10px] uppercase tracking-widest font-bold text-on-surface-variant/60">
                  {tower.customers.customerDetails.length} customers
                </p>
                <p className="font-mono text-[9px] uppercase tracking-widest text-on-surface-variant/40">
                  Black = potential · green = active
                </p>
              </div>
              {tower.customers.customerDetails.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-border/60">
                  <table className="w-full min-w-[600px] text-left" aria-label="Customer MRR details">
                    <thead className="bg-surface-container-lowest">
                      <tr className="font-mono text-[9px] uppercase tracking-widest text-on-surface-variant/70">
                        <th scope="col" className="px-3 py-2">Customer</th>
                        <th scope="col" className="px-3 py-2">Segment</th>
                        <th scope="col" className="px-3 py-2">Plan</th>
                        <th scope="col" className="px-3 py-2">Status</th>
                        <th scope="col" className="px-3 py-2 text-right">Potential</th>
                        <th scope="col" className="px-3 py-2 text-right">Active</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {tower.customers.customerDetails.map((c) => (
                        <tr key={`${c.customerId ?? c.customerName}-${c.servicePlan}`} className="font-mono text-[10px]">
                          <td className="px-3 py-2">
                            <p className="font-bold text-primary">{c.customerName || 'Unnamed'}</p>
                            {c.customerId && <p className="text-[9px] text-on-surface-variant/50">#{c.customerId}</p>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{accountLabel(c.accountType)}</td>
                          <td className="px-3 py-2 min-w-[140px]">{c.servicePlan || '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{c.lifecycle || 'unknown'}</td>
                          <td className="px-3 py-2 text-right font-bold text-zinc-900 whitespace-nowrap">{fmtExactNaira(c.potentialMrr)}</td>
                          <td className="px-3 py-2 text-right font-bold text-emerald-600 whitespace-nowrap">{fmtExactNaira(c.activeMrr)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="font-mono text-[10px] text-on-surface-variant/60 text-center py-8">No customer data</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-border/60 px-6 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-surface-container-low border border-border/40 font-mono text-[10px] uppercase font-bold text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
