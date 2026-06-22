'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@/firebase';
import type { User } from 'firebase/auth';
import type { SalesRecord, SalesMetrics, RegionMetrics, AgentMetrics } from '@/lib/sales-types';
import type { SalesRecordFormData } from '@/lib/validations/sales';
import { isAllowedDomain } from '@/lib/admin-config';

export interface MetricsResponse {
  overall: SalesMetrics;
  regionMetrics: RegionMetrics[];
  agentMetrics: AgentMetrics[];
  segmentBreakdown: { segment: string; count: number; active: number; mrc: number; arpu: number }[];
  totalRecords: number;
}

export type SalesRecordDoc = SalesRecord & { id: string };

export interface RecordsResponse {
  records: SalesRecordDoc[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function useSalesMetrics(region?: string) {
  const auth = useAuth();
  const { user, loading: authLoading } = useUser(auth);
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (authLoading) return;
    if (!user || !user.emailVerified || !isAllowedDomain(user.email || '')) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const token = await user.getIdToken();
      const params = region ? `?region=${region}` : '';
      const res = await fetch(`/api/admin/sales/metrics${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed: ${res.statusText}`);
      const result = await res.json();
      setData(result.data as MetricsResponse);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error fetching metrics');
    } finally {
      setLoading(false);
    }
  }, [user, authLoading, region]);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchMetrics();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  return { data, loading, error, mutate: fetchMetrics };
}

export function useSalesRecords(params?: {
  region?: string;
  status?: string;
  agent?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const auth = useAuth();
  const { user, loading: authLoading } = useUser(auth);
  const [records, setRecords] = useState<SalesRecordDoc[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
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
      if (params?.status) sp.set('status', params.status);
      if (params?.agent) sp.set('agent', params.agent);
      if (params?.search) sp.set('search', params.search);
      if (params?.page) sp.set('page', String(params.page));
      if (params?.pageSize) sp.set('pageSize', String(params.pageSize));
      const qs = sp.toString();
      const res = await fetch(`/api/admin/sales/records${qs ? `?${qs}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed: ${res.statusText}`);
      const result = await res.json();
      const responseData = result.data as RecordsResponse | undefined;
      setRecords(responseData?.records || []);
      setTotal(responseData?.total || 0);
      setTotalPages(responseData?.totalPages || 1);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error fetching records');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [user, authLoading, params?.region, params?.status, params?.agent, params?.search, params?.page, params?.pageSize]);

  useEffect(() => {
    fetchRecords(true);
  }, [fetchRecords]);

  return { records, total, totalPages, loading, error, mutate: () => fetchRecords(true) };
}

export async function createSalesRecord(data: SalesRecordFormData, user: User) {
  const token = await user.getIdToken();
  const res = await fetch('/api/admin/sales/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to create'); }
  const result = await res.json();
  return result.data as { id: string };
}

export async function updateSalesRecord(id: string, data: Partial<SalesRecordFormData>, user: User) {
  const token = await user.getIdToken();
  const res = await fetch('/api/admin/sales/records', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id, ...data }),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to update'); }
  const result = await res.json();
  return result.data as Record<string, never>;
}

export async function deleteSalesRecord(id: string, user: User) {
  const token = await user.getIdToken();
  const res = await fetch('/api/admin/sales/records', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to delete'); }
  const result = await res.json();
  return result.data as { action: string };
}

export async function importSalesRecords(records: SalesRecordFormData[], source: string, fileName: string, user: User) {
  const token = await user.getIdToken();
  const res = await fetch('/api/admin/sales/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ records, source, fileName }),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to import'); }
  const result = await res.json();
  return result.data as { batchId: string; recordCount: number };
}
