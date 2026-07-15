import { z } from 'zod';
import { SalesRegion, TicketStatus, ComplaintType } from '../sales-types';

export const ticketSchema = z
  .object({
    customerName: z.string().min(1, 'Customer name is required'),
    customerPhone: z.string().min(1, 'Customer phone is required'),
    customerEmail: z.string().email('Valid email required').optional(),
    location: z.string().min(1, 'Location is required'),
    region: z.enum(['Ogun', 'Oyo', 'Osun', 'Ondo'] as const),
    complaintType: z.enum(['No Connectivity', 'Slow Speed', 'Hardware Issue', 'Installation Issue', 'Billing Issue', 'Other'], {
      required_error: 'Please select a complaint type',
    }),
    description: z.string().min(10, 'Description must be at least 10 characters').max(2000, 'Description must not exceed 2000 characters'),
    bts: z.string().optional(),
    createdBy: z.string().min(1, 'Creator is required'),
    assignedTo: z.string().optional(),
    escalatedTo: z.string().optional(),
    status: z.enum(['open', 'assigned', 'in_progress', 'resolved', 'closed']).default('open'),
  })
  .refine(
    (data) => {
      if (data.status === 'assigned' && !data.assignedTo) {
        return false;
      }
      return true;
    },
    {
      message: 'Ticket must be assigned when status is "assigned"',
      path: ['assignedTo'],
    },
  );

export type TicketFormData = z.infer<typeof ticketSchema>;
