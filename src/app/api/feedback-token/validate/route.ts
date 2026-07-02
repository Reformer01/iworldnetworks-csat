import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ success: false, error: 'Token is required.' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const doc = await db.collection('feedback_tokens').doc(token).get();

    if (!doc.exists) {
      return NextResponse.json({ success: false, error: 'Invalid token.' }, { status: 404 });
    }

    const data = doc.data()!;

    if (data.used) {
      return NextResponse.json({ success: false, error: 'This link has already been used.' }, { status: 410 });
    }

    if (Date.now() > data.expiresAt) {
      return NextResponse.json({ success: false, error: 'This link has expired.' }, { status: 410 });
    }

    if (data.openedAt === null) {
      await doc.ref.update({ openedAt: Date.now() });
    }

    return NextResponse.json({
      success: true,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      servicePlan: data.servicePlan || '',
      location: data.location || '',
      serviceDate: data.serviceDate || '',
      sourceEvent: data.sourceEvent || '',
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Internal server error.' }, { status: 500 });
  }
}
