import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Rate Your Experience — I-World Networks',
  description: 'Share your feedback about I-World Networks internet service. Rate your experience and help us improve connectivity across Southwest Nigeria.',
  robots: { index: false, follow: true },
};

export default function FeedbackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
