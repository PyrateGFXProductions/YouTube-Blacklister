# PowerShell packaging script for Always New To You - YouTube Smart Blacklister
# Generates a clean .zip distribution package suitable for GitHub Releases or Chrome Web Store.

param (
    [string]$OutputDir = "."
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " YouTube Smart Blacklister - Release Packager" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Read & Validate manifest.json
$manifestPath = Join-Path $PSScriptRoot "manifest.json"
if (-not (Test-Path $manifestPath)) {
    Write-Error "manifest.json not found in $PSScriptRoot"
    exit 1
}

$manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json
$extName = $manifest.name
$extVersion = $manifest.version

Write-Host "`n[OK] Extension: $extName" -ForegroundColor Green
Write-Host "[OK] Version  : $extVersion" -ForegroundColor Green

# 2. Verify Essential Files
$essentialFiles = @(
    "manifest.json",
    "background.js",
    "content.js",
    "popup.html",
    "popup.js",
    "icon16.png",
    "icon48.png",
    "icon128.png",
    "LICENSE",
    "README.md"
)

Write-Host "`n[i] Verifying essential package files..." -ForegroundColor Yellow
foreach ($file in $essentialFiles) {
    $filePath = Join-Path $PSScriptRoot $file
    if (-not (Test-Path $filePath)) {
        Write-Error "Missing required file: $file"
        exit 1
    }
    Write-Host "  - Found $file" -ForegroundColor Gray
}

# 3. Destination Zip Path
$zipName = "YouTube-Blacklister-v$extVersion.zip"
$zipPath = Join-Path $OutputDir $zipName

if (Test-Path $zipPath) {
    Write-Host "`n[!] Existing package found. Overwriting $zipName..." -ForegroundColor DarkYellow
    Remove-Item -Force $zipPath
}

# 4. Create Temporary Staging Directory
$stagingDir = Join-Path ([System.IO.Path]::GetTempPath()) "yt_blacklister_build_$extVersion"
if (Test-Path $stagingDir) {
    Remove-Item -Recurse -Force $stagingDir
}
New-Item -ItemType Directory -Path $stagingDir | Out-Null

try {
    # Copy essential release files
    foreach ($file in $essentialFiles) {
        Copy-Item -Path (Join-Path $PSScriptRoot $file) -Destination (Join-Path $stagingDir $file)
    }

    # Compress staging folder to zip
    Write-Host "`n[i] Compressing package into $zipName..." -ForegroundColor Cyan
    Compress-Archive -Path "$stagingDir\*" -DestinationPath $zipPath -CompressionLevel Optimal

    $zipInfo = Get-Item $zipPath
    $sizeKb = [math]::Round($zipInfo.Length / 1KB, 2)

    Write-Host "`n==========================================================" -ForegroundColor Green
    Write-Host " [SUCCESS] Release package created successfully!" -ForegroundColor Green
    Write-Host " Output: $($zipInfo.FullName)" -ForegroundColor White
    Write-Host " Size  : $sizeKb KB" -ForegroundColor White
    Write-Host " Ready for GitHub Releases or Chrome Web Store." -ForegroundColor Gray
    Write-Host "==========================================================" -ForegroundColor Green
}
finally {
    # Cleanup temporary staging dir
    if (Test-Path $stagingDir) {
        Remove-Item -Recurse -Force $stagingDir -ErrorAction SilentlyContinue
    }
}
