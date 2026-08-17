import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { getChurnSurvey } from '@/lib/lib/db/churn';
import { CHURN_COLLECTION } from '@/lib/splynx-mirror-types';
import { logWarn } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ success: false, error: 'Token is required.' }, { status: 400 });
    }

    // MariaDB-first; Firestore mirror fallback for surveys created before the
    // DB migration (or when the DB is unreachable).
    let customerName: string | null = null;
    let used = false;
    let expiresAt = 0;

    try {
      const row = await getChurnSurvey(token);
      if (row) {
        customerName = row.customerName;
        used = row.used;
        expiresAt = Number(row.expiresAt);
      }
    } catch (err) {
      logWarn('[churn-survey-validate] DB lookup failed, falling back to Firestore', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (!customerName) {
      try {
        const db = getAdminFirestore();
        const doc = await db.collection(CHURN_COLLECTION).doc(token).get();
        if (!doc.exists) {
          return NextResponse.json({ success: false, error: 'Invalid link.' }, { status: 404 });
        }
        const data = doc.data()!;
        customerName = data.customerName || '';
        used = data.used === true;
        expiresAt = Number(data.expiresAt || 0);
      } catch (err) {
        logWarn('[churn-survey-validate] Firestore lookup failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        return NextResponse.json({ success: false, error: 'Invalid link.' }, { status: 404 });
      }
    }

    if (used) {
      return NextResponse.json({ success: false, error: 'This link has already been used.' }, { status: 410 });
    }

    if (expiresAt > 0 && Date.now() > expiresAt) {
      return NextResponse.json({ success: false, error: 'This link has expired.' }, { status: 410 });
    }

    return NextResponse.json({
      success: true,
      customerName: customerName || '',
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error.' }, { status: 500 });
  }
}
