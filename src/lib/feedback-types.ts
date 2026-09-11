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

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface FeedbackDoc {
  id: string;
  customerName?: string;
  customerEmail?: string;
  category?: string;
  location?: string;
  servicePlan?: string;
  comment?: string;
  staffName?: string;
  ratings?: Record<string, JsonValue>;
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
  source?: string;
  updatedAt?: number;
}
