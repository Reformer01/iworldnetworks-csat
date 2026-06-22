'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@/firebase';
import type { User } from 'firebase/auth';
import type { SupportRevenueRecord } from '@/lib/sales-types';
import type { SupportRevenueFormData } from '@/lib/validations/support-revenue';
import { isAllowedDomain } from '@/lib/admin-config';

export type SupportRevenueDoc = SupportRevenueRecord & { id: string };

export function useSupportRevenue(params?: { region?: string; projectType?: string }) {
  const auth = useAuth();
  const { user, loading: authLoading } = useUser(auth);
  const [records, setRecords] = useState<SupportRevenueDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecords = useCallback(async (showLoading = true) => {
    if (authLoading) return;
    if (!user || !user.emailVerified || !isAllowedDomain(user.email || '')) {
      setRecords([]);
      setLoading(false);
      return;
    }
    try {
      if (showLoading) setLoading(true);
      const token = await user.getIdToken();
      const sp = new URLSearchParams();
      if (params?.region) sp.set('region', params.region);
      if (params?.projectType) sp.set('projectType', params.projectType);
      const qs = sp.toString();
      const res = await fetch(`/api/admin/support-revenue${qs ? `?${qs}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed: ${res.statusText}`);
      const result = await res.json();
      setRecords(result.data?.records || []);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error fetching records');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [user, authLoading, params?.region, params?.projectType]);

  useEffect(() => { fetchRecords(true); }, [fetchRecords]);

  return { records, loading, error, mutate: () => fetchRecords(true) };
}

export async function createSupportRevenue(data: SupportRevenueFormData, user: User) {
  const token = await user.getIdToken();
  const res = await fetch('/api/admin/support-revenue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to create'); }
  const result = await res.json();
  return result.data as { id: string };
}

export async function updateSupportRevenue(id: string, data: Partial<SupportRevenueFormData>, user: User) {
  const token = await user.getIdToken();
  const res = await fetch('/api/admin/support-revenue', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id, ...data }),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to update'); }
  const result = await res.json();
  return result.data as Record<string, never>;
}

export async function deleteSupportRevenue(id: string, user: User) {
  const token = await user.getIdToken();
  const res = await fetch('/api/admin/support-revenue', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to delete'); }
  const result = await res.json();
  return result.data as { action: string };
}
