@echo off
cd C:\Users\NGFEP\Downloads\project
npm run build > build_output.log 2>&1
echo Exit code: %ERRORLEVEL% >> build_output.log
type build_output.log