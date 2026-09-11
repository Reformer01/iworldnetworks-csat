import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@/firebase';
import { isAllowedDomain } from '@/lib/admin-config';
import type { User } from 'firebase/auth';

export interface CustomerRecord {
  id: string;
  customerId: number;
  customerName: string;
  email: string;
  billingEmail: string;
  phone: string;
  login: string;
  city: string;
  status: string;
  lifecycle: 'active' | 'blocked' | 'inactive' | 'churned';
  online: boolean;
  lastOnlineAt: number | null;
  lastUpdateAt: number | null;
  mrrTotal: number;
  accountType: string;
  category: string;
  firstSyncedAt: number;
  lastSyncAt: number;
  deleted: boolean;
  reminder15SentAt: number | null;
  reminder30SentAt: number | null;
  churnSurveySentAt: number | null;
  churnSurveyToken: string | null;
  emailOptOut: boolean;
  btsName?: string | null;
  matchState?: string | null;
  matchMethod?: string | null;
  churnResponse: { rating: number | null; reason: string | null; comment: string | null } | null;
  overdueInvoice: {
    hasOverdueInvoice: boolean;
    overdueDays: number;
    overdueInvoiceCount: number;
    invoiceNumber: string | null;
    invoiceAmount: number;
    lastReminderSentAt: number | null;
    lastReminderType: '15d' | '30d' | null;
  } | null;
}

export interface CustomerSummary {
  total: number;
  active: number;
  blocked: number;
  inactive: number;
  churned: number;
  totalMrr: number;
  reminders15: number;
  reminders30: number;
  churnSurveySent: number;
  churnResponses: number;
}

export interface SyncMeta {
  lastSyncAt: number | null;
  lastStatus: string;
  lastError: string;
  invoicesApiDenied: boolean;
}

interface CustomersResponse {
  records: CustomerRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: CustomerSummary;
  meta: SyncMeta;
}

export function useCustomers(params?: {
  lifecycle?: string;
  status?: string;
  online?: string;
  overdue?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const auth = useAuth();
  const { user, loading: authLoading } = useUser(auth);
  const [records, setRecords] = useState<CustomerRecord[]>([]);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [meta, setMeta] = useState<SyncMeta | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomers = useCallback(
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
        if (params?.lifecycle) sp.set('lifecycle', params.lifecycle);
        if (params?.status) sp.set('status', params.status);
        if (params?.online) sp.set('online', params.online);
        if (params?.overdue) sp.set('overdue', params.overdue);
        if (params?.search) sp.set('search', params.search);
        if (params?.page) sp.set('page', String(params.page));
        if (params?.pageSize) sp.set('pageSize', String(params.pageSize));
        const qs = sp.toString();
        const res = await fetch(`/api/admin/customers${qs ? `?${qs}` : ''}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed: ${res.statusText}`);
        const result = await res.json();
        const responseData = result.data as CustomersResponse | undefined;
        setRecords(responseData?.records || []);
        setSummary(responseData?.summary || null);
        setMeta(responseData?.meta || null);
        setTotal(responseData?.total || 0);
        setTotalPages(responseData?.totalPages || 1);
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error fetching customers');
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [user, authLoading, params?.lifecycle, params?.status, params?.online, params?.overdue, params?.search, params?.page, params?.pageSize],
  );

  useEffect(() => {
    fetchCustomers(true);
    return () => {};
  }, [fetchCustomers]);

  return { records, summary, meta, total, totalPages, loading, error, mutate: () => fetchCustomers(true) };
}

export async function exportCustomersCsv(user: User): Promise<Blob> {
  const token = await user.getIdToken();
  const res = await fetch('/api/admin/customers/export', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Export failed');
  return res.blob();
}

export async function exportOverdueCustomersCsv(user: User): Promise<Blob> {
  const token = await user.getIdToken();
  const res = await fetch('/api/admin/customers/export?overdue=true', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Overdue export failed');
  return res.blob();
}

export async function triggerSplynxSync(user: User): Promise<{
  durationMs: number;
  stats: {
    customersUpserted: number;
    customersMarkedDeleted: number;
    invoicesUpserted: number;
    reminders15: number;
    reminders30: number;
    churnSent: number;
    invoicesApiDenied: boolean;
  };
  note?: string;
}> {
  const token = await user.getIdToken();
  const res = await fetch('/api/admin/splynx/sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Sync failed');
  }
  return data.data as ReturnType<typeof triggerSplynxSync>;
}
