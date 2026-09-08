@echo off
title YouTube Blacklister - Quick Installer
color 0b

echo ================================================================
echo   Always New To You - YouTube Smart Blacklister Quick Installer
echo ================================================================
echo.

set "EXT_DIR=%~dp0"
:: Remove trailing backslash if present
if "%EXT_DIR:~-1%"=="\" set "EXT_DIR=%EXT_DIR:~0,-1%"

echo [1/3] Copying extension folder path to clipboard...
echo|set /p="%EXT_DIR%"|clip
echo       Copied: "%EXT_DIR%"
echo.

echo [2/3] Opening extensions page in your browser...
:: Try Chrome first, then Edge, then default browser
start chrome chrome://extensions 2>nul || start msedge edge://extensions 2>nul || start "" "chrome://extensions"
echo.

echo [3/3] Final 2 Quick Steps in your browser:
echo       ----------------------------------------------------
echo       1. Toggle "Developer mode" ON (top-right switch).
echo       2. Click "Load unpacked" (top-left button).
echo       3. Press Ctrl+V in the folder bar and hit Enter!
echo       ----------------------------------------------------
echo.
echo That's it! Always New To You is now installed and active.
echo.
echo Press any key to exit...
pause >nul
