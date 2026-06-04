
'use server';
/**
 * @fileOverview A Genkit flow for professional feedback analysis.
 *
 * - analyzeCustomerFeedbackSentiment - Analyzes tone, themes, and urgency.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AnalyzeCustomerFeedbackSentimentInputSchema = z.object({
  feedbackText: z.string().describe('The customer comment or testimonial to analyze.'),
});
export type AnalyzeCustomerFeedbackSentimentInput = z.infer<typeof AnalyzeCustomerFeedbackSentimentInputSchema>;

const AnalyzeCustomerFeedbackSentimentOutputSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']).describe('The overall sentiment.'),
  keyThemes: z.array(z.string()).describe('List of extracted themes.'),
  urgency: z.enum(['low', 'medium', 'high']).describe('Actionable urgency level.'),
});
export type AnalyzeCustomerFeedbackSentimentOutput = z.infer<typeof AnalyzeCustomerFeedbackSentimentOutputSchema>;

const analyzeFeedbackPrompt = ai.definePrompt({
  name: 'analyzeFeedbackPrompt',
  input: { schema: AnalyzeCustomerFeedbackSentimentInputSchema },
  output: { schema: AnalyzeCustomerFeedbackSentimentOutputSchema },
  prompt: `You are a customer experience analyst for I-World Networks, a Nigerian ISP.
Analyze this feedback:

"{{{feedbackText}}}"

Extract the sentiment, 1-3 key themes (e.g., "Slow Billing", "Excellent Fiber", "Tech Punctuality"), and determine if this requires urgent intervention.

{{json output.schema}}`,
});

const analyzeCustomerFeedbackSentimentFlow = ai.defineFlow(
  {
    name: 'analyzeCustomerFeedbackSentimentFlow',
    inputSchema: AnalyzeCustomerFeedbackSentimentInputSchema,
    outputSchema: AnalyzeCustomerFeedbackSentimentOutputSchema,
  },
  async (input) => {
    const { output } = await analyzeFeedbackPrompt(input);
    return output!;
  }
);

export async function analyzeCustomerFeedbackSentiment(
  input: AnalyzeCustomerFeedbackSentimentInput
): Promise<AnalyzeCustomerFeedbackSentimentOutput> {
  return analyzeCustomerFeedbackSentimentFlow(input);
}
