export interface SupportRevenueDoc {
  id?: string;
  customerName: string;
  location: string;
  region: 'Ogun' | 'Oyo' | 'Osun' | 'Ondo';
  projectType: string;
  items: { name: string; quantity: number; unitPrice: number }[];
  totalAmount: number;
  date: string;
  agentName: string;
  notes: string;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number;
}
