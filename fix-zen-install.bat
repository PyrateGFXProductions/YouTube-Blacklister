@echo off
setlocal
cd /d "%~dp0"
echo Running Zen unsigned-addon unlock (PowerShell 7)...
echo.
pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-zen-install.ps1"
if errorlevel 1 (
    echo.
    echo Script exited with an error.
    pause
)