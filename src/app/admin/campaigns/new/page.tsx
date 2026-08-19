'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { useAuth, useUser } from '@/firebase';
import { CampaignForm } from '@/components/campaigns/CampaignForm';
import { ShieldAlert } from 'lucide-react';
import { isSuperAdmin, isEditor } from '@/lib/admin-config';

export default function NewCampaignPage() {
  const router = useRouter();
  const auth = useAuth();
  const { user } = useUser(auth);
  const canCreate = isSuperAdmin(user?.email || '') || isEditor(user?.email || '');

  return (
    <SalesLayout>
      <div className="max-w-3xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-display font-bold text-primary uppercase tracking-tight">New Campaign</h1>
          <p className="font-mono text-[10px] uppercase tracking-widest font-bold mt-1 opacity-60">
            Draft a bulk email &mdash; a super admin approves before it sends
          </p>
        </header>

        {!canCreate || !user ? (
          <div className="bg-white p-10 rounded-2xl whisper-shadow border border-border flex flex-col items-center text-center">
            <ShieldAlert className="w-10 h-10 text-on-surface-variant/20 mb-3" />
            <p className="font-mono text-[11px] text-on-surface-variant/40 uppercase font-bold tracking-widest">
              You do not have permission to create campaigns
            </p>
          </div>
        ) : (
          <div className="bg-white p-6 md:p-8 rounded-2xl whisper-shadow border border-border">
            <CampaignForm user={user} onCreated={(id) => router.push(`/admin/campaigns/${id}`)} />
          </div>
        )}
      </div>
    </SalesLayout>
  );
}
