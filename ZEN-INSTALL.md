# Zen Browser Installation

## Installing the Extension

Zen Browser requires a packaged `.xpi` file. Zen is built from an unbranded-style Firefox
fork, so it **enforces add-on signatures by default** unless told otherwise — that enforcement
is exactly the "extension is not verified" block you hit.

> **⚠️ Read this first — why your rules "disappear":**
> The only storage-safe way to load this extension in Zen is the **persistent `.xpi` install**
> described below ("Install Add-on From File..."). Its stable identity comes from
> `browser_specific_settings.gecko.id` (`youtubeblacklister@pyrategfx.productions`), so
> `chrome.storage.local` (keywords, channels, whitelist, settings) survives updates,
> restarts, and reinstall-over.
> **Do NOT load it via `about:debugging` → "Load Temporary Add-on"** — temporary add-ons get a
> random per-session ID and Firefox **deletes their storage.local on unload**, which wipes all
> your rules on every restart or update.
> And do **not remove + reinstall** to update: in Firefox uninstalling deletes the extension's
> storage. Updating = installing the new `.xpi` **over** the existing one (same `gecko.id`,
> same storage).

## Step 1 — One-Time Signature Unlock (required for any unsigned `.xpi`)

**Run `fix-zen-install.bat`** (double-click it) **with Zen Browser fully closed**. The script
will:

1. Abort safely if Zen is still running (Zen rewrites `prefs.js` on exit and would undo the change).
2. Find your real profile at `%APPDATA%\zen\Profiles\...\prefs.js`.
3. Back it up to `prefs.js.bak-<timestamp>`.
4. Set `xpinstall.signatures.required = false` — this is what unlocks the unsigned install.
5. Best-effort: write `distribution\policies.json` in `C:\Program Files\Zen Browser`
   (needs Administrator — optional; skip it if it warns, it's a fallback, not the unlock).

Manual alternative: open `about:config`, search `xpinstall.signatures.required`, set it to
`false`, then **restart Zen** (the pref is only read at startup).

## Step 2 — Install the Extension

1. Close Zen completely, then run the unlock above, then **restart Zen**.
2. Go to `about:addons` (or `Ctrl+Shift+A`).
3. Click the **gear/settings icon** in the top-right.
4. Select **"Install Add-on From File..."**.
5. Choose `blacklist-firefox.xpi` from this folder.
6. Confirm the permission prompt.
7. Your existing rules reappear automatically — nothing was ever deleted, storage is intact
   under the same `gecko.id`.

## Step 3 — Pin the Extension Icon (if not visible)

1. Click the puzzle icon in Zen's toolbar.
2. Click the pin icon next to "New To You Blacklist Manager".

## Step 4 — Verify Installation

1. Visit `https://www.youtube.com`.
2. Click the extension icon in the toolbar.
3. The popup should appear with the blacklist interface.

## Refreshing After Source Changes

The packages are generated from the universal `manifest.json` by `.\package-extension.ps1`.
After editing any source file:
1. Re-run `.\package-extension.ps1` so `blacklist-firefox.xpi` reflects your changes.
2. **Update via "Install Add-on From File..." again** (in-place upgrade, same `gecko.id` —
   your rules are kept). Never uninstall first.

### Files Ready for Installation

- `blacklist-firefox.xpi` (recommended)
- `blacklist-firefox.zip`
- `blacklist-firefox.jar`

## Troubleshooting

- **Still "not verified"?** Re-check `about:config` → `xpinstall.signatures.required` is
  `false`, and that Zen was restarted after changing it.
- **policies.json warning in the script?** Re-run `fix-zen-install.bat` from an
  Administrator PowerShell (`Win+X` → *Terminal (Admin)* → `.\fix-zen-install.bat`).
- **Rules missing after install?** They live under the stable `gecko.id`; export first next
time (popup → Settings → **Export Backup** opens the Backup & Restore page) and import once if needed.
- **Last resort — self-sign via AMO (works on every Firefox-family build, no exceptions):**
  1. Create a free account at `addons.mozilla.org` and generate API keys at
     `https://addons.mozilla.org/developers/addon/api/key/`.
  2. In this folder:
     ```powershell
     npm install -g web-ext
     $env:WEB_EXT_API_KEY="<your API key>"
     $env:WEB_EXT_API_SECRET="<your API secret>"
     npx web-ext sign --source-dir .\zen-unpacked --artifacts-dir .\signed --channel unlisted
     ```
  3. Install the freshly signed `.\signed\*.xpi` via "Install Add-on From File..." — a signed
     add-on bypasses signature enforcement entirely, and future updates are signed the same way.
- **Try `about:debugging`** only as a smoke test: "Load Temporary Add-on" → `blacklist-firefox.xpi`.
  Temporary loads need no signature, **but they wipe your rules on restart — never your permanent
  install**.