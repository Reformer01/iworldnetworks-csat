export type SalesRegion = 'Ogun' | 'Oyo' | 'Osun' | 'Ondo';
export type SalesSegment = 'HOME' | 'SME' | 'ENTERPRISE' | 'NEIGHBOURHOOD' | 'MANAGED_SERVICES';
export type AccountStatus = 'Active' | 'Inactive' | 'Blocked' | 'Refunded' | 'Retrieved';
export type PackageType = 'Outright' | 'Lease';
export type SaleQuarter = 'QUARTER 1' | 'QUARTER 2' | 'QUARTER 3' | 'QUARTER 4';
export type CustomerType = 'new' | 'revived';

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
  customerType: CustomerType;
  revivedByAgent: string;
  bts: string;
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

export interface BtsStation {
  id: number;
  name: string;
  region: string;
  host: string;
}

export interface SupportStaffKPI {
  id: string;
  staffId: string;
  staffName: string;
  role: TicketRole;
  periodStart: number;
  periodEnd: number;
  ticketsAssigned: number;
  ticketsResolved: number;
  ticketsEscalated: number;
  ticketsReopened: number;
  avgResolutionTimeHours: number;
  slaComplianceRate: number; // percentage
  firstContactResolutionRate: number; // percentage
  avgCustomerSatisfaction: number; // 1-5 from feedback
  slaBreaches: number;
  createdAt: number;
  updatedAt: number;
}

export interface SupportStaffKPIInput {
  staffId: string;
  staffName: string;
  role: TicketRole;
  periodStart: number;
  periodEnd: number;
}

// Ticket types
export type TicketStatus = 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed';
export type ComplaintType = 'No Connectivity' | 'Slow Speed' | 'Hardware Issue' | 'Installation Issue' | 'Billing Issue' | 'Other';
export type TicketRole = 'Front-end Support' | 'Back-end Support' | 'Technical' | 'Field Staff' | 'Billing';

export interface FollowUp {
  id: string;
  from: string;
  to: string;
  message: string;
  channel: 'whatsapp' | 'system';
  timestamp: number;
}

export interface Ticket {
  id?: string;
  ticketNumber: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  location: string;
  region: SalesRegion;
  bts?: string;
  complaintType: ComplaintType;
  description: string;
  createdBy: string;
  assignedTo?: string;
  escalatedTo?: string;
  status: TicketStatus;
  createdAt: number;
  assignedAt?: number;
  escalatedAt?: number;
  resolvedAt?: number;
  closedAt?: number;
  slaBreached: boolean;
  resolutionNotes?: string;
  firstTimeFix?: boolean;
  delayReasons?: string[];
  delayNotes?: string;
  followUps: FollowUp[];
  createdByAgent?: string;
  updatedAt: number;
  deletedAt?: number;
}
