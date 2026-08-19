'use client';

import { SalesLayout } from '@/components/layout/SalesLayout';
import { CampaignsTab } from '@/components/mailing/CampaignsTab';

export default function CampaignsPage() {
  return (
    <SalesLayout>
      <CampaignsTab />
    </SalesLayout>
  );
}