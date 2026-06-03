'use server';
/**
 * @fileOverview This file implements a Genkit flow for generating an AI-powered executive summary from operational data.
 *
 * - generateReportExecutiveSummary - A function that generates an executive summary.
 * - GenerateReportExecutiveSummaryInput - The input type for the generateReportExecutiveSummary function.
 * - GenerateReportExecutiveSummaryOutput - The return type for the generateReportExecutiveSummary function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

// 1. Define Input Schema
const GenerateReportExecutiveSummaryInputSchema = z.object({
  operationalData: z.string().describe('The raw operational data to be summarized.'),
});
export type GenerateReportExecutiveSummaryInput = z.infer<typeof GenerateReportExecutiveSummaryInputSchema>;

// 2. Define Output Schema
const GenerateReportExecutiveSummaryOutputSchema = z.object({
  summary: z.string().describe('A clear, concise executive summary highlighting critical trends and actionable recommendations.'),
});
export type GenerateReportExecutiveSummaryOutput = z.infer<typeof GenerateReportExecutiveSummaryOutputSchema>;

// 3. Define the Prompt
const generateReportExecutiveSummaryPrompt = ai.definePrompt({
  name: 'generateReportExecutiveSummaryPrompt',
  input: { schema: GenerateReportExecutiveSummaryInputSchema },
  output: { schema: GenerateReportExecutiveSummaryOutputSchema },
  prompt: `You are an expert business analyst specializing in operational efficiency and strategic recommendations.
Your task is to analyze the provided operational data, condense it into a clear and concise executive summary, highlighting critical trends and suggesting actionable recommendations.

Operational Data:
{{{operationalData}}}

Please provide the executive summary in the following JSON format:
{{json output.schema}}
`,
});

// 4. Define the Flow
const generateReportExecutiveSummaryFlow = ai.defineFlow(
  {
    name: 'generateReportExecutiveSummaryFlow',
    inputSchema: GenerateReportExecutiveSummaryInputSchema,
    outputSchema: GenerateReportExecutiveSummaryOutputSchema,
  },
  async (input) => {
    const { output } = await generateReportExecutiveSummaryPrompt(input);
    if (!output) {
      throw new Error('Failed to generate executive summary.');
    }
    return output;
  }
);

// 5. Exported wrapper function
export async function generateReportExecutiveSummary(
  input: GenerateReportExecutiveSummaryInput
): Promise<GenerateReportExecutiveSummaryOutput> {
  return generateReportExecutiveSummaryFlow(input);
}
