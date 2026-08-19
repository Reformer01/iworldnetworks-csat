import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@/firebase';
import { isAllowedDomain } from '@/lib/admin-config';
import type { User } from 'firebase/auth';
import type { Prisma } from '@prisma/client';

export interface CampaignRecord {
  id: string;
  name: string;
  type: string;
  subject: string;
  html: string | null;
  text: string;
  audienceJson: Prisma.JsonValue;
  audienceCount: number;
  status: string;
  sentAt: number | null;
  createdBy: string;
  approvedAt: number | null;
  approvedBy: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CampaignSegmentOptions {
  lifecycle: string[];
  city: string[];
  status: string[];
  servicePlan: string[];
  bts: string[];
}

interface CampaignsResponse {
  records: CampaignRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function useCampaigns(params?: { status?: string; search?: string; page?: number; pageSize?: number }) {
  const auth = useAuth();
  const { user, loading: authLoading } = useUser(auth);
  const [records, setRecords] = useState<CampaignRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCampaigns = useCallback(
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
        if (params?.status) sp.set('status', params.status);
        if (params?.search) sp.set('search', params.search);
        if (params?.page) sp.set('page', String(params.page));
        if (params?.pageSize) sp.set('pageSize', String(params.pageSize));
        const qs = sp.toString();
        const res = await fetch(`/api/admin/campaigns${qs ? `?${qs}` : ''}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed: ${res.statusText}`);
        const result = await res.json();
        const responseData = result.data as CampaignsResponse | undefined;
        setRecords(responseData?.records || []);
        setTotal(responseData?.total || 0);
        setTotalPages(responseData?.totalPages || 1);
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error fetching campaigns');
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [user, authLoading, params?.status, params?.search, params?.page, params?.pageSize],
  );

  useEffect(() => {
    fetchCampaigns(true);
    return () => {};
  }, [fetchCampaigns]);

  return { records, total, totalPages, loading, error, mutate: () => fetchCampaigns(true) };
}

async function authedFetch(user: User, url: string, init?: RequestInit) {
  const token = await user.getIdToken();
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.statusText}`);
  return data?.data;
}

export async function createCampaign(
  user: User,
  input: { name: string; type?: string; subject: string; html?: string; text: string; audience: unknown },
): Promise<{ id: string }> {
  return authedFetch(user, '/api/admin/campaigns', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateCampaign(
  user: User,
  id: string,
  input: Partial<{ name: string; subject: string; html: string; text: string; audience: unknown }>,
): Promise<CampaignRecord> {
  return authedFetch(user, `/api/admin/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export async function fetchCampaign(user: User, id: string): Promise<CampaignRecord> {
  return authedFetch(user, `/api/admin/campaigns/${id}`);
}

export async function campaignAction(
  user: User,
  id: string,
  action: 'send' | 'cancel' | 'retry',
): Promise<{ status: string; recipients?: number; retried?: number }> {
  return authedFetch(user, `/api/admin/campaigns/${id}`, { method: 'POST', body: JSON.stringify({ action }) });
}

export async function fetchSegments(user: User): Promise<CampaignSegmentOptions> {
  return authedFetch(user, '/api/admin/campaigns/segments');
}

export async function fetchAudienceCount(user: User, audience: unknown): Promise<number> {
  const data = await authedFetch(user, '/api/admin/campaigns/segments?count=1&' + queryForAudience(audience));
  return data?.count ?? 0;
}

function queryForAudience(audience: unknown): string {
  if (!audience || typeof audience !== 'object' || !('type' in audience)) return 'type=all';
  const a = audience as { type: string; values?: string[] };
  if (a.type === 'all') return 'type=all';
  return `type=${encodeURIComponent(a.type)}&values=${encodeURIComponent((a.values || []).join(','))}`;
}
