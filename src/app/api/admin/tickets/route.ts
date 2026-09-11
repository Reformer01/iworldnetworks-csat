import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, error, unauthorized, forbidden, serverError, notFound } from '@/lib/api-response';
import { validateOrigin } from '@/lib/api-response';
import { writeAuditLog } from '@/lib/audit-log';
import { displayAssigneeName } from '@/lib/staff';
import { ticketSchema } from '@/lib/validations/ticket';
import { logError } from '@/lib/logger';
import type { Ticket } from '@/lib/sales-types';
import {
  listTicketsDb,
  countTicketsDb,
  createTicketDb,
  updateTicketDb,
  softDeleteTicketDb,
  ticketFromRow,
  mirrorTicketCreated,
  mirrorTicketUpdated,
  mirrorTicketDeleted,
} from '@/lib/ticket-db';
import { prisma } from '@/lib/prisma';

function calculateSLABreached(createdAt: number, assignedAt?: number): boolean {
  if (!assignedAt) return true;
  return assignedAt - createdAt > 60000; // 1 minute = 60,000ms
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(request, 100, 60 * 1000)) {
      return error('Too many requests.', 429);
    }

    if (!validateOrigin(request)) return forbidden();

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) return unauthorized();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const assignedTo = searchParams.get('assignedTo');
    const createdBy = searchParams.get('createdBy');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') || '50')), 100);

    // '__unassigned__' sentinel selects tickets with no assignee.
    const filters = {
      status,
      assignedTo: assignedTo && assignedTo !== '__unassigned__' ? assignedTo : null,
      unassignedOnly: assignedTo === '__unassigned__',
      createdBy,
      search,
    };
    const [tickets, total] = await Promise.all([
      listTicketsDb(filters, pageSize, (page - 1) * pageSize),
      countTicketsDb(filters),
    ]);

    return success({
      tickets: tickets.map((t) => ({ ...t, assignedToName: displayAssigneeName(t.assignedTo) })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[tickets] GET error', { error: message });
    return serverError();
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (isRateLimited(request, 60, 60 * 1000)) {
      return error('Too many requests.', 429);
    }

    if (!validateOrigin(request)) return forbidden();

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) return unauthorized();

    const body = await request.json().catch(() => null);
    if (!body || !body.id || !body.action) {
      return error('Ticket ID and action required.', 400);
    }

    const { id, action, ...updates } = body;
    const row = await prisma.ticket.findUnique({ where: { id } });
    if (!row || row.deletedAt != null) {
      return notFound('Ticket not found.');
    }

    const data = ticketFromRow(row);
    const now = Date.now();
    const patch: Partial<Ticket> = { updatedAt: now };

    switch (action) {
      case 'assign':
        if (!updates.assignee) {
          return error('Assignee required for assign action.', 400);
        }
        patch.assignedTo = updates.assignee;
        patch.assignedAt = now;
        patch.status = 'assigned';
        patch.slaBreached = calculateSLABreached(data.createdAt, now);
        break;

      case 'start':
        if (data.status !== 'assigned') return error('Only assigned tickets can be started.', 400);
        patch.status = 'in_progress';
        break;

      case 'escalate':
        if (!updates.escalatedTo) {
          return error('Escalated to staff required for escalate action.', 400);
        }
        patch.escalatedTo = updates.escalatedTo;
        patch.escalatedAt = now;
        break;

      case 'resolve':
        patch.status = 'resolved';
        patch.resolvedAt = now;
        break;

      case 'close':
        patch.status = 'closed';
        patch.closedAt = now;
        break;

      case 'reopen':
        if (data.status !== 'resolved' && data.status !== 'closed') return error('Only resolved/closed tickets can be reopened.', 400);
        patch.status = 'open';
        (patch as Record<string, unknown>).reopenedAt = now;
        (patch as Record<string, unknown>).reopenedCount = ((data as unknown as { reopenedCount?: number }).reopenedCount ?? 0) + 1;
        break;

      case 'add_delay_reason':
        patch.delayReasons = [...(data.delayReasons || []), updates.reason];
        patch.delayNotes = updates.notes || data.delayNotes || '';
        break;

      case 'add_follow_up':
        patch.followUps = [
          ...(data.followUps || []),
          {
            id: randomUUID(),
            from: updates.from || admin.email,
            to: updates.to || '',
            message: updates.message || '',
            channel: updates.channel || 'system',
            timestamp: now,
          },
        ];
        break;

      default:
        return error(`Unknown action: ${action}`, 400);
    }

    const updated = await updateTicketDb(id, { ...data, ...patch });
    if (updated) {
      void mirrorTicketUpdated(id, patch);
    }

    await writeAuditLog({
      action: action,
      collection: 'tickets',
      recordId: id,
      userId: admin.uid,
      userEmail: admin.email,
      changes: updates,
      previousState: { ...data },
    });

    return success({ action: action, success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[tickets] PATCH error', { error: message });
    return serverError();
  }
}

export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(request, 30, 60 * 1000)) {
      return error('Too many requests.', 429);
    }

    if (!validateOrigin(request)) return forbidden();

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) return unauthorized();

    const body = await request.json().catch(() => null);
    if (!body) {
      return error('Invalid JSON body.', 400);
    }

    const validation = ticketSchema.safeParse(body);
    if (!validation.success) {
      return error('Validation failed.', 400, {
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const data = validation.data;
    const now = Date.now();
    const ticketData: Ticket = {
      ...data,
      ticketNumber: 0,
      status: 'open',
      createdAt: now,
      createdByAgent: admin.email,
      updatedAt: now,
      slaBreached: false,
      followUps: [],
    };

    const created = await createTicketDb(ticketData);
    void mirrorTicketCreated(created);

    await writeAuditLog({
      action: 'create',
      collection: 'tickets',
      recordId: created.id,
      userId: admin.uid,
      userEmail: admin.email,
      changes: { ...created },
    });

    return success(
      {
        id: created.id,
        ticketNumber: created.ticketNumber,
        message: 'Ticket created successfully',
      },
      201,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[tickets] POST error', { error: message });
    return serverError();
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (isRateLimited(request, 60, 60 * 1000)) {
      return error('Too many requests.', 429);
    }

    if (!validateOrigin(request)) return forbidden();

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) return unauthorized();

    const body = await request.json().catch(() => null);
    if (!body || !body.id) {
      return error('Ticket ID and updates required.', 400);
    }

    const { id, ...rest } = body;
    const ALLOWED_FIELDS = [
      'status',
      'assignedTo',
      'description',
      'delayReasons',
      'delayNotes',
      'followUps',
      'priority',
      'resolutionNotes',
      'firstTimeFix',
      'escalatedTo',
    ] as const;
    const updateData: Record<string, unknown> = { updatedAt: Date.now() };
    for (const key of ALLOWED_FIELDS) {
      if (key in rest) updateData[key] = rest[key];
    }

    const row = await prisma.ticket.findUnique({ where: { id } });
    if (!row || row.deletedAt != null) {
      return notFound('Ticket not found.');
    }
    const previousData = ticketFromRow(row);

    const updates: Partial<Ticket> = { ...updateData };

    // Auto-update status timestamps
    if (updates.status && updates.status !== previousData.status) {
      if (updates.status === 'resolved') {
        updates.resolvedAt = Date.now();
      } else if (updates.status === 'closed') {
        updates.closedAt = Date.now();
      }
    }

    // Update SLA status if assignment changed
    if (updates.assignedTo !== undefined && updates.assignedTo !== previousData.assignedTo) {
      if (updates.assignedTo) {
        updates.assignedAt = Date.now();
      } else {
        updates.assignedAt = undefined;
      }
      updates.slaBreached = calculateSLABreached(previousData.createdAt, updates.assignedAt);
    }

    const updated = await updateTicketDb(id, { ...previousData, ...updates });
    if (updated) {
      void mirrorTicketUpdated(id, updates);
    }

    await writeAuditLog({
      action: 'update',
      collection: 'tickets',
      recordId: id,
      userId: admin.uid,
      userEmail: admin.email,
      changes: updates,
      previousState: { ...previousData },
    });

    return success({});
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[tickets] PUT error', { error: message });
    return serverError();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (isRateLimited(request, 60, 60 * 1000)) {
      return error('Too many requests.', 429);
    }

    if (!validateOrigin(request)) return forbidden();

    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) return unauthorized();

    const body = await request.json().catch(() => null);
    if (!body || !body.id) {
      return error('Ticket ID required.', 400);
    }

    const row = await prisma.ticket.findUnique({ where: { id: body.id } });
    if (!row) {
      return notFound('Ticket not found.');
    }
    if (row.deletedAt != null) {
      return success({ action: 'already_deleted' });
    }

    const now = Date.now();
    await softDeleteTicketDb(body.id, now, now);
    void mirrorTicketDeleted(body.id, now, now);

    await writeAuditLog({
      action: 'delete',
      collection: 'tickets',
      recordId: body.id,
      userId: admin.uid,
      userEmail: admin.email,
      previousState: { ...ticketFromRow(row) },
    });

    return success({ action: 'deleted' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[tickets] DELETE error', { error: message });
    return serverError();
  }
}
