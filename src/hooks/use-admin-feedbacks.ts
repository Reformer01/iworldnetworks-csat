import { useState, useCallback, useEffect } from 'react';
import { useAuth, useUser } from '@/firebase';
import type { FeedbackDoc } from '@/lib/feedback-types';

export function useAdminFeedbacks() {
  const [feedbacks, setFeedbacks] = useState<FeedbackDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const auth = useAuth();
  const { user } = useUser(auth);

  const fetchFeedbacks = useCallback(async () => {
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

      const response = await fetch('/api/admin/feedbacks', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (data.success) {
        setFeedbacks(data.data || []);
        setError(null);
      } else {
        setError(data.error || 'Failed to load feedbacks');
      }
    } catch (err) {
      setError('Failed to load feedbacks');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  return {
    feedbacks,
    loading,
    error,
    refetch: fetchFeedbacks,
  };
}
