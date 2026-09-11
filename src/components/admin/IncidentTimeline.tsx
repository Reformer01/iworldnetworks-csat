'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn, toLocalDateString } from '@/lib/utils';
import { useAuth, useUser } from '@/firebase';
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Wifi,
  WifiOff,
  Pause,
  Play,
  TrendingDown,
  Users,
  DollarSign,
  RefreshCw,
} from 'lucide-react';

interface Incident {
  timestamp: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
}

interface IncidentTimelineProps {
  towerId: string;
  towerName: string;
}

const INCIDENT_ICONS: Record<string, React.ElementType> = {
  status_change: RefreshCw,
  device_outage: WifiOff,
  device_recovery: Wifi,
  sync_regression: Clock,
  suspension: Pause,
  unsuspension: Play,
  customer_churn: Users,
  mrr_drop: DollarSign,
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  info: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-emerald-500',
};

function fmtDate(ms: number | string | Date): string {
  const d = new Date(ms);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function relTime(ms: number | string | Date): string {
  const now = Date.now();
  const then = new Date(ms).getTime();
  const mins = Math.floor((now - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function IncidentTimeline({ towerId, towerName }: IncidentTimelineProps) {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchIncidents = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/bts/audit/history?towerId=${towerId}&type=incidents&limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load incidents');
      const data = await res.json();
      setIncidents(data.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading incidents');
    } finally {
      setLoading(false);
    }
  }, [user, towerId]);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-secondary" aria-hidden="true" />
        <span className="sr-only">Loading incident history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" aria-hidden="true" />
        <p className="font-mono text-[10px] text-on-surface-variant/60 uppercase font-bold">{error}</p>
        <button
          onClick={fetchIncidents}
          className="mt-2 px-3 py-1.5 rounded-xl bg-surface-container-low border border-border/40 font-mono text-[9px] uppercase font-bold text-on-surface-variant hover:bg-surface-container transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (incidents.length === 0) {
    return (
      <div className="text-center py-8">
        <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" aria-hidden="true" />
        <p className="font-mono text-[10px] text-on-surface-variant/60 uppercase font-bold">
          No incidents recorded for {towerName}
        </p>
        <p className="font-mono text-[9px] text-on-surface-variant/40 mt-1">
          History is captured hourly. Check back later.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0" role="list" aria-label={`Incident history for ${towerName}`}>
      {incidents.map((incident, i) => {
        const Icon = INCIDENT_ICONS[incident.type] || AlertTriangle;
        return (
          <div
            key={`${incident.type}-${incident.timestamp}-${i}`}
            className="relative flex gap-3 pb-4"
            role="listitem"
          >
            {/* Timeline line */}
            {i < incidents.length - 1 && (
              <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-border/40" aria-hidden="true" />
            )}

            {/* Severity dot */}
            <div className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10', SEVERITY_DOT[incident.severity])}>
              <Icon className="w-3 h-3 text-white" aria-hidden="true" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="font-mono text-xs font-bold text-primary">
                  {incident.message}
                </p>
                <span className={cn(
                  'shrink-0 px-2 py-0.5 rounded-full text-[8px] font-bold font-mono uppercase border',
                  SEVERITY_STYLES[incident.severity]
                )}>
                  {incident.severity}
                </span>
              </div>
              <p className="font-mono text-[9px] text-on-surface-variant/50 mt-0.5">
                {fmtDate(incident.timestamp)} · {relTime(incident.timestamp)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
