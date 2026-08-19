import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    campaign: { findUnique: vi.fn() },
    customer: { findMany: vi.fn(), count: vi.fn() },
    emailJob: { groupBy: vi.fn() },
  },
}));

const mockQueue = vi.hoisted(() => ({ add: vi.fn() }));

vi.mock('@/lib/queues/email-queue', () => ({
  getEmailQueue: vi.fn(() => mockQueue),
  getPriorityForType: vi.fn(() => 1),
}));

vi.mock('@/lib/repositories/email-job-repo', () => ({
  createEmailJob: vi.fn(async () => 'job-1'),
  setEmailJobBullJobId: vi.fn(async () => {}),
  markEmailJobFailed: vi.fn(async () => {}),
}));

import { prisma } from '@/lib/prisma';
import { getEmailQueue } from '@/lib/queues/email-queue';
import { createEmailJob, setEmailJobBullJobId, markEmailJobFailed } from '@/lib/repositories/email-job-repo';
import {
  buildAudienceWhere,
  resolveAudienceIds,
  countAudience,
  sendCampaign,
  getCampaignStats,
  finalizeCampaignStatus,
} from '../campaign-service';

const mockedPrisma = vi.mocked(prisma, true);
const mockedCreateEmailJob = vi.mocked(createEmailJob);
const mockedSetBullJobId = vi.mocked(setEmailJobBullJobId);
const mockedMarkFailed = vi.mocked(markEmailJobFailed);

beforeEach(() => {
  vi.clearAllMocks();
  mockQueue.add.mockResolvedValue({ id: 'bull-1' });
});

describe('buildAudienceWhere', () => {
  it('all: only excludes deleted, opted-out, invalid, missing emails', () => {
    const where = buildAudienceWhere({ type: 'all' });
    expect(where).toMatchObject({ deleted: false, emailOptOut: false, emailInvalid: false });
  });

  it('lifecycle: filters by values on top of base exclusions', () => {
    const where = buildAudienceWhere({ type: 'lifecycle', values: ['active', 'suspended'] });
    expect(where).toMatchObject({ lifecycle: { in: ['active', 'suspended'] } });
    expect(where).toMatchObject({ deleted: false });
  });

  it('empty values: matches nothing', () => {
    const where = buildAudienceWhere({ type: 'city', values: [] });
    expect(where).toMatchObject({ id: { in: [] } });
  });
});

describe('countAudience', () => {
  it('counts customers matching the built where clause', async () => {
    mockedPrisma.customer.count.mockResolvedValue(42);
    await expect(countAudience({ type: 'all' })).resolves.toBe(42);
    expect(mockedPrisma.customer.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deleted: false }) }),
    );
  });
});

describe('resolveAudienceIds', () => {
  it('returns customer ids', async () => {
    mockedPrisma.customer.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }] as never);
    await expect(resolveAudienceIds({ type: 'all' })).resolves.toEqual(['c1', 'c2']);
  });
});

describe('sendCampaign', () => {
  it('throws when campaign does not exist', async () => {
    mockedPrisma.campaign.findUnique.mockResolvedValue(null);
    await expect(sendCampaign('nope')).rejects.toThrow('Campaign not found');
  });

  it('throws when campaign is not a draft', async () => {
    mockedPrisma.campaign.findUnique.mockResolvedValue({ id: 'c1', status: 'sent' } as never);
    await expect(sendCampaign('c1')).rejects.toThrow('status: sent');
  });

  it('creates one EmailJob + one queue job per recipient and returns the count', async () => {
    mockedPrisma.campaign.findUnique.mockResolvedValue({
      id: 'c1',
      status: 'draft',
      subject: 'Hello',
      html: '<p>Hi</p>',
      text: 'Hi',
      audienceJson: { type: 'all' },
    } as never);
    mockedPrisma.customer.findMany.mockResolvedValue([
      { id: 'c1', email: 'a@x.com', name: 'Alice' },
      { id: 'c2', email: 'b@x.com', name: 'Bob' },
      { id: 'c3', email: null, name: 'No Email' },
    ] as never);

    const count = await sendCampaign('c1');

    expect(count).toBe(3);
    expect(mockedCreateEmailJob).toHaveBeenCalledTimes(3);
    expect(mockQueue.add).toHaveBeenCalledTimes(3);
    expect(mockedSetBullJobId).toHaveBeenCalledTimes(3);
    expect(mockedMarkFailed).not.toHaveBeenCalled();
  });

  it('marks a row failed when enqueue fails after row creation', async () => {
    mockedPrisma.campaign.findUnique.mockResolvedValue({
      id: 'c1',
      status: 'draft',
      subject: 'Hello',
      html: '',
      text: 'Hi',
      audienceJson: { type: 'all' },
    } as never);
    mockedPrisma.customer.findMany.mockResolvedValue([{ id: 'c1', email: 'a@x.com', name: 'Alice' }] as never);
    mockedCreateEmailJob.mockResolvedValue('job-x');
    mockQueue.add.mockRejectedValue(new Error('redis down'));

    await sendCampaign('c1');

    expect(mockedMarkFailed).toHaveBeenCalledWith('job-x', 'redis down', 0);
  });
});

describe('getCampaignStats / finalizeCampaignStatus', () => {
  it('derives counts from grouped EmailJob statuses', async () => {
    mockedPrisma.emailJob.groupBy.mockResolvedValue([
      { status: 'pending', _count: { _all: 10 } },
      { status: 'sent', _count: { _all: 90 } },
    ] as never);
    await expect(getCampaignStats('c1')).resolves.toMatchObject({ total: 100, pending: 10, sent: 90, failed: 0 });
  });

  it('derives sent when every job sent', async () => {
    mockedPrisma.emailJob.groupBy.mockResolvedValue([{ status: 'sent', _count: { _all: 5 } }] as never);
    await expect(finalizeCampaignStatus({ id: 'c1', status: 'sending', audienceCount: 5 })).resolves.toBe('sent');
  });

  it('derives partial when some failed', async () => {
    mockedPrisma.emailJob.groupBy.mockResolvedValue([
      { status: 'sent', _count: { _all: 4 } },
      { status: 'failed', _count: { _all: 1 } },
    ] as never);
    await expect(finalizeCampaignStatus({ id: 'c1', status: 'sending', audienceCount: 5 })).resolves.toBe('partial');
  });

  it('leaves draft/cancelled untouched', async () => {
    await expect(finalizeCampaignStatus({ id: 'c1', status: 'draft', audienceCount: 0 })).resolves.toBe('draft');
    expect(mockedPrisma.emailJob.groupBy).not.toHaveBeenCalled();
  });
});
