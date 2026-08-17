import { useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import { useAuth, useUser } from '@/firebase';

export interface ShareLinkResult {
  token: string;
  url: string;
  popupUrl: string;
}

export interface ShareLinkInput {
  customerName: string;
  customerEmail: string;
  servicePlan?: string;
  location?: string;
  serviceDate?: string;
  subject: string;
  staffName?: string;
}

async function getAuthToken(user: User) {
  const token = await user.getIdToken();
  if (!token) throw new Error('Not authenticated');
  return token;
}

export async function createShareLink(user: User, input: ShareLinkInput): Promise<ShareLinkResult> {
  const token = await getAuthToken(user);
  const response = await fetch('/api/admin/feedback-share', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to create feedback link');
  }
  return data.data as ShareLinkResult;
}

export function useFeedbackShare() {
  const auth = useAuth();
  const { user } = useUser(auth);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ShareLinkResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (input: ShareLinkInput) => {
      if (!user) {
        setError('Not authenticated');
        return null;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await createShareLink(user, input);
        setResult(res);
        return res;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [user],
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { user, loading, result, error, generate, reset };
}
