import type { Metadata } from 'next';
import { Be_Vietnam_Pro, Manrope, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { FirebaseClientProvider } from '@/firebase';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/ThemeProvider';

// Admin typography (strategic pairing):
//   Display/headings  -> Be Vietnam Pro (strong, geometric, corporate)
//   Body/UI           -> Manrope (clean, highly legible at small sizes)
//   Accent/labels     -> Satoshi via Fontshare (loaded in <head> below)
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-display-family',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-body-family',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'I-World Networks | Experience Seamless Connectivity',
  description: 'Helping you stay connected to what matters most.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.svg',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'I-World CSAT',
  },
  other: {
    'theme-color': '#448515',
    'mobile-web-app-capable': 'yes',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Satoshi (Fontshare) — accent/label face */}
        <link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap" rel="stylesheet" />
      </head>
      <body
        className={`${beVietnamPro.variable} ${manrope.variable} ${jetbrainsMono.variable} font-body antialiased selection:bg-secondary/20 min-h-screen`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <FirebaseClientProvider>
            <FirebaseErrorListener />
            {children}
            <Toaster />
          </FirebaseClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
