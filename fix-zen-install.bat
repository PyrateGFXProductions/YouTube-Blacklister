@echo off
setlocal
cd /d "%~dp0"

:: Check for Administrator elevation (required to write to Program Files / Zen distribution)
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ==========================================================
    echo  Requesting Administrator privileges...
    echo  (Required to write Zen Enterprise Policy in Program Files)
    echo ==========================================================
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo ==========================================================
echo  Zen Browser: Unsigned Add-on Unlock & Auto-Installer
echo ==========================================================
echo.

:: Detect PowerShell executable (pwsh or Windows PowerShell)
set "PS_EXE=powershell"
where pwsh >nul 2>&1
if %errorlevel% equ 0 (
    set "PS_EXE=pwsh"
)

%PS_EXE% -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-zen-install.ps1"
if errorlevel 1 (
    echo.
    echo Script exited with an error.
    pause
)