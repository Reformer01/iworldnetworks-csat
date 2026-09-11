import { NextRequest } from 'next/server';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { unauthorized, tooMany, forbidden, serverError, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const FETCH_LIMIT = 10000;

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 30, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();
    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const customers = (await prisma.customer.findMany({
      where: { deleted: false, matchState: 'pending' } as never,
      orderBy: { customerName: 'asc' },
      take: FETCH_LIMIT,
    })) as unknown as Array<{
      customerId: string;
      customerName: string | null;
      email: string | null;
      phone: string | null;
      city: string | null;
      street: string | null;
      status: string | null;
      lifecycle: string | null;
      accountType: string | null;
      category: string | null;
      servicePlan: string | null;
      mrrTotal: number | null;
      btsName: string | null;
      matchState: string | null;
    }>;

    const headers = [
      'Customer ID',
      'Customer Name',
      'Email',
      'Phone',
      'City',
      'Street',
      'Status',
      'Lifecycle',
      'Account Type',
      'Category',
      'Service Plan',
      'MRR (Splynx)',
      'MRR Effective',
      'Current BTS',
      'Region (derived)',
      'Match State',
    ];

    const planMrr: Record<string, number> = {
      'H-Lite': 27500,
      'H-Max': 36500,
      'H-Pro': 43500,
      'U-Lite': 32500,
      'U-Max': 43500,
      'U-Pro': 58000,
      'N-10K': 10000,
      'N-15K': 15000,
      'N-22-5K': 22500,
    };

    const csvRows = customers.map((r) => {
      const rawMrr = r.mrrTotal ?? 0;
      const fallback = r.servicePlan ? (planMrr[r.servicePlan] ?? 0) : 0;
      const effective = rawMrr > 0 ? rawMrr : fallback;
      const region = deriveRegion(r.city, r.btsName);
      return [
        escapeCsv(r.customerId || ''),
        escapeCsv(r.customerName || ''),
        escapeCsv(r.email || ''),
        escapeCsv(r.phone || ''),
        escapeCsv(r.city || ''),
        escapeCsv(r.street || ''),
        r.status || '',
        r.lifecycle || '',
        r.accountType || '',
        r.category || '',
        escapeCsv(r.servicePlan || ''),
        rawMrr,
        effective,
        escapeCsv(r.btsName || ''),
        region,
        r.matchState || '',
      ];
    });

    const csv = [headers.join(','), ...csvRows.map((r) => r.join(','))].join('\n');

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="bts-review-pending.csv"',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[matching-pending-export] GET error', { error: message });
    return serverError();
  }
}

function deriveRegion(city: string | null, btsName: string | null): string {
  const c = (city || '').toLowerCase();
  const b = (btsName || '').toLowerCase();
  const hay = `${c} ${b}`;
  if (hay.includes('akure')) return 'Ondo';
  if (hay.includes('osogbo') || hay.includes('oshogbo') || hay.includes('osun')) return 'Osun';
  if (hay.includes('abeokuta') || hay.includes('shagamu') || hay.includes('ota') || hay.includes('ijebu') || hay.includes('orile') || hay.includes('sagamu')) return 'Ogun';
  if (hay.includes('ibadan') || hay.includes('oriye') || hay.includes('mowe') || hay.includes('ibo') || hay.includes('warewa')) return 'Oyo';
  if (!c && !b) return 'Unknown';
  return 'Unknown';
}

function escapeCsv(value: string): string {
  if (/^[=+@]|^-[^0-9]|^\t/.test(value)) value = `'${value}`;
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
