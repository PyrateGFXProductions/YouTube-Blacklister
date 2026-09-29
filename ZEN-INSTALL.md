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

## Step 1 — Run the Enterprise Unlock & Auto-Installer

**Run `fix-zen-install.bat`** (double-click it) **with Zen Browser fully closed**.

The script will:
1. Automatically request Administrator elevation via Windows UAC.
2. Abort safely if Zen is currently running (Zen must be closed before writing settings).
3. Back up and unlock your profile's `prefs.js`.
4. Write `distribution\policies.json` to Zen's installation folder with `installation_mode: force_installed`.
   - **Why this works:** Mozilla/Gecko's Enterprise Policy engine explicitly disables signature verification for policy-installed extensions. This permanently unlocks the add-on without needing AMO store signing.

## Step 2 — Start Zen Browser

1. Start **Zen Browser**.
2. Open `about:addons` (or press `Ctrl+Shift+A`).
3. You will see **"Always New To You - Smart Feed Blacklist"** already installed and active!
4. Because it is installed via Enterprise Policy, **Zen will never delete its storage on close**, and all your blacklist keywords, channels, and settings persist across restarts.

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
  2. In this folder — run `.\package-extension.ps1` first, since `zen-unpacked/` is generated locally and is not part of the repository:
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