'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@/firebase';
import type { User } from 'firebase/auth';
import type { FeedbackDoc } from '@/lib/feedback-types';
import { isAllowedDomain } from '@/lib/admin-config';

export function useAdminFeedbacks() {
  const auth = useAuth();
  const { user, loading: authLoading } = useUser(auth);
  const [feedbacks, setFeedbacks] = useState<FeedbackDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeedbacks = useCallback(async (showLoading = true) => {
    if (authLoading) return;
    if (!user || !user.emailVerified || !isAllowedDomain(user.email || '')) {
      setFeedbacks([]);
      setLoading(false);
      return;
    }

    try {
      if (showLoading) setLoading(true);
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/feedbacks', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch feedbacks: ${res.statusText}`);
      }

      const data = await res.json();
      setFeedbacks(data.feedbacks || []);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred while fetching feedbacks');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [user, authLoading]);

  useEffect(() => {
    fetchFeedbacks(true);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchFeedbacks(false);
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchFeedbacks]);

  return { feedbacks, loading, error, mutate: () => fetchFeedbacks(true) };
}

export async function updateFeedbackStatus(
  feedbackId: string,
  status: string,
  resolutionNotes: string,
  user: User
) {
  if (!user) throw new Error('User not authenticated');
  const token = await user.getIdToken();
  const res = await fetch('/api/admin/update-feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ feedbackId, status, resolutionNotes }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to update feedback');
  }

  return res.json();
}

export async function deleteFeedback(
  feedbackId: string,
  user: User
) {
  if (!user) throw new Error('User not authenticated');
  const token = await user.getIdToken();
  const res = await fetch('/api/admin/delete-feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ feedbackId }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete feedback');
  }

  return res.json();
}

export async function createFeedback(
  feedbackData: Record<string, unknown>,
  user: User
) {
  if (!user) throw new Error('User not authenticated');
  const token = await user.getIdToken();
  const res = await fetch('/api/admin/create-feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(feedbackData),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to create feedback');
  }

  return res.json();
}

export async function editFeedback(
  feedbackId: string,
  updateData: Record<string, unknown>,
  user: User
) {
  if (!user) throw new Error('User not authenticated');
  const token = await user.getIdToken();
  const res = await fetch('/api/admin/edit-feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ feedbackId, ...updateData }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to edit feedback');
  }

  return res.json();
}
