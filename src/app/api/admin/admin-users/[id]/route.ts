import { NextRequest } from 'next/server';
import { verifySuperAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, forbidden, tooMany, serverError, error, notFound, validateOrigin } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (isRateLimited(request, 20, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifySuperAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const role = body?.role?.trim();
    const name = body?.name?.trim();

    if (role && !['super_admin', 'editor', 'viewer'].includes(role)) return error('Invalid role');

    const target = await prisma.adminUser.findUnique({ where: { id } });
    if (!target) return notFound();

    // Prevent self-demotion
    if (target.email === admin.email && role && role !== 'super_admin') {
      return error('Cannot demote yourself');
    }

    const data: Record<string, unknown> = {};
    if (role) data.role = role;
    if (name) data.name = name;

    const updated = await prisma.adminUser.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, role: true, updatedAt: true },
    });

    await writeAuditLog({
      action: 'update',
      collection: 'admin_users',
      recordId: updated.id,
      userId: admin.uid,
      userEmail: admin.email,
      changes: { role: updated.role, name: updated.name },
      previousState: { role: target.role, name: target.name },
    });

    return success({ user: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return serverError();
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (isRateLimited(request, 5, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifySuperAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const { id } = await params;
    const target = await prisma.adminUser.findUnique({ where: { id } });
    if (!target) return notFound();

    // Prevent self-deletion
    if (target.email === admin.email) {
      return error('Cannot delete yourself');
    }

    await prisma.adminUser.delete({ where: { id } });

    await writeAuditLog({
      action: 'delete',
      collection: 'admin_users',
      recordId: target.id,
      userId: admin.uid,
      userEmail: admin.email,
      previousState: { email: target.email, role: target.role, name: target.name },
    });

    return success({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return serverError();
  }
}
