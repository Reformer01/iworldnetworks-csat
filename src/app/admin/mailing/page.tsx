'use client';

import React, { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { cn } from '@/lib/utils';
import { Megaphone, Mail, MessageSquareWarning, BarChart3, FileText } from 'lucide-react';
import { CampaignsTab } from '@/components/mailing/CampaignsTab';
import { EmailsTab } from '@/components/mailing/EmailsTab';
import { ChurnTab } from '@/components/mailing/ChurnTab';
import { AnalyticsTab } from '@/components/mailing/AnalyticsTab';

const TABS = [
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'emails', label: 'Email Queue', icon: Mail },
  { id: 'churn', label: 'Churn Surveys', icon: MessageSquareWarning },
];

export default function MailingPage() {
  return (
    <SalesLayout>
      <Suspense fallback={null}>
        <MailingHub />
      </Suspense>
    </SalesLayout>
  );
}

function MailingHub() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get('tab') || 'campaigns';
  const active = TABS.some((t) => t.id === tab) ? tab : 'campaigns';

  const setTab = (id: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('tab', id);
    router.replace(`/admin/mailing?${sp.toString()}`);
  };

  return (
    <div className="max-w-screen-2xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-display font-bold text-primary uppercase tracking-tight">Mailing</h1>
        <p className="font-mono text-[10px] uppercase tracking-widest font-bold mt-1 opacity-60">
          Campaigns, email queue & churn surveys in one place
        </p>
      </header>
      <div className="flex gap-2 mb-6 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 font-mono text-[10px] uppercase font-bold border-b-2 transition-colors',
              active === t.id ? 'border-secondary text-secondary' : 'border-transparent text-on-surface-variant hover:text-primary',
            )}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
        <a
          href="/admin/mailing/templates"
          className="flex items-center gap-2 px-4 py-2.5 font-mono text-[10px] uppercase font-bold border-b-2 border-transparent text-on-surface-variant hover:text-primary transition-colors"
        >
          <FileText className="w-3.5 h-3.5" />
          Templates
        </a>
      </div>
      {active === 'campaigns' && <CampaignsTab />}
      {active === 'analytics' && <AnalyticsTab />}
      {active === 'emails' && <EmailsTab />}
      {active === 'churn' && <ChurnTab />}
    </div>
  );
}
