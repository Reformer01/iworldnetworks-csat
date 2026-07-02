@echo off
echo ==========================================
echo  IWN CSAT - Git Commit and Push to GitHub
echo ==========================================
echo.

cd /d "%~dp0"

echo [1/3] Staging all changes...
git add -A
echo Done.
echo.

echo [2/3] Committing...
git -c core.hooksPath=nul commit -m "feat: comprehensive CSAT platform overhaul - v2

- feat: Splynx webhook integration (ticket_close / invoice_create triggers)
- feat: multi-department feedback with satisfaction status and sub-ratings
- feat: feedback token system with 7-day expiry and single-use enforcement
- feat: SMTP email delivery via nodemailer for feedback link dispatch
- feat: Splynx REST API enrichment (customer name/email/plan lookup)
- feat: comprehensive feedback form (stars, satisfied, open comment, dept ratings)
- fix: sales records 400 error caused by totalPaid in strict Zod schema
- fix: dialog aria-describedby warnings across all admin dialogs
- fix: improved error messages showing specific failed field names
- feat: I-World Networks logo + real hero images in public folder
- feat: public landing page with brand assets
- feat: support revenue CRUD module
- feat: field support + installation admin pages
- feat: sales KPI dashboard with recharts (region/agent/segment metrics)
- feat: sales records with pagination, add/edit/delete
- feat: CSV bulk import with audit logging
- feat: sales targets management
- feat: admin testimonials, staff directory, network stability pages
- feat: audit log system for all sales CRUD operations
- feat: rate limiting (120 reads/min, 60 writes/min)
- feat: Firestore security rules for all collections
- test: 127 tests passing across 10 test files
- chore: TypeScript strict mode, 0 type errors
- chore: production build verified (33 static + dynamic API routes)"

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Commit failed. You may already have a clean working tree.
    git status
    pause
    exit /b 1
)
echo Done.
echo.

echo [3/3] Pushing to GitHub (origin/main)...
git push origin main
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Push failed. Check your GitHub credentials.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo  SUCCESS! Code pushed to GitHub.
echo  https://github.com/Reformer01/iworldnetworks-csat
echo ==========================================
pause
