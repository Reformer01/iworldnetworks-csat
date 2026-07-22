import { useState, useCallback, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { useAuth, useUser } from '@/firebase';
import type { SupportRevenueDoc } from '@/lib/support-revenue-types';

export type { SupportRevenueDoc };

interface UseSupportRevenueOptions {
  projectType?: string;
}

async function getAuthToken(user: User) {
  const token = await user.getIdToken();
  if (!token) {
    throw new Error('Not authenticated');
  }
  return token;
}

export async function createSupportRevenue(payload: Partial<SupportRevenueDoc>, currentUser: User) {
  const token = await getAuthToken(currentUser);
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

  return data;
}

export async function updateSupportRevenue(id: string, payload: Partial<SupportRevenueDoc>, currentUser: User) {
  const token = await getAuthToken(currentUser);
  const response = await fetch('/api/admin/support-revenue', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ id, ...payload }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to update record');
  }

  return data;
}

export async function deleteSupportRevenue(id: string, currentUser: User) {
  const token = await getAuthToken(currentUser);
  const response = await fetch('/api/admin/support-revenue', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ id }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to delete record');
  }

  return data;
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
        setRecords(data.data?.records || data.records || []);
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
