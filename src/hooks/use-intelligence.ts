import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@/firebase';
import { isAllowedDomain } from '@/lib/admin-config';
import type { IntelligenceOverview } from '@/lib/services/customer-intelligence-service';

export function useIntelligence() {
  const auth = useAuth();
  const { user, loading: authLoading } = useUser(auth);
  const [data, setData] = useState<IntelligenceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (authLoading) return;
    if (!user || !user.emailVerified || !isAllowedDomain(user.email || '')) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/intelligence/overview', { headers: { Authorization: `Bearer ${token}` } });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed');
      setData(result.data as IntelligenceOverview);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [user, authLoading]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  return { data, loading, error, refresh: fetchData };
}
