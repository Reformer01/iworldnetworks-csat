import { init, captureRequestError } from '@sentry/nextjs';

export async function register() {
  init({
    dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}

export const onRequestError = captureRequestError;
