@echo off
echo Starting Drone Dashboard Server...
:: Start the python server in a new window so it doesn't block this script
start /b python server.py
echo Waiting for server to initialize...
timeout /t 2 /nobreak > nul
echo Opening Dashboard at http://localhost:8000...
start http://localhost:8000
echo Server is running. Close this window to stop (Ctrl+C).
:: Keep window open for logs
pause
