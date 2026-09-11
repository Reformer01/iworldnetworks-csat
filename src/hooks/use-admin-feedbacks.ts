import { useState, useCallback, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { useAuth, useUser } from '@/firebase';
import type { FeedbackDoc } from '@/lib/feedback-types';

export class ValidationError extends Error {
  details: Record<string, string[]>;

  constructor(message: string, details: Record<string, string[]>) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

async function getAuthToken(user: User) {
  const token = await user.getIdToken();
  if (!token) {
    throw new Error('Not authenticated');
  }
  return token;
}

export async function createFeedback(payload: Partial<FeedbackDoc>, user: User) {
  const token = await getAuthToken(user);
  const response = await fetch('/api/admin/create-feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    if (data.details) {
      throw new ValidationError(data.error || 'Failed to create feedback', data.details);
    }
    throw new Error(data.error || 'Failed to create feedback');
  }

  return data;
}

export async function editFeedback(feedbackId: string, payload: Partial<FeedbackDoc>, user: User) {
  const token = await getAuthToken(user);
  const response = await fetch('/api/admin/edit-feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ feedbackId, ...payload }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    if (data.details) {
      throw new ValidationError(data.error || 'Failed to update feedback', data.details);
    }
    throw new Error(data.error || 'Failed to update feedback');
  }

  return data;
}

export async function deleteFeedback(feedbackId: string, user: User) {
  const token = await getAuthToken(user);
  const response = await fetch('/api/admin/delete-feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ feedbackId }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to delete feedback');
  }

  return data;
}

export async function updateFeedbackStatus(feedbackId: string, status: string, resolutionNotes: string, user: User) {
  if (!['open', 'resolved', 'escalated'].includes(status)) {
    throw new Error('Invalid feedback status');
  }
  const token = await getAuthToken(user);
  const response = await fetch('/api/admin/edit-feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ feedbackId, status, resolutionNotes }),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to update feedback');
  }

  return data;
}

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

      // limit=1000 (API max): the default page of 50 silently truncates the
      // date-range metrics on the admin dashboard.
      const response = await fetch('/api/admin/feedbacks?limit=1000', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (data.success) {
        if (Array.isArray(data.data)) {
          setFeedbacks(data.data);
        } else if (Array.isArray(data.data?.feedbacks)) {
          setFeedbacks(data.data.feedbacks);
        } else {
          setFeedbacks([]);
        }
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
    return () => {
      /* cleanup */
    };
  }, [fetchFeedbacks]);

  return {
    feedbacks,
    loading,
    error,
    refetch: fetchFeedbacks,
    mutate: fetchFeedbacks,
  };
}
