export const SALES_REGIONS = ['Ogun', 'Oyo', 'Osun', 'Ondo'] as const;
export type SalesRegion = (typeof SALES_REGIONS)[number];
export const SALES_SEGMENTS = ['HOME', 'SME', 'ENTERPRISE', 'NEIGHBOURHOOD', 'MANAGED_SERVICES'] as const;
export type SalesSegment = (typeof SALES_SEGMENTS)[number];
export const ACCOUNT_STATUSES = ['Active', 'Inactive', 'Blocked', 'Refunded', 'Retrieved'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
export const PACKAGE_TYPES = ['Outright', 'Lease'] as const;
export type PackageType = (typeof PACKAGE_TYPES)[number];
export const MEANS_OF_SALES = [
  'Door Knocking',
  'Referral',
  'Dealer-Citicybertech',
  'Website',
  'Third Party',
  'Direct',
  'Walk-In',
  'Field Visit',
  'Online',
  'Partner',
] as const;
export type MeansOfSale = (typeof MEANS_OF_SALES)[number];
export const SALE_QUARTERS = ['QUARTER 1', 'QUARTER 2', 'QUARTER 3', 'QUARTER 4'] as const;
export type SaleQuarter = (typeof SALE_QUARTERS)[number];
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

export interface SalesTarget {
  id?: string;
  month: string; // YYYY-MM
  region?: SalesRegion;
  agentName?: string;
  targetRevenue: number;
  targetCustomers: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface SalesMetrics {
  mrr: number;
  nrii: number;
  arpu: number;
  activeSubscribers: number;
  inactiveSubscribers: number;
  blockedSubscribers: number;
  newCustomers: number;
  totalMrcClosed: number;
  nrcRevenue: number;
  totalRevenue: number;
  avgNrc: number;
}

export interface ChannelMetrics {
  meansOfSale: string;
  count: number;
  active: number;
  mrc: number;
  nrc: number;
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

export type BtsStatus = 'Active' | 'Inactive' | 'Dismantled' | 'Under Maintenance' | 'Planned';
export type BtsSiteType = 'Tower' | 'Rooftop' | 'Indoor' | 'Pole' | 'Wall Mount';

export interface BtsAuditRecord {
  id?: string;
  btsName: string;
  btsId?: number;
  region: string;
  siteType: BtsSiteType;
  status: BtsStatus;
  latitude?: number;
  longitude?: number;
  address?: string;
  host?: string;

  // Customer metrics
  activeCustomers: number;
  totalCustomers: number;
  enterpriseCustomers: number;
  retailCustomers: number;

  // Revenue metrics (NGN)
  monthlyRecurringRevenue: number;
  targetMrr: number; // 5M minimum
  attainmentPercentage: number;
  nrcRevenue: number;
  totalRevenue: number;

  // Splynx integration
  splynxRouterIds: number[];
  splynxRouterNames: string[];
  lastSplynxSync?: number;

  // Operational
  lastOutageDate?: number;
  outageCountThisMonth: number;
  maintenanceNotes?: string;

  // Audit metadata
  auditedBy: string;
  auditedAt: number;
  auditPeriod: string; // e.g., "2025-W03" or "2025-01"
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number;
}

export interface BtsWeeklySnapshot {
  id?: string;
  btsName: string;
  weekStart: number;
  weekEnd: number;
  activeCustomers: number;
  mrr: number;
  attainmentPercentage: number;
  outages: number;
  notes?: string;
  createdAt: number;
}

export interface BtsRevenueTarget {
  btsName: string;
  minimumMrr: number; // 5,000,000
  stretchMrr: number; // 7,500,000
  targetEnterpriseCustomers: number;
  targetRetailCustomers: number;
  region: string;
  isActive: boolean;
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
