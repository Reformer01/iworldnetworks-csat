import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@/firebase';
import { isAllowedDomain } from '@/lib/admin-config';
import type { User } from 'firebase/auth';
import type { Prisma } from '@prisma/client';

export interface EmailJobRecord {
  id: string;
  bullJobId: string | null;
  campaignId: string | null;
  type: string;
  status: string;
  customerId: string | null;
  customerEmail: string | null;
  customerName: string | null;
  payload: Prisma.JsonValue;
  result: Prisma.JsonValue | null;
  error: string | null;
  scheduledAt: number | null;
  sentAt: number | null;
  approvedAt: number | null;
  approvedBy: string | null;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
  updatedAt: number;
}

export interface EmailStats {
  pending: number;
  processing: number;
  pendingApproval: number;
  sent24h: number;
  failed24h: number;
}

interface EmailsResponse {
  records: EmailJobRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: EmailStats;
}

export function useEmails(params?: {
  type?: string;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  campaignId?: string;
}) {
  const auth = useAuth();
  const { user, loading: authLoading } = useUser(auth);
  const [records, setRecords] = useState<EmailJobRecord[]>([]);
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEmails = useCallback(
    async (showLoading = true) => {
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
        if (params?.type) sp.set('type', params.type);
        if (params?.status) sp.set('status', params.status);
        if (params?.search) sp.set('search', params.search);
        if (params?.campaignId) sp.set('campaignId', params.campaignId);
        if (params?.page) sp.set('page', String(params.page));
        if (params?.pageSize) sp.set('pageSize', String(params.pageSize));
        const qs = sp.toString();
        const res = await fetch(`/api/admin/emails${qs ? `?${qs}` : ''}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed: ${res.statusText}`);
        const result = await res.json();
        const responseData = result.data as EmailsResponse | undefined;
        setRecords(responseData?.records || []);
        setStats(responseData?.stats || null);
        setTotal(responseData?.total || 0);
        setTotalPages(responseData?.totalPages || 1);
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error fetching emails');
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [user, authLoading, params?.type, params?.status, params?.search, params?.campaignId, params?.page, params?.pageSize],
  );

  useEffect(() => {
    fetchEmails(true);
    return () => {};
  }, [fetchEmails]);

  return { records, stats, total, totalPages, loading, error, mutate: () => fetchEmails(true) };
}

export async function composeManualEmail(
  user: User,
  input: { to: string; customerName?: string; subject: string; html?: string; text?: string },
): Promise<{ status: string }> {
  const token = await user.getIdToken();
  const res = await fetch('/api/admin/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to queue email');
  return { status: data?.data?.status || 'pending' };
}

export async function retryEmailJob(user: User, id: string): Promise<void> {
  const token = await user.getIdToken();
  const res = await fetch(`/api/admin/emails/${id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'retry' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to retry email');
}

export async function approveEmailJob(user: User, id: string): Promise<void> {
  const token = await user.getIdToken();
  const res = await fetch(`/api/admin/emails/${id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'approve' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to approve email');
}

export async function rejectEmailJob(user: User, id: string, reason?: string): Promise<void> {
  const token = await user.getIdToken();
  const res = await fetch(`/api/admin/emails/${id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reject', reason }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to reject email');
}

export async function bulkEmailAction(user: User, action: 'approve' | 'reject', ids: string[], reason?: string): Promise<number> {
  const token = await user.getIdToken();
  const res = await fetch('/api/admin/emails/bulk', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ids, reason }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Failed to ${action} emails`);
  return data?.data?.affected ?? 0;
}
