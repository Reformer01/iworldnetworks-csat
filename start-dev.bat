@echo off
cd /d C:\Users\NGFEP\Downloads\project
set SPLYNX_WEBHOOK_SECRET=test-webhook-secret-123
set FEEDBACK_BASE_URL=http://localhost:9002
npx next dev --turbopack -p 9002
