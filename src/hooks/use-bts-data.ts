import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@/firebase';
import { isAllowedDomain } from '@/lib/admin-config';
import type { User } from 'firebase/auth';
import type { BtsCustomerDoc, BtsCustomersSummary } from '@/app/api/admin/bts/customers/route';

interface BtsCustomersResponse {
  records: BtsCustomerDoc[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: BtsCustomersSummary;
}

export function useBtsCustomers(params?: {
  region?: string;
  status?: string;
  accountType?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const auth = useAuth();
  const { user, loading: authLoading } = useUser(auth);
  const [records, setRecords] = useState<BtsCustomerDoc[]>([]);
  const [summary, setSummary] = useState<BtsCustomersSummary | null>(null);
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
        if (params?.region) sp.set('region', params.region);
        if (params?.status) sp.set('status', params.status);
        if (params?.accountType) sp.set('accountType', params.accountType);
        if (params?.search) sp.set('search', params.search);
        if (params?.page) sp.set('page', String(params.page));
        if (params?.pageSize) sp.set('pageSize', String(params.pageSize));
        const qs = sp.toString();
        const res = await fetch(`/api/admin/bts/customers${qs ? `?${qs}` : ''}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed: ${res.statusText}`);
        const result = await res.json();
        const responseData = result.data as BtsCustomersResponse | undefined;
        setRecords(responseData?.records || []);
        setSummary(responseData?.summary || null);
        setTotal(responseData?.total || 0);
        setTotalPages(responseData?.totalPages || 1);
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error fetching BTS customers');
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [user, authLoading, params?.region, params?.status, params?.accountType, params?.search, params?.page, params?.pageSize],
  );

  useEffect(() => {
    fetchCustomers(true);
    return () => {};
  }, [fetchCustomers]);

  return { records, summary, total, totalPages, loading, error, mutate: () => fetchCustomers(true) };
}

export async function deleteBtsCustomer(id: string, user: User) {
  const token = await user.getIdToken();
  const res = await fetch('/api/admin/bts/customers', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || 'Failed to delete');
  }
  const result = await res.json();
  return result.data as { action: string };
}
