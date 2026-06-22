import { z } from 'zod';

export const salesRecordSchema = z.object({
  serialNumber: z.coerce.number().int().min(0).default(0),
  customerName: z.string().min(1, 'Customer name is required').max(200).trim(),
  location: z.string().min(1, 'Location is required').trim(),
  nrc: z.coerce.number().min(0).default(0),
  mrc: z.coerce.number().min(0).default(0),
  planCode: z.string().min(1, 'Plan code is required').trim(),
  saleDate: z.string().trim().default(''),
  quarter: z.enum(['QUARTER 1', 'QUARTER 2', 'QUARTER 3', 'QUARTER 4']),
  month: z.string().trim().default(''),
  packageType: z.enum(['Outright', 'Lease']).default('Outright'),
  salesAgent: z.string().trim().default(''),
  meansOfSale: z.string().trim().default(''),
  accountStatus: z.enum(['Active', 'Inactive', 'Blocked', 'Refunded', 'Retrieved']).default('Active'),
  statusNotes: z.string().trim().default(''),
  importBatchId: z.string().trim().default(''),
}).strict();

export const salesImportSchema = z.object({
  records: z.array(salesRecordSchema).min(1, 'At least one record is required'),
  source: z.string().trim().default('csv_upload'),
  fileName: z.string().trim().default(''),
});

export const salesTargetSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Must be YYYY-MM format'),
  region: z.enum(['Ogun', 'Oyo', 'Osun', 'Ondo']).optional(),
  agentName: z.string().trim().optional(),
  targetRevenue: z.coerce.number().min(0),
  targetCustomers: z.coerce.number().int().min(0),
});

export type SalesRecordFormData = z.infer<typeof salesRecordSchema>;
export type SalesImportFormData = z.infer<typeof salesImportSchema>;
export type SalesTargetFormData = z.infer<typeof salesTargetSchema>;
