import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, forbidden, tooMany, serverError, error, notFound, validateOrigin } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { requireFinanceViewer, requireFinanceManager } from '@/lib/finance-access';

export const dynamic = 'force-dynamic';

const LIST_CAP = 200;
const SAVED_VIEW_SCOPES = ['transactions', 'reconciliation', 'customers', 'overview', 'reports'];
const SAVED_VIEW_MODES = ['private', 'shared'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateSavedView(body: Record<string, unknown>): string | null {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return 'name is required';
  if (name.length > 191) return 'name must be at most 191 characters';
  if (typeof body.scope !== 'string' || !SAVED_VIEW_SCOPES.includes(body.scope.trim()))
    return `scope must be one of: ${SAVED_VIEW_SCOPES.join(', ')}`;
  if (!isPlainObject(body.filters)) return 'filters must be an object';
  if (typeof body.mode !== 'string' || !SAVED_VIEW_MODES.includes(body.mode.trim()))
    return `mode must be one of: ${SAVED_VIEW_MODES.join(', ')}`;
  return null;
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
    const scope = (searchParams.get('scope') || '').trim();
    const views = await prisma.paystackSavedView.findMany({
      ...(scope ? { where: { scope } } : {}),
      orderBy: { updatedAt: 'desc' },
      take: LIST_CAP,
    });
    return success({ items: views });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[paystack-saved-views] GET error', { error: message });
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
    const invalid = validateSavedView(body);
    if (invalid) return error(invalid);

    const created = await prisma.paystackSavedView.create({
      data: {
        name: (body.name as string).trim().slice(0, 191),
        ownerEmail: admin.email,
        scope: (body.scope as string).trim(),
        filters: body.filters as unknown as never,
        grouping: typeof body.grouping === 'string' ? body.grouping.slice(0, 191) : null,
        metric: typeof body.metric === 'string' ? body.metric.slice(0, 191) : null,
        mode: (body.mode as string).trim(),
      },
    });
    return success(created);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[paystack-saved-views] POST error', { error: message });
    return serverError();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (isRateLimited(request, 30, 60_000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();
    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();
    const managerBlock = requireFinanceManager(admin);
    if (managerBlock) return managerBlock;

    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) return error('id is required');
    const invalid = validateSavedView(body);
    if (invalid) return error(invalid);

    const existing = await prisma.paystackSavedView.findUnique({ where: { id } });
    if (!existing) return notFound('Saved view not found.');

    const updated = await prisma.paystackSavedView.update({
      where: { id },
      data: {
        name: (body.name as string).trim().slice(0, 191),
        scope: (body.scope as string).trim(),
        filters: body.filters as unknown as never,
        grouping: typeof body.grouping === 'string' ? body.grouping.slice(0, 191) : null,
        metric: typeof body.metric === 'string' ? body.metric.slice(0, 191) : null,
        mode: (body.mode as string).trim(),
      },
    });
    return success(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[paystack-saved-views] PATCH error', { error: message });
    return serverError();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (isRateLimited(request, 30, 60_000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();
    const admin = await verifyAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();
    const managerBlock = requireFinanceManager(admin);
    if (managerBlock) return managerBlock;

    const { searchParams } = new URL(request.url);
    const id = (searchParams.get('id') || '').trim();
    if (!id) return error('id is required');

    const existing = await prisma.paystackSavedView.findUnique({ where: { id } });
    if (!existing) return notFound('Saved view not found.');

    await prisma.paystackSavedView.delete({ where: { id } });
    return success({ id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[paystack-saved-views] DELETE error', { error: message });
    return serverError();
  }
}
