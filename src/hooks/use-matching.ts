import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@/firebase';
import { isAllowedDomain } from '@/lib/admin-config';

export interface MatchingCandidate {
  endpointId: string;
  name: string;
  btsName: string | null;
  status: string | null;
  deviceOutageCount: number | null;
  region: string | null;
  score: number;
}

export interface MatchingCustomer {
  id: string;
  customerId: string;
  customerName: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  btsId: string | null;
  btsName: string | null;
  uispEndpointId: string | null;
  uispEndpointName: string | null;
  uispDeviceStatus: string | null;
  uispOutageCount: number | null;
  matchState: string | null;
  matchMethod: string | null;
  matchScore: number | null;
  matchedAt: number | null;
  matchUpdatedAt: number | null;
}

export interface ReviewRecord {
  customer: MatchingCustomer;
  candidates: MatchingCandidate[];
}

interface CandidatesResponse {
  records: ReviewRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

async function readError(res: Response): Promise<Error> {
  const body = await res.json().catch(() => null);
  return new Error(body?.error || `Failed: ${res.statusText}`);
}

export function useMatchingCandidates(params?: { search?: string; page?: number; pageSize?: number }) {
  const auth = useAuth();
  const { user, loading: authLoading } = useUser(auth);
  const [records, setRecords] = useState<ReviewRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCandidates = useCallback(
    async (showLoading = true) => {
      if (authLoading) return;
      if (!user || !user.emailVerified || !isAllowedDomain(user.email || '')) {
        setRecords([]);
        setTotal(0);
        setTotalPages(1);
        setLoading(false);
        return;
      }

      try {
        if (showLoading) setLoading(true);
        const token = await user.getIdToken();
        const sp = new URLSearchParams();
        if (params?.search) sp.set('search', params.search);
        if (params?.page) sp.set('page', String(params.page));
        if (params?.pageSize) sp.set('pageSize', String(params.pageSize));
        const qs = sp.toString();
        const res = await fetch(`/api/admin/matching/candidates${qs ? `?${qs}` : ''}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw await readError(res);
        const result = await res.json();
        const data = result.data as CandidatesResponse | undefined;
        setRecords(data?.records || []);
        setTotal(data?.total || 0);
        setTotalPages(data?.totalPages || 1);
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error fetching matching queue');
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [user, authLoading, params?.search, params?.page, params?.pageSize],
  );

  useEffect(() => {
    fetchCandidates(true);
    return () => {};
  }, [fetchCandidates]);

  return { records, total, totalPages, loading, error, mutate: () => fetchCandidates(true) };
}

/** Assigns a manual match (endpointId = candidate id) or marks no match (null). Throws on failure. */
export function useAssignMatch() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [assigning, setAssigning] = useState(false);

  const assign = useCallback(
    async (customerId: string, endpointId: string | null) => {
      if (!user) throw new Error('Not signed in');
      setAssigning(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/matching/candidates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ customerId, endpointId }),
        });
        if (!res.ok) throw await readError(res);
        const result = await res.json();
        return result.data as { customer: MatchingCustomer };
      } finally {
        setAssigning(false);
      }
    },
    [user],
  );

  return { assign, assigning };
}
