import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { prisma } from '@/lib/prisma';
import { success, unauthorized, serverError, validateOrigin, forbidden } from '@/lib/api-response';
import { isRateLimited } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

function esc(v: string | number | null | undefined): string {
  const s = String(v ?? '');
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 60, 60 * 1000)) {
      return new NextResponse('Too many requests', { status: 429 });
    }
    if (!validateOrigin(request)) return forbidden();
    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const purpose = url.searchParams.get('purpose') || url.searchParams.get('projectType');
    const agent = url.searchParams.get('agent');
    const search = url.searchParams.get('search')?.trim().toLowerCase();
    const format = url.searchParams.get('format') === 'json' ? 'json' : 'csv';

    // Business date (date field) is truth; createdAt is system fallback.
    // Filter from/to + search + agent in DB where possible, then refine by effective date in JS.
    const andClauses: Record<string, unknown>[] = [];
    if (purpose && purpose !== '__all') andClauses.push({ projectType: purpose });
    if (agent && agent !== '__all') andClauses.push({ OR: [{ assignedSalesRep: agent }, { agentName: agent }] });
    if (search) {
      andClauses.push({
        OR: [{ customerName: { contains: search } }, { location: { contains: search } }, { description: { contains: search } }],
      });
    }
    const where: Record<string, unknown> = {
      deletedAt: null,
      ...(andClauses.length ? { AND: andClauses } : {}),
    };

    const supportRows = await prisma.supportRevenue.findMany({
      where: where as never,
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    // Join Customer on customerName (case-insensitive) for BTS/MRR/email
    const customerNames = [...new Set(supportRows.map((r) => r.customerName).filter(Boolean) as string[])];
    const customers = customerNames.length
      ? await prisma.customer.findMany({
          where: { customerName: { in: customerNames }, deleted: false },
          select: { customerName: true, email: true, btsName: true, mrrTotal: true, lifecycle: true, city: true },
        })
      : [];
    const custMap = new Map<string, (typeof customers)[number]>();
    for (const c of customers) {
      if (c.customerName) custMap.set(c.customerName.toLowerCase().trim(), c);
    }

    // Effective date prefers the editable business date; falls back to createdAt.
    const effectiveDateStr = (r: (typeof supportRows)[number]): string => {
      if (r.date && /^\d{4}-\d{2}-\d{2}/.test(r.date)) return r.date.slice(0, 10);
      const ms = r.createdAt ? Number(r.createdAt) : null;
      return ms ? new Date(ms).toISOString().slice(0, 10) : '';
    };

    const inRange = (dateStr: string): boolean => {
      if (!from && !to) return true;
      if (!dateStr) return false;
      if (from && dateStr < from) return false;
      if (to && dateStr > to) return false;
      return true;
    };

    const mapped = supportRows
      .map((r) => {
        const c = r.customerName ? custMap.get(r.customerName.toLowerCase().trim()) : undefined;
        const createdMs = r.createdAt ? Number(r.createdAt) : null;
        const dateStr = effectiveDateStr(r);
        return {
          date: dateStr,
          customer: r.customerName || '',
          email: c?.email || '',
          bts: c?.btsName || r.location || '',
          mrr: c?.mrrTotal ?? '',
          purpose: r.projectType || r.saleKind || '',
          agent: r.assignedSalesRep || r.agentName || '',
          amount: r.totalAmount ?? 0,
          description: r.description || '',
          createdAt: createdMs,
        };
      })
      .filter((m) => inRange(m.date));

    if (format === 'json') {
      return success({ records: mapped, total: mapped.length });
    }

    const header = ['Date', 'Customer', 'Email', 'BTS', 'MRR', 'Purpose', 'Agent', 'Amount', 'Description'];
    const rows = mapped.map((m) => [
      m.date,
      m.customer,
      m.email,
      m.bts,
      String(m.mrr),
      m.purpose,
      m.agent,
      String(m.amount),
      m.description,
    ]);
    const csv = toCsv([header, ...rows]);

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="support-revenue_${from || 'all'}_to_${to || 'now'}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[support-revenue-export] GET error', { error: message });
    return serverError();
  }
}
