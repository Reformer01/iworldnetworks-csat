-- Seed ONE failed EmailJob for the Retry e2e (safe: Mailpit-only recipient,
-- original pre-mint token link preserved so the worker sends as-is).
-- Run: mysql < e2e/seed.sql   (staging DB only — never production)
-- The payload feedbackUrl token must exist in FeedbackToken; the spec's
-- editor-compose flow covers approval — this row covers the Retry button.
INSERT INTO EmailJob (id, type, customerId, customerEmail, customerName, payload, status, retryCount, maxRetries)
VALUES (
  'e2e-retry-seed-01',
  'feedback_request',
  'e2e',
  'e2e-retry@mailpit.local',
  'E2E Retry Probe',
  JSON_OBJECT(
    'feedbackUrl', 'https://csat.iwn.ng/feedback?token=e2e-retry-token-01',
    'sourceEvent', 'e2e-seed',
    'eventHash', 'e2e-retry-seed-01'
  ),
  'failed',
  0,
  3
)
ON DUPLICATE KEY UPDATE
  status = 'failed', error = 'E2E seed (SMTP was down in the story)', retryCount = 0;
