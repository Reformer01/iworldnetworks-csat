import { z } from 'zod';
import { SALES_REGIONS, SALE_QUARTERS, PACKAGE_TYPES, ACCOUNT_STATUSES } from '../sales-types';

export const salesRecordSchema = z
  .object({
    serialNumber: z.coerce.number().int().min(0).default(0),
    customerName: z.string().min(1, 'Customer name is required').max(200).trim(),
    location: z.string().min(1, 'Location is required').trim(),
    nrc: z.coerce.number().min(0).default(0),
    mrc: z.coerce.number().min(0).default(0),
    planCode: z.string().min(1, 'Plan code is required').trim(),
    saleDate: z.string().trim().default(''),
    quarter: z.enum(SALE_QUARTERS),
    month: z.string().trim().default(''),
    packageType: z.enum(PACKAGE_TYPES).default('Outright'),
    salesAgent: z.string().trim().default(''),
    meansOfSale: z.string().trim().default(''),
    accountStatus: z.enum(ACCOUNT_STATUSES).default('Active'),
    statusNotes: z.string().trim().default(''),
    importBatchId: z.string().trim().default(''),
    customerType: z.enum(['new', 'revived']).optional(),
    revivedByAgent: z.string().trim().optional(),
    bts: z.string().trim().optional(),
  })
  .strict();

export const salesImportSchema = z.object({
  records: z.array(salesRecordSchema).min(1, 'At least one record is required'),
  source: z.string().trim().default('csv_upload'),
  fileName: z.string().trim().default(''),
});

export const salesTargetSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Must be YYYY-MM format'),
  region: z.enum(SALES_REGIONS).optional(),
  agentName: z.string().trim().optional(),
  targetRevenue: z.coerce.number().min(0),
  targetCustomers: z.coerce.number().int().min(0),
});

export type SalesRecordFormData = z.infer<typeof salesRecordSchema>;
export type SalesImportFormData = z.infer<typeof salesImportSchema>;
export type SalesTargetFormData = z.infer<typeof salesTargetSchema>;
