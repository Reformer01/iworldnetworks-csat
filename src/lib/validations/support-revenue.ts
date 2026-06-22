import { z } from 'zod';

export const supportRevenueItemSchema = z.object({
  name: z.string().trim().min(1, 'Item name required'),
  quantity: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().min(0),
});

export const supportRevenueSchema = z.object({
  customerName: z.string().min(1, 'Customer name is required').max(200).trim(),
  location: z.string().min(1, 'Location is required').trim(),
  projectType: z.string().min(1, 'Project type is required').trim(),
  items: z.array(supportRevenueItemSchema).default([]),
  totalAmount: z.coerce.number().min(0).default(0),
  date: z.string().trim().default(''),
  agentName: z.string().trim().default(''),
  notes: z.string().trim().default(''),
}).strict();

export type SupportRevenueFormData = z.infer<typeof supportRevenueSchema>;
