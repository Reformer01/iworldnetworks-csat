-- Remove E2E rows (seed + anything the specs created). Safe pattern: only
-- rows addressed to the fake-SMTP domain or carrying the [E2E marker.
-- Run: mysql < e2e/cleanup.sql   (staging DB only — never production)
DELETE FROM EmailJob
WHERE customerEmail LIKE '%@mailpit.local'
   OR id LIKE 'e2e-%'
   OR payload LIKE '%e2e-retry-token-01%';
