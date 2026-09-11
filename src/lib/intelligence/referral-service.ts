/**
 * Referral Program Service
 *
 * Mechanics:
 * - Each customer gets a unique referral code (IW-XXXXXXXX)
 * - When a new customer signs up with a referral code:
 *   - Referrer gets ₦5,000 account credit (configurable)
 *   - Referee gets first month at 20% discount
 * - Tracking: ReferralProgram table records referrer, referee, status
 *
 * Code format: IW-XXXXXXXX (8 alphanumeric chars, uppercase)
 */

import { prisma } from '@/lib/prisma';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
const CODE_LENGTH = 8;
const DEFAULT_REWARD = 5000;

/**
 * Generate a unique referral code.
 * Retries up to 5 times on collision.
 */
export async function generateReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    let code = 'IW-';
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    const exists = await prisma.referralProgram.findUnique({
      where: { referralCode: code },
    });
    if (!exists) return code;
  }
  throw new Error('Failed to generate unique referral code after 5 attempts');
}

/**
 * Create a referral code for an existing customer.
 */
export async function createReferralForCustomer(
  customerId: string,
  rewardAmount: number = DEFAULT_REWARD,
): Promise<{ referralCode: string; id: string }> {
  // Check if customer already has a code
  const existing = await prisma.referralProgram.findFirst({
    where: { referrerId: customerId, status: 'active' },
  });
  if (existing) {
    return { referralCode: existing.referralCode, id: existing.id };
  }

  const code = await generateReferralCode();
  const referral = await prisma.referralProgram.create({
    data: {
      referrerId: customerId,
      referralCode: code,
      rewardAmount,
      status: 'active',
    },
  });

  // Also update the Customer record
  await prisma.customer.update({
    where: { id: customerId },
    data: { referralCode: code },
  });

  return { referralCode: code, id: referral.id };
}

/**
 * Redeem a referral code when a new customer signs up.
 * Returns the referral record if successful, null if code invalid/expired.
 */
export async function redeemReferralCode(params: {
  referralCode: string;
  refereeId: string;
  refereeName?: string;
  refereePhone?: string;
}): Promise<{
  success: boolean;
  referralId?: string;
  referrerId?: string;
  rewardAmount?: number;
  error?: string;
}> {
  const { referralCode, refereeId, refereeName, refereePhone } = params;

  // Find the referral
  const referral = await prisma.referralProgram.findUnique({
    where: { referralCode: referralCode.toUpperCase() },
  });

  if (!referral) {
    return { success: false, error: 'Invalid referral code' };
  }

  if (referral.status !== 'active') {
    return { success: false, error: 'This referral code has already been used or expired' };
  }

  if (referral.referrerId === refereeId) {
    return { success: false, error: 'You cannot refer yourself' };
  }

  // Mark as completed
  const updated = await prisma.referralProgram.update({
    where: { id: referral.id },
    data: {
      refereeId,
      refereeName,
      refereePhone,
      status: 'completed',
      completedAt: new Date(),
    },
  });

  return {
    success: true,
    referralId: updated.id,
    referrerId: updated.referrerId,
    rewardAmount: updated.rewardAmount,
  };
}

/**
 * Get referral leaderboard — top referrers by completed referral count.
 */
export async function getReferralLeaderboard(limit: number = 20) {
  const leaderboard = await prisma.referralProgram.groupBy({
    by: ['referrerId'],
    where: { status: 'completed' },
    _count: { id: true },
    _sum: { rewardAmount: true },
    orderBy: { _count: { id: 'desc' } },
    take: limit,
  });

  // Fetch customer names
  const referrerIds = leaderboard.map((l) => l.referrerId);
  const customers = await prisma.customer.findMany({
    where: { id: { in: referrerIds } },
    select: { id: true, customerName: true, phone: true, city: true },
  });
  const customerMap = new Map(customers.map((c) => [c.id, c]));

  return leaderboard.map((l) => ({
    referrerId: l.referrerId,
    customerName: customerMap.get(l.referrerId)?.customerName ?? 'Unknown',
    phone: customerMap.get(l.referrerId)?.phone ?? null,
    city: customerMap.get(l.referrerId)?.city ?? null,
    referralCount: l._count.id,
    totalReward: l._sum.rewardAmount ?? 0,
  }));
}

/**
 * Get referral funnel metrics — how many codes created, shared, redeemed, active.
 */
export async function getReferralFunnel() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [total, active, completed, expired, recentCompleted, totalRewardSum] = await Promise.all([
    prisma.referralProgram.count(),
    prisma.referralProgram.count({ where: { status: 'active' } }),
    prisma.referralProgram.count({ where: { status: 'completed' } }),
    prisma.referralProgram.count({ where: { status: 'expired' } }),
    prisma.referralProgram.count({ where: { status: 'completed', completedAt: { gte: thirtyDaysAgo } } }),
    prisma.referralProgram.aggregate({ _sum: { rewardAmount: true }, where: { status: 'completed', rewardFulfilled: true } }),
  ]);

  // Revenue attributed to referrals (sum of MRR of referred customers)
  const referredCustomerIds = await prisma.referralProgram.findMany({
    where: { status: 'completed', refereeId: { not: null } },
    select: { refereeId: true },
  });
  const ids = referredCustomerIds.map((r) => r.refereeId!).filter(Boolean);
  const referredRevenue =
    ids.length > 0
      ? await prisma.customer.aggregate({
          _sum: { mrrTotal: true },
          where: { id: { in: ids }, deleted: false },
        })
      : { _sum: { mrrTotal: 0 } };

  return {
    totalCodes: total,
    activeCodes: active,
    completedReferrals: completed,
    expiredCodes: expired,
    recentCompletions: recentCompleted, // last 30 days
    totalRewardsPaid: totalRewardSum._sum.rewardAmount ?? 0,
    referredRevenue: referredRevenue._sum.mrrTotal ?? 0,
    conversionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

/**
 * Get all referrals with optional status filter.
 */
export async function listReferrals(params: { status?: string; limit?: number; offset?: number }) {
  const { status, limit = 50, offset = 0 } = params;

  const where = status ? { status } : {};

  const [referrals, total] = await Promise.all([
    prisma.referralProgram.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.referralProgram.count({ where }),
  ]);

  // Fetch referrer and referee names
  const allIds = new Set<string>();
  for (const r of referrals) {
    allIds.add(r.referrerId);
    if (r.refereeId) allIds.add(r.refereeId);
  }
  const customers = await prisma.customer.findMany({
    where: { id: { in: Array.from(allIds) } },
    select: { id: true, customerName: true, phone: true, city: true },
  });
  const customerMap = new Map(customers.map((c) => [c.id, c]));

  return {
    referrals: referrals.map((r) => ({
      ...r,
      referrerName: customerMap.get(r.referrerId)?.customerName ?? 'Unknown',
      referrerPhone: customerMap.get(r.referrerId)?.phone ?? null,
      city: customerMap.get(r.referrerId)?.city ?? null,
      refereeName: r.refereeId ? (customerMap.get(r.refereeId)?.customerName ?? r.refereeName) : null,
    })),
    total,
  };
}
