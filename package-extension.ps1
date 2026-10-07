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
# Files that must EXIST IN THE REPO. This is a completeness check on the checkout, not a
# statement about what ships: the docs and the Windows loader are repo-only and are
# deliberately kept out of every published artifact (see $packageFiles below).
$essentialFiles = @(
    "manifest.json",
    "background.js",
    "content.js",
    "shared-tables.js",
    "popup.html",
    "popup.js",
    "backup.html",
    "backup.js",
    "icon16.png",
    "icon48.png",
    "icon128.png",
    "LICENSE",
    "PRIVACY.md",
    "README.md",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "ZEN-INSTALL.md",
    "install.bat"
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
# The runtime files that make up the extension itself. This is the ONLY file list any
# published artifact is built from, so the browser builds and the release zip cannot drift
# apart. The repo docs (README/CHANGELOG/CONTRIBUTING/ZEN-INSTALL) and the Windows loader
# (install.bat) live in the repo only — the release archive is the extension, nothing else.
$packageFiles = @(
    "background.js",
    "content.js",
    "shared-tables.js",
    "popup.html",
    "popup.js",
    "backup.html",
    "backup.js",
    "icon16.png",
    "icon48.png",
    "icon128.png",
    # Bundled in-browser AI provider (transformers.js + onnxruntime-web, vendored).
    "bundled-ai.js",
    "vendor/transformers.web.js",
    "vendor/ort.min.mjs",
    "vendor/ort-wasm-simd-threaded.mjs",
    "vendor/ort-wasm-simd-threaded.wasm",
    "vendor/vendored-manifest.json",
    # Shipped because it is the user-facing data-flow disclosure the Chrome Web Store
    # data-safety review reads, and it is a code-relevant document rather than project meta.
    "PRIVACY.md",
    "LICENSE"
)

$chromiumManifest = $manifest | ConvertTo-Json -Depth 10 | ConvertFrom-Json
$chromiumManifest.PSObject.Properties.Remove("browser_specific_settings")
$chromiumManifest.background = [pscustomobject]@{ service_worker = "background.js" }

$firefoxManifest = $manifest | ConvertTo-Json -Depth 10 | ConvertFrom-Json
# `key` is Chromium-only (pins the extension ID in Chrome-based browsers).
# Keep it OUT of Firefox-family manifests: web-ext/AMO lint flags it as an unexpected property.
$firefoxManifest.PSObject.Properties.Remove("key")
# Firefox has no importScripts() outside a worker context, so the shared tables
# are listed as a second background script (loaded before background.js).
$firefoxManifest.background = [pscustomobject]@{ scripts = @("shared-tables.js", "background.js") }

function Write-ManifestJson {
    param([object]$ManifestObj, [string]$Path)
    $json = $ManifestObj | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($Path, $json, (New-Object System.Text.UTF8Encoding($false)))
}

function Move-FileOverwriting {
    param([string]$Source, [string]$Destination)
    # [System.IO.File]::Move($src, $dst, $true) — the overwriting overload — is a
    # .NET Core / PowerShell 7 API. `npm run package` invokes `powershell.exe`, which
    # on Windows is Windows PowerShell 5.1 on .NET Framework, where only the
    # 2-argument Move exists. That call failed with a method-overload binding error
    # and aborted the build immediately after dist/chromium.zip, so the Firefox xpi,
    # zen-unpacked/, manifest-firefox.json and the release zip were never produced.
    # Prefer the atomic overwrite where it exists; otherwise fall back to a
    # same-volume delete + rename, which still cannot leave a truncated artifact.
    try {
        [System.IO.File]::Move($Source, $Destination, $true)
    }
    catch {
        if (Test-Path $Destination) {
            Remove-Item -Force -ErrorAction SilentlyContinue $Destination
        }
        [System.IO.File]::Move($Source, $Destination)
    }
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
        Move-FileOverwriting -Source $tempPath -Destination $DestinationPath
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
foreach ($file in $packageFiles) {
    $destPath = Join-Path $chromeDir $file
    $destDir = Split-Path -Parent $destPath
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    Copy-Item -Path (Join-Path $PSScriptRoot $file) -Destination $destPath -Force
}
$chromeZip = Join-Path $distDir "chromium.zip"
Compress-Archive -Path "$chromeDir\*" -DestinationPath $chromeZip -CompressionLevel Optimal
Write-Host "`n[OK] Chromium build -> dist/chromium/ + dist/chromium.zip" -ForegroundColor Green

# 5. Build dist/firefox (unpacked) + dist/firefox.zip + dist/firefox.xpi
$foxDir = Join-Path $distDir "firefox"
New-Item -ItemType Directory -Path $foxDir -Force | Out-Null
Write-ManifestJson -ManifestObj $firefoxManifest -Path (Join-Path $foxDir "manifest.json")
foreach ($file in $packageFiles) {
    $destPath = Join-Path $foxDir $file
    $destDir = Split-Path -Parent $destPath
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    Copy-Item -Path (Join-Path $PSScriptRoot $file) -Destination $destPath -Force
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
foreach ($file in $packageFiles) {
    $destPath = Join-Path $zenDir $file
    $destDir = Split-Path -Parent $destPath
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    Copy-Item -Path (Join-Path $PSScriptRoot $file) -Destination $destPath -Force
}
Write-ManifestJson -ManifestObj $firefoxManifest -Path (Join-Path $PSScriptRoot "manifest-firefox.json")
Copy-FileAtomic -SourcePath $foxZip -DestinationPath (Join-Path $PSScriptRoot "blacklist-firefox.zip")
Copy-FileAtomic -SourcePath $foxZip -DestinationPath (Join-Path $PSScriptRoot "blacklist-firefox.xpi")
Copy-FileAtomic -SourcePath $foxZip -DestinationPath (Join-Path $PSScriptRoot "blacklist-firefox.jar")
Write-Host "[OK] Zen helpers refreshed -> zen-unpacked/ + blacklist-firefox.* + manifest-firefox.json" -ForegroundColor Green

# 7. Build the release zip for GitHub Releases / Chrome Web Store.
# Contains EXACTLY the Chromium build: the extension files plus the Chromium manifest, and
# nothing else. The repo docs and install.bat are intentionally excluded so a downloader
# gets the extension rather than a copy of the repository's prose.
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
    foreach ($file in $packageFiles) {
        $destPath = Join-Path $stagingDir $file
        $destDir = Split-Path -Parent $destPath
        if (-not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }
        Copy-Item -Path (Join-Path $PSScriptRoot $file) -Destination $destPath
    }

    # The release zip must carry the same stripped Chromium manifest that dist/chromium
    # ships (no Chromium-only `key` leaking into a store upload, no Firefox background.scripts).
    Write-ManifestJson -ManifestObj $chromiumManifest -Path (Join-Path $stagingDir "manifest.json")

    Write-Host "`n[i] Compressing package into $zipName..." -ForegroundColor Cyan
    # Compress into a temp .zip beside the target, then swap it in with one rename:
    # an interrupted compression must never leave a truncated release zip behind.
    $zipTempPath = Join-Path $OutputDir ".$zipName.partial.zip"
    try {
        Compress-Archive -Path "$stagingDir\*" -DestinationPath $zipTempPath -CompressionLevel Optimal
        Move-FileOverwriting -Source $zipTempPath -Destination $zipPath
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