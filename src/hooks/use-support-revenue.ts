import { useState, useCallback, useEffect } from 'react';
import { useAuth, useUser } from '@/firebase';
import type { SupportRevenueDoc } from '@/lib/support-revenue-types';
import { isSuperAdmin } from '@/lib/admin-config';

interface UseSupportRevenueOptions {
  projectType?: string;
}

export function useSupportRevenue(options: UseSupportRevenueOptions = {}) {
  const [records, setRecords] = useState<SupportRevenueDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const auth = useAuth();
  const { user } = useUser(auth);

  const fetchRecords = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const token = await user.getIdToken();
      if (!token) {
        setError('Not authenticated');
        return;
      }

      const params = new URLSearchParams();
      if (options.projectType) {
        params.set('projectType', options.projectType);
      }

      const url = `/api/admin/support-revenue${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (data.success) {
        setRecords(data.data || []);
        setError(null);
      } else {
        setError(data.error || 'Failed to load records');
      }
    } catch (err) {
      setError('Failed to load support revenue records');
    } finally {
      setLoading(false);
    }
  }, [user, options.projectType]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const createSupportRevenue = async (payload: Partial<SupportRevenueDoc>, currentUser: any) => {
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/admin/support-revenue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create record');
      }

      await fetchRecords();
      return data;
    } catch (err) {
      throw err;
    }
  };

  const updateSupportRevenue = async (id: string, payload: Partial<SupportRevenueDoc>, currentUser: any) => {
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`/api/admin/support-revenue/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update record');
      }

      await fetchRecords();
      return data;
    } catch (err) {
      throw err;
    }
  };

  const deleteSupportRevenue = async (id: string, currentUser: any) => {
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch(`/api/admin/support-revenue/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete record');
      }

      await fetchRecords();
      return data;
    } catch (err) {
      throw err;
    }
  };

  return {
    records,
    loading,
    error,
    createSupportRevenue,
    updateSupportRevenue,
    deleteSupportRevenue,
    mutate: fetchRecords,
  };
}
