'use client';

import React, { Suspense } from 'react';
import { SalesLayout } from '@/components/layout/SalesLayout';
import { EmailsTab } from '@/components/mailing/EmailsTab';

export default function EmailsPage() {
  return (
    <SalesLayout>
      <Suspense fallback={null}>
        <EmailsTab />
      </Suspense>
    </SalesLayout>
  );
}