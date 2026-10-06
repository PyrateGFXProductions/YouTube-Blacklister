<#
  fix-zen-install.ps1 — unblock unsigned add-on installs in Zen Browser

  Zen is a RELEASE-BRANDED Gecko build: it refuses unsigned .xpi files and does NOT honour
  the xpinstall.signatures.required override. Mozilla permits that override only in Firefox
  ESR, Developer Edition, Nightly and unbranded builds, and Zen's own maintainers confirm the
  preference does nothing there (zen-browser/desktop discussion #8961).

  So the pref written here (as user.js, the durable location) is EXPECTED TO BE IGNORED. The
  operative step is the Enterprise Policy below — and whether the policy engine waives the
  signature check is NOT guaranteed either. The only guaranteed permanent install is an
  AMO-signed XPI: see ZEN-INSTALL.md (Route A).

  What this does:
    1. Aborts if Zen is running (Zen rewrites prefs.js on exit and would undo us).
    2. Locates the main profile under %APPDATA%\zen\Profiles.
    3. Backs its prefs.js up to prefs.js.bak-<timestamp>.
    4. Writes user_pref("xpinstall.signatures.required", false) to user.js for the record
       (expected to be ignored by Zen — see above).
    5. Writes distribution\policies.json in "C:\Program Files\Zen Browser" and prints how to
       VERIFY it (about:policies / about:addons).
    6. Reports the .xpi to install, and re-apply-after-update guidance.

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

# --- 4) Record xpinstall.signatures.required = false (EXPECTED TO BE IGNORED by Zen) --------
# user.js is the durable location: Gecko re-applies it on every startup, whereas prefs.js is
# rewritten by the browser itself. Zen is a release-branded build and is expected to ignore
# this override entirely (see the header) — it is written so the script's effect is explicit
# rather than implied.
$target   = 'user_pref("xpinstall.signatures.required", false);'
$userJs   = Join-Path (Split-Path -Parent $main.FullName) 'user.js'
$keep     = @()
if (Test-Path -LiteralPath $userJs) {
    $keep = @(Get-Content -LiteralPath $userJs | Where-Object { $_ -notmatch '^user_pref\("xpinstall\.signatures\.required"' })
}
$outLines = @($keep) + @('', $target)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($userJs, [string[]]$outLines, $utf8NoBom)
Write-Host "[i] user.js updated: $userJs" -ForegroundColor Yellow
Write-Host '    (this pref is expected to be IGNORED by Zen - the policy below is the operative step)' -ForegroundColor DarkGray

# --- 5) policies.json (Enterprise Policy: asks Zen to install the XPI by itself) ------------
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
Write-Host ' Policy written - VERIFY before trusting it:' -ForegroundColor Green
Write-Host '==========================================================' -ForegroundColor Green
Write-Host '  1) Start Zen Browser.'
Write-Host '  2) Open about:policies and confirm the ExtensionSettings entry is listed.'
Write-Host '     (An EMPTY page means the file was not read - check the path and the JSON.)'
Write-Host '  3) Open about:addons. If the extension did NOT install by itself, this route'
Write-Host '     cannot waive the signature check on this build. Use an AMO-signed XPI'
Write-Host '     (Route A in ZEN-INSTALL.md) - that route always works.'
Write-Host '  4) NOTE: a Zen update replaces the install folder and DELETES'
Write-Host '     distribution\policies.json. Re-run this script after each update, or'
Write-Host '     move to a signed XPI once and never think about it again.'
Write-Host ''
Read-Host '  Press Enter to close'