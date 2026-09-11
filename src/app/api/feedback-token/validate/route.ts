import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { logWarn } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ success: false, error: 'Token is required.' }, { status: 400 });
    }

    // MariaDB-first; Firestore mirror fallback while the transition runs.
    let data: {
      customerName: string;
      customerEmail: string;
      servicePlan: string | null;
      location: string | null;
      serviceDate: string | null;
      sourceEvent: string | null;
      category: string | null;
      staffName: string | null;
      used: boolean;
      expiresAt: bigint;
      openedAt: bigint | null;
    } | null = null;

    try {
      const row = await prisma.feedbackToken.findUnique({ where: { id: token } });
      if (row) {
        data = {
          customerName: row.customerName,
          customerEmail: row.customerEmail,
          servicePlan: row.servicePlan,
          location: row.location,
          serviceDate: row.serviceDate,
          sourceEvent: row.sourceEvent,
          category: row.category,
          staffName: row.staffName,
          used: row.used,
          expiresAt: row.expiresAt,
          openedAt: row.openedAt,
        };
      }
    } catch (err) {
      logWarn('[feedback-token-validate] DB lookup failed, falling back to Firestore', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (!data) {
      try {
        const db = getAdminFirestore();
        const doc = await db.collection('feedback_tokens').doc(token).get();
        if (!doc.exists) {
          return NextResponse.json({ success: false, error: 'Invalid token.' }, { status: 404 });
        }
        const docData = doc.data()!;
        data = {
          customerName: docData.customerName,
          customerEmail: docData.customerEmail,
          servicePlan: docData.servicePlan || null,
          location: docData.location || null,
          serviceDate: docData.serviceDate || null,
          sourceEvent: docData.sourceEvent || null,
          category: docData.category || null,
          staffName: docData.staffName || null,
          used: docData.used === true,
          expiresAt: BigInt(docData.expiresAt || 0),
          openedAt: docData.openedAt != null ? BigInt(docData.openedAt) : null,
        };
      } catch (err) {
        logWarn('[feedback-token-validate] Firestore lookup failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        return NextResponse.json({ success: false, error: 'Invalid token.' }, { status: 404 });
      }
    }

    if (data.used) {
      return NextResponse.json({ success: false, error: 'This link has already been used.' }, { status: 410 });
    }

    if (Date.now() > Number(data.expiresAt)) {
      return NextResponse.json({ success: false, error: 'This link has expired.' }, { status: 410 });
    }

    if (data.openedAt === null) {
      const openedAt = Date.now();
      try {
        await prisma.feedbackToken.update({ where: { id: token }, data: { openedAt: BigInt(openedAt) } });
      } catch {
        // Best-effort; mirror handles below.
      }
      try {
        await getAdminFirestore().collection('feedback_tokens').doc(token).update({ openedAt });
      } catch (mirrorErr) {
        logWarn('[feedback-token-validate] Firestore openedAt mirror failed (best-effort)', {
          error: mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr),
        });
      }
    }

    return NextResponse.json({
      success: true,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      servicePlan: data.servicePlan || '',
      location: data.location || '',
      serviceDate: data.serviceDate || '',
      sourceEvent: data.sourceEvent || '',
      category: data.category || '',
      staffName: data.staffName || '',
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Internal server error.' }, { status: 500 });
  }
}