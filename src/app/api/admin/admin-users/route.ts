import { NextRequest } from 'next/server';
import { verifySuperAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, unauthorized, forbidden, tooMany, serverError, error, validateOrigin } from '@/lib/api-response';
import { prisma } from '@/lib/prisma';
import { writeAuditLog } from '@/lib/audit-log';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 60, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifySuperAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const users = await prisma.adminUser.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
    });

    return success({ users });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 10, 60 * 1000)) return tooMany();
    if (!validateOrigin(request)) return forbidden();

    const admin = await verifySuperAdminToken(request.headers.get('authorization'));
    if (!admin) return unauthorized();

    const body = await request.json().catch(() => null);
    const email = body?.email?.toLowerCase().trim();
    const name = body?.name?.trim();
    const role = body?.role?.trim() || 'editor';
    const password = body?.password;

    if (!email || !email.includes('@')) return error('Valid email required');
    if (!['super_admin', 'editor', 'viewer'].includes(role)) return error('Invalid role');
    if (!password || password.length < 8) return error('Password must be at least 8 characters');

    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (existing) return error('Email already exists');

    // stdlib scrypt (no new dependency): scrypt:<salt-hex>:<key-hex>.
    const { randomBytes, scrypt: scryptCb } = await import('node:crypto');
    const { promisify } = await import('node:util');
    const scrypt = promisify(scryptCb);
    const salt = randomBytes(16).toString('hex');
    const key = (await scrypt(password, salt, 64)) as Buffer;
    const hashed = `scrypt:${salt}:${key.toString('hex')}`;

    const user = await prisma.adminUser.create({
      data: { email, name, role, password: hashed },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    await writeAuditLog({
      action: 'create',
      collection: 'admin_users',
      recordId: user.id,
      userId: admin.uid,
      userEmail: admin.email,
      changes: { email: user.email, role: user.role, name: user.name },
    });

    return success({ user });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return serverError();
  }
}
