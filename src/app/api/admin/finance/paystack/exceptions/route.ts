import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, forbidden, tooMany, serverError, error, notFound, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { requireFinanceViewer, requireFinanceManager } from '@/lib/finance-access';

export const dynamic = 'force-dynamic';

const FETCH_CAP = 500;

function parsePage(raw: string | null): number | null {
  if (raw == null || raw === '') return 1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

function parsePerPage(raw: string | null): number | null {
  if (raw == null || raw === '') return 20;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(200, Math.max(1, Math.floor(n)));
}

function isValidEmail(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value);
}

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 120, 60_000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();
    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();
    const viewerBlock = requireFinanceViewer(admin);
    if (viewerBlock) return viewerBlock;

    const { searchParams } = new URL(request.url);
    const status = (searchParams.get('status') || '').trim();
    const kind = (searchParams.get('kind') || '').trim();
    const page = parsePage(searchParams.get('page'));
    if (page == null) return error('page must be an integer >= 1');
    const perPage = parsePerPage(searchParams.get('perPage'));
    if (perPage == null) return error('perPage must be a number');

    const rows = await prisma.reconciliationException.findMany({
      where: { ...(status ? { status } : {}), ...(kind ? { kind } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: FETCH_CAP,
    });

    const total = rows.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / perPage);
    const items = rows.slice((page - 1) * perPage, (page - 1) * perPage + perPage);
    return success({ page, perPage, total, totalPages, items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[paystack-exceptions] GET error', { error: message });
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 30, 60_000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();
    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();
    const managerBlock = requireFinanceManager(admin);
    if (managerBlock) return managerBlock;

    const body = (await request.json()) as Record<string, unknown>;
    const exceptionId = typeof body.exceptionId === 'string' ? body.exceptionId.trim() : '';
    if (!exceptionId) return error('exceptionId is required');
    const ownerEmail = typeof body.ownerEmail === 'string' ? body.ownerEmail.trim().toLowerCase() : '';
    if (!ownerEmail || !isValidEmail(ownerEmail)) return error('ownerEmail must be a valid email');

    let followUpAt: Date | undefined;
    if (body.followUpAt != null && body.followUpAt !== '') {
      const parsed = new Date(String(body.followUpAt));
      if (Number.isNaN(parsed.getTime())) return error('followUpAt must be a valid date');
      followUpAt = parsed;
    }
    const note = typeof body.note === 'string' ? body.note.slice(0, 191) : '';

    const existing = await prisma.reconciliationException.findUnique({ where: { id: exceptionId } });
    if (!existing) return notFound('Exception not found.');

    const history = Array.isArray(existing.history) ? [...(existing.history as unknown[])] : [];
    history.push({ by: admin.email, at: new Date().toISOString(), text: note });

    const updated = await prisma.reconciliationException.update({
      where: { id: exceptionId },
      data: { ownerEmail, ...(followUpAt ? { followUpAt } : {}), history: history as unknown as never },
    });
    return success(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[paystack-exceptions] POST error', { error: message });
    return serverError();
  }
}
