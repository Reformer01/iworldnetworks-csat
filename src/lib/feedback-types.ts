export interface FeedbackToken {
  id?: string;
  customerName: string;
  customerEmail: string;
  servicePlan: string;
  location: string;
  serviceDate: string;
  sourceEvent: string;
  used: boolean;
  createdAt: number;
  expiresAt: number;
  openedAt: number | null;
  submittedAt: number | null;
}

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
  satisfied?: string | null;
  _source?: string;
  updatedAt?: number;
}
