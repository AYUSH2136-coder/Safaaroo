@echo off
title Location Tracker POC Manager
color 0b
cls

:: Get current batch file directory path
set "PROJECT_ROOT=%~dp0"

echo ====================================================================
echo                LOCATION TRACKER POC - STARTER
echo ====================================================================
echo.
echo Please choose an option:
echo   [1] Full Setup (Build Frontend, Run Backend, Start Ngrok)
echo   [2] Dev Setup (Build Frontend, Run Backend - No Ngrok)
echo   [3] Run Backend Only (If Frontend is already built)
echo   [4] Start Ngrok Only
echo   [5] Exit
echo.
set /p opt="Enter choice (1-5): "

if "%opt%"=="1" goto full
if "%opt%"=="2" goto dev
if "%opt%"=="3" goto backend
if "%opt%"=="4" goto ngrok
if "%opt%"=="5" goto exit
echo Invalid choice. Please try again.
pause
goto :EOF

:full
echo.
echo ===================================================
echo [1/3] Building Frontend Statically...
echo ===================================================
cd /d "%PROJECT_ROOT%frontend"
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed!
    pause
    exit /b %errorlevel%
)
echo.
echo ===================================================
echo [2/3] Starting Ngrok Tunnel in separate window...
echo ===================================================
taskkill /F /IM ngrok.exe >nul 2>&1
start "Ngrok Tunnel (Port 5000)" cmd /k "ngrok http http://127.0.0.1:5000"
echo.
echo ===================================================
echo [3/3] Starting Backend Server...
echo ===================================================
cd /d "%PROJECT_ROOT%backend"
call npm run dev
goto exit

:dev
echo.
echo ===================================================
echo [1/2] Building Frontend Statically...
echo ===================================================
cd /d "%PROJECT_ROOT%frontend"
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Frontend build failed!
    pause
    exit /b %errorlevel%
)
echo.
echo ===================================================
echo [2/2] Starting Backend Server...
echo ===================================================
cd /d "%PROJECT_ROOT%backend"
call npm run dev
goto exit

:backend
echo.
echo ===================================================
echo Starting Backend Server...
echo ===================================================
cd /d "%PROJECT_ROOT%backend"
call npm run dev
goto exit

:ngrok
echo.
echo ===================================================
echo Starting Ngrok Tunnel in separate window...
echo ===================================================
taskkill /F /IM ngrok.exe >nul 2>&1
start "Ngrok Tunnel (Port 5000)" cmd /k "ngrok http http://127.0.0.1:5000"
goto exit

:exit
cd /d "%PROJECT_ROOT%"
echo.
echo Done.
