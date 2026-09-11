@echo off
cd C:\Users\NGFEP\Downloads\project
npm install @aortl/admin-react @aortl/admin-css @tabler/icons-react --save > install.log 2>&1
echo Exit code: %ERRORLEVEL% >> install.log
type install.log