@echo off
cd /d "%~dp0"
echo HUODA: http://127.0.0.1:8085
node scripts/serve.cjs
pause
