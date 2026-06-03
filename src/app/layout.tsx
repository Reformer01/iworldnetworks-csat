
import type { Metadata } from 'next';
import './globals.css';
import { FirebaseClientProvider } from '@/firebase';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { Toaster } from '@/components/ui/toaster';

export const metadata: Metadata = {
  title: 'I-World Networks | Experience Seamless Connectivity',
  description: 'Helping you stay connected to what matters most.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased selection:bg-secondary/20 min-h-screen">
        <FirebaseClientProvider>
          <FirebaseErrorListener />
          {children}
          <Toaster />
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
