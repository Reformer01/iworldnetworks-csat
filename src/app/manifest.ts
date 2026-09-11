import type { MetadataRoute } from 'next';

// PWA manifest — enables "Add to Home Screen" on Android (Chrome) and iOS
// (Safari reads the apple-touch-icon + meta tags from the root layout).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'I-World Networks CSAT',
    short_name: 'I-World CSAT',
    description: 'I-World Networks sales dashboard and customer feedback platform.',
    start_url: '/admin/login',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f2f5f7',
    theme_color: '#448515',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
