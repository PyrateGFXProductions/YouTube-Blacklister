# PowerShell packaging script for Always New To You - YouTube Smart Blacklister
# Builds every browser target from the single universal manifest.json:
#   - Chromium family (Chrome/Edge/Brave/Opera/Vivaldi): unpacked + store zip
#   - Firefox family (Firefox/Zen/LibreWolf): unpacked + .xpi/.zip, plus the
#     zen-unpacked/ folder and blacklist-firefox.* files referenced by ZEN-INSTALL.md
# Generates a clean .zip distribution package suitable for GitHub Releases or Chrome Web Store.

param (
    # Default to the script's own folder instead of the caller's CWD, so artifacts
    # always land next to the extension no matter where the script is invoked from.
    [string]$OutputDir = $PSScriptRoot
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
    "backup.html",
    "backup.js",
    "icon16.png",
    "icon48.png",
    "icon128.png",
    "install.bat",
    "LICENSE",
    "README.md",
    "PRIVACY.md",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "ZEN-INSTALL.md"
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

# 3. Derive per-browser manifests from the universal manifest.json
$extensionFiles = @(
    "background.js",
    "content.js",
    "popup.html",
    "popup.js",
    "backup.html",
    "backup.js",
    "icon16.png",
    "icon48.png",
    "icon128.png"
)

$chromiumManifest = $manifest | ConvertTo-Json -Depth 10 | ConvertFrom-Json
$chromiumManifest.PSObject.Properties.Remove("browser_specific_settings")
$chromiumManifest.background = [pscustomobject]@{ service_worker = "background.js" }

$firefoxManifest = $manifest | ConvertTo-Json -Depth 10 | ConvertFrom-Json
# `key` is Chromium-only (pins the extension ID in Chrome-based browsers).
# Keep it OUT of Firefox-family manifests: web-ext/AMO lint flags it as an unexpected property.
$firefoxManifest.PSObject.Properties.Remove("key")
$firefoxManifest.background = [pscustomobject]@{ scripts = @("background.js") }

function Write-ManifestJson {
    param([object]$ManifestObj, [string]$Path)
    $json = $ManifestObj | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($Path, $json, (New-Object System.Text.UTF8Encoding($false)))
}

function Copy-FileAtomic {
    param([string]$SourcePath, [string]$DestinationPath)
    # Stage the copy in a temp file inside the destination folder, then swap it in
    # with a single rename. A copy interrupted midway (crash, Ctrl-C, killed shell)
    # can then only ever damage the temp file - a plain Copy-Item -Force over an
    # existing artifact would leave a truncated/corrupt xpi in its place.
    # .NET resolves relative paths against the process CWD, not the PowerShell
    # location, so root the destination up front or the swap lands in the wrong place.
    $DestinationPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($DestinationPath)
    $destinationDir = Split-Path -Parent $DestinationPath
    if (-not $destinationDir) {
        $destinationDir = (Get-Location).ProviderPath
    }
    $tempPath = Join-Path $destinationDir ".$([System.IO.Path]::GetFileName($DestinationPath)).$PID.tmp"
    try {
        Copy-Item -Path $SourcePath -Destination $tempPath -Force
        [System.IO.File]::Move($tempPath, $DestinationPath, $true)
    }
    finally {
        if (Test-Path $tempPath) {
            Remove-Item -Force $tempPath -ErrorAction SilentlyContinue
        }
    }
}

# 4. Build dist/chromium (unpacked) + dist/chromium.zip
$distDir = Join-Path $PSScriptRoot "dist"
if (Test-Path $distDir) {
    Remove-Item -Recurse -Force $distDir
}
$chromeDir = Join-Path $distDir "chromium"
New-Item -ItemType Directory -Path $chromeDir -Force | Out-Null
Write-ManifestJson -ManifestObj $chromiumManifest -Path (Join-Path $chromeDir "manifest.json")
foreach ($file in $extensionFiles) {
    Copy-Item -Path (Join-Path $PSScriptRoot $file) -Destination $chromeDir -Force
}
$chromeZip = Join-Path $distDir "chromium.zip"
Compress-Archive -Path "$chromeDir\*" -DestinationPath $chromeZip -CompressionLevel Optimal
Write-Host "`n[OK] Chromium build -> dist/chromium/ + dist/chromium.zip" -ForegroundColor Green

# 5. Build dist/firefox (unpacked) + dist/firefox.zip + dist/firefox.xpi
$foxDir = Join-Path $distDir "firefox"
New-Item -ItemType Directory -Path $foxDir -Force | Out-Null
Write-ManifestJson -ManifestObj $firefoxManifest -Path (Join-Path $foxDir "manifest.json")
foreach ($file in $extensionFiles) {
    Copy-Item -Path (Join-Path $PSScriptRoot $file) -Destination $foxDir -Force
}
$foxZip = Join-Path $distDir "firefox.zip"
$foxXpi = Join-Path $distDir "firefox.xpi"
Compress-Archive -Path "$foxDir\*" -DestinationPath $foxZip -CompressionLevel Optimal
Copy-FileAtomic -SourcePath $foxZip -DestinationPath $foxXpi
Write-Host "[OK] Firefox build -> dist/firefox/ + dist/firefox.zip + dist/firefox.xpi" -ForegroundColor Green

# 6. Refresh the ZEN-INSTALL.md convenience files so the doc stays accurate:
#    zen-unpacked/, blacklist-firefox.jar/.xpi/.zip, manifest-firefox.json
$zenDir = Join-Path $PSScriptRoot "zen-unpacked"
if (Test-Path $zenDir) {
    Remove-Item -Recurse -Force $zenDir
}
New-Item -ItemType Directory -Path $zenDir -Force | Out-Null
Write-ManifestJson -ManifestObj $firefoxManifest -Path (Join-Path $zenDir "manifest.json")
foreach ($file in $extensionFiles) {
    Copy-Item -Path (Join-Path $PSScriptRoot $file) -Destination $zenDir -Force
}
Write-ManifestJson -ManifestObj $firefoxManifest -Path (Join-Path $PSScriptRoot "manifest-firefox.json")
Copy-FileAtomic -SourcePath $foxZip -DestinationPath (Join-Path $PSScriptRoot "blacklist-firefox.zip")
Copy-FileAtomic -SourcePath $foxZip -DestinationPath (Join-Path $PSScriptRoot "blacklist-firefox.xpi")
Copy-FileAtomic -SourcePath $foxZip -DestinationPath (Join-Path $PSScriptRoot "blacklist-firefox.jar")
Write-Host "[OK] Zen helpers refreshed -> zen-unpacked/ + blacklist-firefox.* + manifest-firefox.json" -ForegroundColor Green

# 7. Build the classic release zip (docs + install.bat) for GitHub Releases / Chrome Web Store
# Root the output path first: the default is $PSScriptRoot, but an explicit -OutputDir
# may be relative and the atomic file swap below resolves paths against the process CWD.
if (-not [System.IO.Path]::IsPathRooted($OutputDir)) {
    $OutputDir = [System.IO.Path]::GetFullPath((Join-Path (Get-Location).ProviderPath $OutputDir))
}
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}
$zipName = "YouTube-Blacklister-v$extVersion.zip"
$zipPath = Join-Path $OutputDir $zipName

