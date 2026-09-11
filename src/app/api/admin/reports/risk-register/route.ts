import { NextRequest } from 'next/server';
import { z } from 'zod';
import { verifySuperAdminToken } from '@/lib/admin-auth';
import { isSuperAdmin } from '@/lib/admin-config';
import { forbidden, unauthorized, success, error, validateOrigin } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// ─── Customer Risk Register ─────────────────────────────────────────────
// Derived rows: active customers flagged by health score tier or overdue
// payments, sorted by MRR at risk. Editable fields (action taken, outcome,
// next review, owner) persist in RiskRegisterEntry per customer.

const patchSchema = z.object({
  customerId: z.string().min(1),
  customerName: z.string().max(191).optional(),
  mrr: z.number().nonnegative().optional(),
  riskLevel: z.enum(['High', 'Medium', 'Low']).optional(),
  reason: z.string().max(1000).optional(),
  actionTaken: z.string().max(1000).optional(),
  outcome: z.string().max(1000).optional(),
  nextReview: z.string().max(20).optional(),
  owner: z.string().max(191).optional(),
});

interface DerivedRisk {
  customerId: string;
  customerName: string | null;
  city: string | null;
  lifecycle: string | null;
  mrr: number;
  tier: string | null;
  score: number | null;
  overdueDays: number;
  riskLevel: 'High' | 'Medium' | 'Low';
  reason: string;
}

function deriveRiskLevel(tier: string | null, overdueDays: number): 'High' | 'Medium' | 'Low' {
  if (tier === 'critical' || tier === 'churning' || overdueDays > 30) return 'High';
  if (tier === 'at-risk' || overdueDays > 0) return 'Medium';
  return 'Low';
}

export async function GET(request: NextRequest) {
  const admin = await verifySuperAdminToken(request.headers.get('authorization'));
  if (!admin) return unauthorized();
  if (!isSuperAdmin(admin.email)) return forbidden();

  // Latest health score per customer + active customers with overdue info.
  const [latestScores, overdueCustomers, savedEntries] = await Promise.all([
    prisma.$queryRaw<Array<{ customerId: string; score: number; tier: string }>>`
      SELECT customerId, score, tier
      FROM (
        SELECT customerId, score, tier,
               ROW_NUMBER() OVER (PARTITION BY customerId ORDER BY calculatedAt DESC) as rn
        FROM CustomerHealthScore
      ) latest
      WHERE rn = 1
    `,
    prisma.customer.findMany({
      where: { deleted: false, lifecycle: { notIn: ['churned', 'lost'] } },
      select: { id: true, customerName: true, city: true, lifecycle: true, mrrTotal: true, overdueInfo: true },
    }),
    prisma.riskRegisterEntry.findMany(),
  ]);

  const scoreByCustomer = new Map(latestScores.map((s) => [s.customerId, s]));

  const derived = new Map<string, DerivedRisk>();
  for (const c of overdueCustomers) {
    const hs = scoreByCustomer.get(c.id) ?? null;
    const info = (c.overdueInfo ?? null) as { overdueDays?: number } | null;
    const overdueDays = typeof info?.overdueDays === 'number' ? info.overdueDays : 0;
    const atRiskTier = hs !== null && hs.tier !== 'healthy' && hs.tier !== 'lost';

    if (!atRiskTier && overdueDays <= 0) continue;

    const reasons: string[] = [];
    if (overdueDays > 0) reasons.push(`Invoice overdue ${overdueDays} day${overdueDays === 1 ? '' : 's'}`);
    if (hs !== null && hs.tier !== 'healthy') reasons.push(`Health score ${hs.score} (${hs.tier})`);

    derived.set(c.id, {
      customerId: c.id,
      customerName: c.customerName,
      city: c.city,
      lifecycle: c.lifecycle,
      mrr: c.mrrTotal ?? 0,
      tier: hs?.tier ?? null,
      score: hs?.score ?? null,
      overdueDays,
      riskLevel: deriveRiskLevel(hs?.tier ?? null, overdueDays),
      reason: reasons.join(' · ') || 'Flagged by retention engine',
    });
  }

  const entriesByCustomer = new Map(savedEntries.map((e) => [e.customerId, e]));

  const rows = Array.from(derived.values())
    .sort((a, b) => b.mrr - a.mrr)
    .slice(0, 200)
    .map((d) => {
      const e = entriesByCustomer.get(d.customerId);
      return {
        ...d,
        actionTaken: e?.actionTaken ?? '',
        outcome: e?.outcome ?? '',
        nextReview: e?.nextReview ?? '',
        owner: e?.owner ?? '',
        updatedAt: e?.updatedAt ?? null,
      };
    });

  return success({ rows, total: derived.size });
}

// Persist editable risk-register fields for one customer.
export async function PATCH(request: NextRequest) {
  if (!validateOrigin(request)) return forbidden('Invalid origin.');
  const admin = await verifySuperAdminToken(request.headers.get('authorization'));
  if (!admin) return unauthorized();
  if (!isSuperAdmin(admin.email)) return forbidden();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error('Invalid JSON body.');
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return error('Validation failed.', 400, { errors: parsed.error.flatten().fieldErrors });
  }
  const { customerId, ...fields } = parsed.data;

  const existing = await prisma.riskRegisterEntry.findUnique({ where: { customerId } });
  if (existing) {
    await prisma.riskRegisterEntry.update({ where: { customerId }, data: fields });
  } else {
    await prisma.riskRegisterEntry.create({ data: { customerId, ...fields } });
  }

  return success({ customerId, saved: true });
}
