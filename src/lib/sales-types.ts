export type SalesRegion = 'Ogun' | 'Oyo' | 'Osun' | 'Ondo';
export type SalesSegment = 'HOME' | 'SME' | 'ENTERPRISE';
export type AccountStatus = 'Active' | 'Inactive' | 'Blocked' | 'Refunded' | 'Retrieved';
export type PackageType = 'Outright' | 'Lease';
export type SaleQuarter = 'QUARTER 1' | 'QUARTER 2' | 'QUARTER 3' | 'QUARTER 4';

export interface SalesRecord {
  id?: string;
  serialNumber: number;
  customerName: string;
  location: string;
  region: SalesRegion;
  segment: SalesSegment;
  nrc: number;
  mrc: number;
  planCode: string;
  saleDate: string;
  quarter: SaleQuarter;
  month: string;
  packageType: PackageType;
  salesAgent: string;
  meansOfSale: string;
  accountStatus: AccountStatus;
  statusNotes: string;
  importBatchId: string;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number;
}

export interface SalesAgent {
  id: string;
  name: string;
  region: SalesRegion;
  annualTarget: number;
  annualCustomerTarget: number;
  quarterlyRevenueTarget: Record<string, number>;
  quarterlyCustomerTarget: Record<string, number>;
  isActive: boolean;
}

export interface RegionalTarget {
  region: SalesRegion;
  targetPercentage: number;
  annualRevenueTarget: number;
  annualCustomerTarget: number;
  monthlyTarget: number;
}

export interface SalesMetrics {
  mrr: number;
  nrii: number;
  arpu: number;
  activeSubscribers: number;
  inactiveSubscribers: number;
  blockedSubscribers: number;
  newCustomers: number;
  churnedCustomers: number;
  churnRate: number;
  nrcRevenue: number;
  totalRevenue: number;
  avgNrc: number;
}

export interface RegionMetrics extends SalesMetrics {
  region: SalesRegion;
  attainment: number;
  targetRevenue: number;
}

export interface AgentMetrics {
  name: string;
  region: SalesRegion;
  mrc: number;
  nrc: number;
  customerCount: number;
  newCustomers: number;
  targetRevenue: number;
  attainment: number;
}

export interface SupportRevenueRecord {
  id?: string;
  customerName: string;
  location: string;
  region: SalesRegion;
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
