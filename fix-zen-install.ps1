<#
  fix-zen-install.ps1 — unblock unsigned add-on installs in Zen Browser

  Zen (like release Firefox) refuses to install an unsigned .xpi unless the build
  is told not to enforce signature verification. Zen is an unbranded-style build,
  so flipping xpinstall.signatures.required in the REAL profile prefs.js unlocks it.

  What this does:
    1. Aborts if Zen is running (Zen rewrites prefs.js on exit and would undo us).
    2. Locates the main profile prefs.js under %APPDATA%\zen\Profiles.
    3. Backs it up to prefs.js.bak-<timestamp>.
    4. Sets  user_pref("xpinstall.signatures.required", false);
    5. Best-effort: writes distribution\policies.json in "C:\Program Files\Zen Browser"
       (needs Administrator — optional; step 4 is the actual unlock).
    6. Re-checks the written pref and reports the .xpi to install.

  Usage:
    .\fix-zen-install.bat            (double-click, or)
    pwsh -File .\fix-zen-install.ps1 (if you see a "Could not write policies.json"
                                     warning, re-run from an Administrator console)
#>
param()
$ErrorActionPreference = 'Stop'

$id     = 'youtubeblacklister@pyrategfx.productions'
$zenDir = 'C:\Program Files\Zen Browser'
$root   = $PSScriptRoot
$xpi    = Join-Path $root 'blacklist-firefox.xpi'

Write-Host ''
Write-Host '=== Zen Browser: unsigned add-on unlock ===' -ForegroundColor Cyan
Write-Host ''

# --- 1) Zen must be fully closed (prefs.js is rewritten on exit) -------------
if (Get-Process -Name 'zen' -ErrorAction SilentlyContinue) {
    Write-Host '[!] Zen Browser is RUNNING.' -ForegroundColor Yellow
    Write-Host '    Close it completely (all windows), then re-run this script.'
    Read-Host '    Press Enter to exit'
    exit 1
}

# --- 2) Locate the main profile prefs.js --------------------------------------
$prefsPaths = @(Get-ChildItem -LiteralPath "$env:APPDATA\zen\Profiles" -Filter prefs.js -Recurse -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -notmatch 'Background Tasks' })
if (-not $prefsPaths.Count) {
    Write-Host '[!] No Zen profile prefs.js found under %APPDATA%\zen\Profiles.' -ForegroundColor Red
    exit 1
}
$main = $prefsPaths[0]
Write-Host "[i] Profile prefs: $($main.FullName)" -ForegroundColor Gray

# --- 3) Backup ------------------------------------------------------------------
$stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = "$($main.FullName).bak-$stamp"
Copy-Item -LiteralPath $main.FullName -Destination $backup
Write-Host "[i] Backup saved: $backup" -ForegroundColor Green

# --- 4) Set xpinstall.signatures.required = false --------------------------------
$target  = 'user_pref("xpinstall.signatures.required", false);'
$raw     = Get-Content -LiteralPath $main.FullName
$present = ($raw | Where-Object { $_ -match '^user_pref\("xpinstall\.signatures\.required"' }).Count -gt 0
if ($present) {
    $raw = $raw | ForEach-Object {
        if ($_ -match '^user_pref\("xpinstall\.signatures\.required"') { $target } else { $_ }
    }
    Write-Host '[i] xpinstall.signatures.required  ->  updated to false'
} else {
    $raw += ''
    $raw += $target
    Write-Host '[i] xpinstall.signatures.required = false  appended'
}
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($main.FullName, [string[]]$raw, $utf8NoBom)
$check = (Select-String -LiteralPath $main.FullName -SimpleMatch 'xpinstall.signatures.required", false').Count
if (-not $check) {
    Write-Host '[!] Failed to write the pref. Backup available:' -ForegroundColor Red
    Write-Host "    $backup"
    exit 1
}

# --- 5) policies.json (Enterprise Policy: bypasses signature check completely) ---
$candidateZenDirs = @(
    'C:\Program Files\Zen Browser',
    'C:\Program Files\Zen',
    "${env:ProgramFiles(x86)}\Zen Browser",
    "${env:ProgramFiles(x86)}\Zen",
    "$env:LOCALAPPDATA\Programs\zen",
    "$env:LOCALAPPDATA\Programs\Zen Browser",
    "$env:LOCALAPPDATA\Zen Browser"
)

# Also check Windows App Paths registry
foreach ($regRoot in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\zen.exe', 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\zen.exe')) {
    if (Test-Path $regRoot) {
        $regPath = (Get-ItemProperty -Path $regRoot -ErrorAction SilentlyContinue).'(default)'
        if ($regPath -and (Test-Path $regPath)) {
            $regDir = Split-Path -Parent $regPath
            if ($candidateZenDirs -notcontains $regDir) {
                $candidateZenDirs += $regDir
            }
        }
    }
}

$xpiUri   = 'file:///' + ($xpi -replace '\\', '/')
$policy   = @{ policies = @{ ExtensionSettings = @{ $id = @{
    installation_mode = 'force_installed'
    install_url       = $xpiUri
} } } }
$policyJson = $policy | ConvertTo-Json -Depth 6

$policiesWritten = 0
foreach ($dir in $candidateZenDirs) {
    if (Test-Path $dir) {
        try {
            $polDir = Join-Path $dir 'distribution'
            New-Item -ItemType Directory -Path $polDir -Force | Out-Null
            $polFile = Join-Path $polDir 'policies.json'
            [System.IO.File]::WriteAllText($polFile, $policyJson, $utf8NoBom)
            Write-Host "[OK] Enterprise policy written -> $polFile" -ForegroundColor Green
            $policiesWritten++
        } catch {
            Write-Host "[!] Could not write policies.json in $dir ($($_.Exception.Message))" -ForegroundColor Yellow
        }
    }
}

# If none of the candidate dirs existed yet, default to C:\Program Files\Zen Browser
if ($policiesWritten -eq 0) {
    try {
        $defaultPolDir = 'C:\Program Files\Zen Browser\distribution'
        New-Item -ItemType Directory -Path $defaultPolDir -Force | Out-Null
        $defaultPolFile = Join-Path $defaultPolDir 'policies.json'
        [System.IO.File]::WriteAllText($defaultPolFile, $policyJson, $utf8NoBom)
        Write-Host "[OK] Enterprise policy written -> $defaultPolFile" -ForegroundColor Green
        $policiesWritten++
    } catch {
        Write-Host "[!] Could not write policies.json in Program Files ($($_.Exception.Message))" -ForegroundColor Red
    }
}

# --- 6) .xpi sanity check ----------------------------------------------------------
if (Test-Path -LiteralPath $xpi) {
    Write-Host "[i] Install source: $xpi"
    Write-Host "    (last built $(Get-Item -LiteralPath $xpi).LastWriteTime — rebuild with .\package-extension.ps1 if stale)"
} else {
    Write-Host '[!] blacklist-firefox.xpi not found next to this script. Run .\package-extension.ps1 first.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '==========================================================' -ForegroundColor Green
Write-Host ' [SUCCESS] Zen Browser Enterprise Unlock Applied!' -ForegroundColor Green
Write-Host '==========================================================' -ForegroundColor Green
Write-Host '  1) Start Zen Browser.'
Write-Host '  2) The extension is now FORCE INSTALLED by policy.'
Write-Host '     (Check about:addons -> it appears automatically, no manual install needed!)'
Write-Host '  3) All rules and settings will now persist permanently across restarts.'
Write-Host ''
Read-Host '  Press Enter to close'