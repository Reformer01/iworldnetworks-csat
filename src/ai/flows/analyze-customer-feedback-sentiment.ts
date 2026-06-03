'use server';
/**
 * @fileOverview A Genkit flow for analyzing customer feedback sentiment.
 *
 * - analyzeCustomerFeedbackSentiment - A function that analyzes customer comments and testimonials.
 * - AnalyzeCustomerFeedbackSentimentInput - The input type for the analyzeCustomerFeedbackSentiment function.
 * - AnalyzeCustomerFeedbackSentimentOutput - The return type for the analyzeCustomerFeedbackSentiment function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AnalyzeCustomerFeedbackSentimentInputSchema = z.object({
  feedbackText: z.string().describe('The customer comment or testimonial to analyze.'),
});
export type AnalyzeCustomerFeedbackSentimentInput = z.infer<typeof AnalyzeCustomerFeedbackSentimentInputSchema>;

const AnalyzeCustomerFeedbackSentimentOutputSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']).describe('The overall sentiment of the feedback (positive, negative, or neutral).'),
  keyThemes: z.array(z.string()).describe('A list of key themes extracted from the feedback.'),
});
export type AnalyzeCustomerFeedbackSentimentOutput = z.infer<typeof AnalyzeCustomerFeedbackSentimentOutputSchema>;

const analyzeFeedbackPrompt = ai.definePrompt({
  name: 'analyzeFeedbackPrompt',
  input: { schema: AnalyzeCustomerFeedbackSentimentInputSchema },
  output: { schema: AnalyzeCustomerFeedbackSentimentOutputSchema },
  prompt: `Analyze the following customer feedback and determine its overall sentiment (positive, negative, or neutral).
Also, extract a list of 1-3 key themes or topics discussed in the feedback.

Feedback:
{{{feedbackText}}}

Output should be a JSON object with 'sentiment' and 'keyThemes' fields.`,
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
