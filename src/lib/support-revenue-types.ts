export interface SupportRevenueDoc {
  id?: string;
  customerName: string;
  location: string;
  region?: 'Ogun' | 'Oyo' | 'Osun' | 'Ondo';
  projectType: string;
  saleKind?: string;
  assignedSalesRep?: string;
  bandwidthFrom?: string;
  bandwidthTo?: string;
  items: { name: string; quantity: number; unitPrice: number }[];
  totalAmount: number;
  date?: string;
  agentName?: string;
  description?: string;
  notes?: string;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number;
}

// Fixed sales catalogue for the Support Revenue page — these and ONLY these.
export const SUPPORT_SALE_TYPES = [
  'RADIO SALES',
  'SIP SERVICE',
  'RELOCATION',
  'ROUTER SALES',
  'CABLE',
  'POE',
  'POWER BACKUP',
  'TV GUARD',
  'BANDWIDTH UPGRADE',
  'REVIVED CUSTOMER',
  'REFERRALS',
] as const;
