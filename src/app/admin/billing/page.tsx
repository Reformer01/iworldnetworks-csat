'use client';

import React, { useMemo } from 'react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Timer, MonitorSmartphone, CircleCheck } from 'lucide-react';
import Image from 'next/image';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { cn } from '@/lib/utils';
import { useAuth, useUser } from '@/firebase';
import { useAdminFeedbacks } from '@/hooks/use-admin-feedbacks';
import { isNegativeFeedback } from '@/lib/feedback-negativity';
import { averageRating } from '@/lib/feedback-ratings';
import FeedbackQuote from '@/components/FeedbackQuote';
import type { FeedbackDoc } from '@/lib/feedback-types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function AdminBilling() {
  const serverImg = PlaceHolderImages.find((img) => img.id === 'infra-status')!;
  const auth = useAuth();
  const { user } = useUser(auth);

  const { feedbacks, loading } = useAdminFeedbacks();

  const billingFeedbacks = useMemo(() => (feedbacks || []).filter((f: FeedbackDoc) => f.category === 'Billing'), [feedbacks]);

  const stats = useMemo(() => {
    if (!feedbacks || feedbacks.length === 0) return { accuracy: '0.0', speed: '0.0', portalEase: '0.0' };

    const billingItems = feedbacks.filter((f: FeedbackDoc) => f.category === 'Billing');
    if (billingItems.length === 0) return { accuracy: '0.0', speed: '0.0', portalEase: '0.0' };

    // Both rating conventions exist in the data: the legacy form writes
    // accuracy/reconnection, the tokenized survey writes invoiceAccuracy/overall.
    // averageRating excludes docs that lack the key instead of counting them as 0.
    const accuracy = averageRating(billingItems, ['accuracy', 'invoiceAccuracy']);
    const speed = averageRating(billingItems, ['reconnection', 'overall']);
    const portalEase = averageRating(billingItems, ['portalEase']);

    return {
      accuracy: accuracy.count > 0 ? accuracy.average.toFixed(1) : '0.0',
      speed: speed.count > 0 ? speed.average.toFixed(1) : '0.0',
      portalEase: portalEase.count > 0 ? portalEase.average.toFixed(1) : '0.0',
    };
  }, [feedbacks]);

  // Only negative feedback (any rating below 4, or an explicit "no") is
  // flagged as a discrepancy to be resolved. Positive responses are NOT
  // counted as issues.
  const reconciliationData = useMemo(() => {
    if (!feedbacks || feedbacks.length === 0) return [];
    const flaggedItems = feedbacks.filter((f: FeedbackDoc) => f.category === 'Billing' && isNegativeFeedback(f));

    const groups: Record<string, { name: string; discrepancies: number; resolutions: number; timestamp: number }> = {};

    flaggedItems.forEach((f: FeedbackDoc) => {
      const date = new Date(f.timestamp ?? 0);
      const label = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      if (!groups[label]) {
        groups[label] = {
          name: label,
          discrepancies: 0,
          resolutions: 0,
          timestamp: f.timestamp ?? 0,
        };
      }
      groups[label].discrepancies += 1;
      if (f.status === 'resolved') {
        groups[label].resolutions += 1;
      }
    });

    return Object.values(groups)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(({ name, discrepancies, resolutions }) => ({
        name,
        discrepancies,
        resolutions,
      }));
  }, [feedbacks]);

  const accuracyPct = Math.min(100, Math.max(0, Number(stats.accuracy) * 20));

  return (
    <AdminLayout>
      <header className="grid grid-cols-12 gap-gutter mb-16 items-end">
        <div className="col-span-12 md:col-span-7">
          <h1 className="text-3xl md:text-headline-lg text-primary mb-4 font-display">Billing Overview</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">
            Payment satisfaction, invoice accuracy, and online payments.
          </p>
        </div>
        <div className="col-span-12 md:col-span-4 md:col-start-9 text-right">
          <div className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-border whisper-shadow">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            <span className="font-mono text-label-mono text-on-surface">Monitoring On</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-20">
        {[
          { label: 'Billing Accuracy', val: stats.accuracy, unit: '/5', trend: 'Clear pricing', icon: CircleCheck },
          { label: 'Restoration Speed', val: stats.speed, unit: '/5', trend: 'Target: > 4.5', icon: Timer, staggered: true },
          { label: 'Portal Ease', val: stats.portalEase, unit: '/5', trend: 'Online ease', icon: MonitorSmartphone },
        ].map((item, i) => (
          <div
            key={i}
            className={cn(
              'bg-white p-8 rounded-xl whisper-shadow border border-border hover:border-secondary transition-colors duration-500',
              item.staggered && 'md:mt-16',
            )}
          >
            <div className="flex justify-between items-start mb-8">
              <item.icon className="w-8 h-8 text-secondary" />
              <span className="font-mono text-[12px] text-green-600 bg-green-50 px-2 py-1 rounded">{item.trend}</span>
            </div>
            <h3 className="font-mono text-label-mono text-on-surface-variant mb-1 uppercase tracking-wider">{item.label}</h3>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[56px] leading-none font-bold text-primary">{item.val}</span>
              <span
                className={cn('font-display text-on-surface-variant font-light', item.unit.length > 2 ? 'text-lg' : 'text-headline-lg')}
              >
                {item.unit}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-gutter mb-24">
        <div className="col-span-12 lg:col-span-8 bg-white p-10 rounded-xl whisper-shadow border border-border relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-12">
            <div>
              <h2 className="font-display text-[24px] text-primary mb-1 font-bold">Billing Issues</h2>
              <p className="font-mono text-label-mono text-on-surface-variant">Daily issue resolution</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-primary rounded-full"></span>
                <span className="font-mono text-[12px]">Issues</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-secondary rounded-full"></span>
                <span className="font-mono text-[12px]">Resolved</span>
              </div>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reconciliationData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#666' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#666' }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="discrepancies" fill="#000" radius={[4, 4, 0, 0]} barSize={12} />
                <Bar dataKey="resolutions" fill="#448515" radius={[4, 4, 0, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 flex flex-col gap-gutter">
          <div className="bg-white p-8 rounded-xl whisper-shadow border border-border flex-1 flex flex-col justify-center">
            <p className="font-mono text-[12px] text-secondary mb-4 uppercase">System Status</p>
            <h4 className="font-display text-[20px] mb-4 font-bold">Payment System</h4>
            <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden mb-2">
              <div className="bg-secondary h-full" style={{ width: `${accuracyPct}%` }}></div>
            </div>
            <div className="flex justify-between font-mono text-[10px] text-on-surface-variant">
              <span>Status: Normal</span>
              <span>Online</span>
            </div>
          </div>

          <div className="relative rounded-xl overflow-hidden group cursor-pointer h-48">
            <Image
              src={serverImg.imageUrl}
              alt="Server Room"
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 25vw"
              className="object-cover transition-transform duration-700 group-hover:scale-110"
              data-ai-hint="data center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-primary to-transparent opacity-60"></div>
          </div>
        </div>
      </div>

      {/* Recent Billing Feedback — comments AND per-question ratings */}
      <div className="bg-white rounded-2xl whisper-shadow border border-border p-8 mb-24">
        <div className="flex items-center gap-3 mb-8">
          <CircleCheck className="w-5 h-5 text-secondary" />
          <h3 className="font-display font-bold text-lg uppercase tracking-tight">Recent Billing Feedback</h3>
          <span className="font-mono text-[10px] text-on-surface-variant/60 ml-auto">
            {billingFeedbacks.length} submission{billingFeedbacks.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="space-y-4">
          {billingFeedbacks.slice(0, 12).map((f: FeedbackDoc) => (
            <div
              key={f.id}
              className="p-6 border border-border rounded-xl hover:border-secondary transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-surface-container-lowest"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className={cn(
                      'px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase',
                      f.status === 'resolved'
                        ? 'bg-green-100 text-green-600'
                        : f.status === 'open'
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-200/50'
                          : 'bg-green-50 text-green-600 border border-green-200/50',
                    )}
                  >
                    {f.status}
                  </span>
                  <span className="text-[10px] text-on-surface-variant/40">{new Date(f.timestamp ?? 0).toLocaleDateString()}</span>
                  <span className="font-mono text-[10px] text-on-surface-variant/40 truncate ml-auto">{f.servicePlan || f.location}</span>
                </div>
                <p className="font-bold text-primary mb-1">
                  {f.customerName || 'Anonymous'}
                  <span className="font-mono text-[10px] font-normal opacity-40 ml-2">({f.location || '—'})</span>
                </p>
                <FeedbackQuote feedback={f} className="text-sm text-on-surface-variant line-clamp-3" />
              </div>
            </div>
          ))}
          {!loading && billingFeedbacks.length === 0 && (
            <div className="py-16 text-center border-2 border-dashed border-border rounded-xl">
              <p className="font-mono text-sm text-on-surface-variant opacity-40 uppercase font-bold tracking-widest">
                No billing feedback yet
              </p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
