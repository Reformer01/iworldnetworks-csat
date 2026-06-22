import { z } from 'zod';

const aiAnalysisSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  keyThemes: z.array(z.string()).default([]),
  urgency: z.enum(['low', 'medium', 'high']),
});

export const feedbackSchema = z.object({
  customerName: z.string().min(1, 'Name is required').max(100, 'Name must be under 100 characters').trim(),
  customerEmail: z.string().email('Invalid email address').trim().toLowerCase(),
  category: z.enum(['Reliability', 'Support', 'FieldSupport', 'Testimonials', 'Installation', 'Billing']),
  location: z.string().min(1, 'Location is required').trim(),
  servicePlan: z.string().min(1, 'Service plan is required').trim(),
  ratings: z.object({
    // Reliability
    stability: z.coerce.number().min(1).max(5).optional(),
    latency: z.coerce.number().min(1).max(5).optional(),
    peakPerformance: z.coerce.number().min(1).max(5).optional(),
    // Support
    professionalism: z.coerce.number().min(1).max(5).optional(),
    clarity: z.coerce.number().min(1).max(5).optional(),
    responsiveness: z.coerce.number().min(1).max(5).optional(),
    knowledge: z.coerce.number().min(1).max(5).optional(),
    friendliness: z.coerce.number().min(1).max(5).optional(),
    fcr: z.enum(['Yes', 'No']).optional(),
    // FieldSupport
    resolutionSpeed: z.coerce.number().min(1).max(5).optional(),
    repairQuality: z.coerce.number().min(1).max(5).optional(),
    conduct: z.coerce.number().min(1).max(5).optional(),
    // Testimonials
    signal: z.coerce.number().min(1).max(5).optional(),
    // Installation
    punctuality: z.coerce.number().min(1).max(5).optional(),
    quality: z.coerce.number().min(1).max(5).optional(),
    explanation: z.coerce.number().min(1).max(5).optional(),
    timeliness: z.coerce.number().min(1).max(5).optional(),
    // Billing
    accuracy: z.coerce.number().min(1).max(5).optional(),
    reconnection: z.coerce.number().min(1).max(5).optional(),
    usedPortal: z.enum(['Yes', 'No']).optional(),
    portalEase: z.coerce.number().min(1).max(5).optional(),
  }).partial().optional().default({}),
  comment: z.string().max(1000, 'Comment must be under 1000 characters').trim().optional().default(''),
  staffName: z.string().trim().optional().default(''),
  referralSource: z.string().trim().optional().default(''),
  spotlightInterview: z.string().trim().optional().default(''),
  serviceDate: z.string().trim().optional().default(''),
  serviceDateEnd: z.string().trim().optional().default(''),
  serviceTime: z.string().trim().optional().default(''),
  submissionDate: z.string().trim().optional().default(''),
  dateFeedback: z.string().trim().optional(),
  dateSubmitted: z.string().trim().optional(),
  aiAnalysis: aiAnalysisSchema.nullable().optional().default(null),
}).strict();
