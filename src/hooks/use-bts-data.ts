import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@/firebase';
import { isAllowedDomain } from '@/lib/admin-config';
import type { UnifiedCustomerRecord, UnifiedRosterSummary } from '@/app/api/admin/bts/customers/route';

interface BtsCustomersResponse {
  records: UnifiedCustomerRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: UnifiedRosterSummary;
}

export function useBtsCustomers(params?: {
  btsName?: string;
  region?: string;
  lifecycle?: string;
  accountType?: string;
  overdue?: 'true' | 'false';
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const auth = useAuth();
  const { user, loading: authLoading } = useUser(auth);
  const [records, setRecords] = useState<UnifiedCustomerRecord[]>([]);
  const [summary, setSummary] = useState<UnifiedRosterSummary | null>(null);
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
        if (params?.btsName) sp.set('btsName', params.btsName);
        if (params?.region) sp.set('region', params.region);
        if (params?.lifecycle) sp.set('lifecycle', params.lifecycle);
        if (params?.accountType) sp.set('accountType', params.accountType);
        if (params?.overdue) sp.set('overdue', params.overdue);
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
    [user, authLoading, params?.btsName, params?.region, params?.lifecycle, params?.accountType, params?.overdue, params?.search, params?.page, params?.pageSize],
  );

  useEffect(() => {
    fetchCustomers(true);
    return () => {};
  }, [fetchCustomers]);

  return { records, summary, total, totalPages, loading, error, mutate: () => fetchCustomers(true) };
}
