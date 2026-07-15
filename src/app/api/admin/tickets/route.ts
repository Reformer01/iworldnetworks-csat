import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifyAdminToken } from '@/lib/admin-auth';
import { isRateLimited } from '@/lib/rate-limit';
import { success, error, unauthorized, forbidden, serverError } from '@/lib/api-response';
import { validateOrigin } from '@/lib/api-response';
import { writeAuditLog } from '@/lib/audit-log';
import { ticketSchema } from '@/lib/validations/ticket';
import { logError } from '@/lib/logger';
import type { Ticket, TicketStatus } from '@/lib/sales-types';

function calculateSLABreached(createdAt: number, assignedAt?: number): boolean {
  if (!assignedAt) return true;
  return assignedAt - createdAt > 60000; // 1 minute = 60,000ms
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    if (isRateLimited(request, 100, 60 * 1000)) {
      return error('Too many requests.', 429);
    }

    // Origin validation
    if (!validateOrigin(request)) return forbidden();

    // Admin authentication
    const authHeader = request.headers.get('authorization');
    const admin = await verifyAdminToken(authHeader);
    if (!admin) return unauthorized();

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const assignedTo = searchParams.get('assignedTo');
    const createdBy = searchParams.get('createdBy');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') || '50')), 100);

    const db = getAdminFirestore();
    let query = db.collection('tickets').where('deletedAt', '==', null);

    if (status) query = query.where('status', '==', status);
    if (assignedTo) query = query.where('assignedTo', '==', assignedTo);
    if (createdBy) query = query.where('createdBy', '==', createdBy);

    const snapshot = await query.orderBy('createdAt', 'desc').get();
    const tickets: Ticket[] = snapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        }) as Ticket,
    );

    // Apply pagination
    const total = tickets.length;
    const start = (page - 1) * pageSize;
    const pagedTickets = tickets.slice(start, start + pageSize);

    return success({
      tickets: pagedTickets,
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
    const db = getAdminFirestore();
    const docRef = db.collection('tickets').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return error('Ticket not found.', 404);
    }

    const data = doc.data() as Ticket;

    // Handle specific actions
    switch (action) {
      case 'assign':
        if (!updates.assignee) {
          return error('Assignee required for assign action.', 400);
        }
        await docRef.update({
          assignedTo: updates.assignee,
          assignedAt: Date.now(),
          status: 'assigned' as TicketStatus,
          updatedAt: Date.now(),
          slaBreached: calculateSLABreached(data.createdAt, Date.now()),
        });
        break;

      case 'escalate':
        if (!updates.escalatedTo) {
          return error('Escalated to staff required for escalate action.', 400);
        }
        await docRef.update({
          escalatedTo: updates.escalatedTo,
          escalatedAt: Date.now(),
          updatedAt: Date.now(),
        });
        break;

      case 'resolve':
        await docRef.update({
          status: 'resolved' as TicketStatus,
          resolvedAt: Date.now(),
          updatedAt: Date.now(),
        });
        break;

      case 'close':
        await docRef.update({
          status: 'closed' as TicketStatus,
          closedAt: Date.now(),
          updatedAt: Date.now(),
        });
        break;

      case 'add_delay_reason':
        const currentDelayReasons = data.delayReasons || [];
        await docRef.update({
          delayReasons: [...currentDelayReasons, updates.reason],
          delayNotes: updates.notes || data.delayNotes || '',
          updatedAt: Date.now(),
        });
        break;

      case 'add_follow_up':
        const followUpId = crypto.randomUUID();
        const newFollowUp = {
          id: followUpId,
          from: updates.from || admin.email,
          to: updates.to || '',
          message: updates.message || '',
          channel: updates.channel || 'system',
          timestamp: Date.now(),
        };
        await docRef.update({
          followUps: [...(data.followUps || []), newFollowUp],
          updatedAt: Date.now(),
        });
        break;

      default:
        return error(`Unknown action: ${action}`, 400);
    }

    // Create audit log
    await writeAuditLog({
      action: action as any,
      collection: 'tickets',
      recordId: id,
      userId: admin.uid,
      userEmail: admin.email,
      changes: updates as unknown as Record<string, unknown>,
      previousState: data as unknown as Record<string, unknown>,
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
    const db = getAdminFirestore();

    // Auto-increment ticket number
    const lastTicketSnapshot = await db.collection('tickets').orderBy('ticketNumber', 'desc').limit(1).get();

    const lastTicket = lastTicketSnapshot.docs[0]?.data() as Ticket;
    const ticketNumber = (lastTicket?.ticketNumber || 0) + 1;

    const ticketData = {
      ...data,
      ticketNumber,
      status: 'open' as TicketStatus,
      createdAt: Date.now(),
      createdByAgent: admin.email,
      updatedAt: Date.now(),
      slaBreached: false,
      followUps: [],
      deletedAt: undefined,
    } as Ticket;

    const docRef = await db.collection('tickets').add(ticketData);

    // Create audit log
    await writeAuditLog({
      action: 'create',
      collection: 'tickets',
      recordId: docRef.id,
      userId: admin.uid,
      userEmail: admin.email,
      changes: ticketData as unknown as Record<string, unknown>,
    });

    return success(
      {
        id: docRef.id,
        ticketNumber,
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

    const { id, ...updateData } = body;

    const db = getAdminFirestore();
    const docRef = db.collection('tickets').doc(id);
    const previousDoc = await docRef.get();

    if (!previousDoc.exists) {
      return error('Ticket not found.', 404);
    }

    const previousData = previousDoc.data() as Ticket;

    // Prepare updates with timestamp
    const updates: Partial<Ticket> = {
      ...updateData,
      updatedAt: Date.now(),
    };

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

    await docRef.update(updates);

    // Create audit log
    await writeAuditLog({
      action: 'update',
      collection: 'tickets',
      recordId: id,
      userId: admin.uid,
      userEmail: admin.email,
      changes: updates as unknown as Record<string, unknown>,
      previousState: previousData as unknown as Record<string, unknown>,
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

    const db = getAdminFirestore();
    const docRef = db.collection('tickets').doc(body.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return error('Ticket not found.', 404);
    }

    const data = doc.data() as Ticket;
    if (data.deletedAt) {
      return success({ action: 'already_deleted' });
    }

    // Soft delete
    await docRef.update({
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Create audit log
    await writeAuditLog({
      action: 'delete',
      collection: 'tickets',
      recordId: body.id,
      userId: admin.uid,
      userEmail: admin.email,
      previousState: data as unknown as Record<string, unknown>,
    });

    return success({ action: 'deleted' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logError('[tickets] DELETE error', { error: message });
    return serverError();
  }
}