if (Test-Path $zipPath) {
    Write-Host "`n[!] Existing package found. Replacing $zipName atomically..." -ForegroundColor DarkYellow
}

$stagingDir = Join-Path ([System.IO.Path]::GetTempPath()) "yt_blacklister_build_$extVersion"
if (Test-Path $stagingDir) {
    Remove-Item -Recurse -Force $stagingDir
}
New-Item -ItemType Directory -Path $stagingDir | Out-Null

try {
    foreach ($file in $essentialFiles) {
        Copy-Item -Path (Join-Path $PSScriptRoot $file) -Destination (Join-Path $stagingDir $file)
    }

    # The staging copy above pulls in the *universal* root manifest.json (key +
    # browser_specific_settings + Firefox "background.scripts"). Overwrite it with the
    # same stripped Chromium manifest that dist/chromium ships, so the release zip
    # contains exactly what dist/chromium contains.
    Write-ManifestJson -ManifestObj $chromiumManifest -Path (Join-Path $stagingDir "manifest.json")

    Write-Host "`n[i] Compressing package into $zipName..." -ForegroundColor Cyan
    # Compress into a temp .zip beside the target, then swap it in with one rename:
    # an interrupted compression must never leave a truncated release zip behind.
    $zipTempPath = Join-Path $OutputDir ".$zipName.partial.zip"
    try {
        Compress-Archive -Path "$stagingDir\*" -DestinationPath $zipTempPath -CompressionLevel Optimal
        [System.IO.File]::Move($zipTempPath, $zipPath, $true)
    }
    finally {
        if (Test-Path $zipTempPath) {
            Remove-Item -Force $zipTempPath -ErrorAction SilentlyContinue
        }
    }

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
    if (Test-Path $stagingDir) {
        Remove-Item -Recurse -Force $stagingDir -ErrorAction SilentlyContinue
    }
}