export interface FeedbackDoc {
  id: string;
  customerName?: string;
  customerEmail?: string;
  category?: string;
  location?: string;
  servicePlan?: string;
  comment?: string;
  staffName?: string;
  ratings?: Record<string, unknown>;
  referralSource?: string;
  spotlightInterview?: string;
  serviceDate?: string;
  serviceTime?: string;
  submissionDate?: string;
  dateFeedback?: string;
  dateSubmitted?: string;
  timestamp?: number;
  dateFormatted?: string;
  status?: string;
  resolutionNotes?: string;
  aiAnalysis?: { sentiment: string; keyThemes: string[]; urgency: string } | null;
  _source?: string;
  updatedAt?: number;
}
