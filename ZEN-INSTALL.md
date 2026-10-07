# Zen Browser Installation

## Why a permanent install is the only storage-safe option

> **⚠️ Read this first — why your rules "disappear":**
> The only storage-safe way to load this extension in Zen is an install that survives a
> restart, so the extension keeps a stable identity from
> `browser_specific_settings.gecko.id` (`youtubeblacklister@pyrategfx.productions`) and
> `chrome.storage.local` (keywords, channels, whitelist, settings) persists across updates
> and restarts.
> **Do NOT rely on `about:debugging` → "Load Temporary Add-on"** — temporary add-ons are
> unloaded on every restart, and Firefox removes their `storage.local`, which wipes all your
> rules.
> And **do not remove + reinstall to update**: in Firefox, uninstalling deletes the
> extension's storage. Updating = installing the new `.xpi` **over** the existing one (same
> `gecko.id`, same storage).
> **Before you switch install methods, export a backup:** popup → **Settings** →
> **Export Backup** (opens the Backup & Restore page). Import it once after the permanent
> install and nothing can be lost along the way.

## The signature problem, stated accurately

Zen is a **release-branded** Firefox fork, and release-branded Gecko builds enforce add-on
signing no matter what the preference says. Mozilla allows the
`xpinstall.signatures.required` override only in **Firefox ESR, Developer Edition, Nightly
and unbranded builds**. Zen's own maintainers confirm the preference has no effect there —
*"Currently the xpinstall.signatures.required and xpinstall.whitelist.required doesn't do
anything"* ([zen-browser/desktop discussion #8961](https://github.com/zen-browser/desktop/discussions/8961)).

So: **editing `prefs.js` (or `user.js`) cannot unlock unsigned installs in Zen.** This repo's
earlier `fix-zen-install.bat` was built on that false premise and could not have worked.

Exactly two routes can give a permanent install. **Route A is the only guaranteed one, and
the only one that survives a Zen update.**

---

## Route A — Sign the XPI with AMO (recommended · guaranteed · update-proof)

Unlisted ("self-distributed") signing is **free and automatic** (no human review), and it does
**not** publish the extension in the add-on store. A signed `.xpi` installs permanently in Zen
and every other Firefox-family browser with no preferences, no policies and no admin rights —
and it keeps working after a Zen update.

### Option A1 — Upload in the browser (no CLI, no keys on disk)

1. Run `.\package-extension.ps1` first, so `blacklist-firefox.xpi` is current.
2. Open <https://addons.mozilla.org/developers/addon/submit/distribution> and sign in
   (a free Mozilla account).
3. Choose **On your own site** (unlisted) and upload `blacklist-firefox.xpi`.
4. Validation takes about a minute; AMO returns a **signed** `.xpi`.
5. In Zen: `about:addons` → gear ⚙ → **Install Add-on From File...** → pick the signed `.xpi`.

### Option A2 — Command line (`web-ext sign`)

Generate API keys at <https://addons.mozilla.org/developers/addon/api/key/>, then:

```powershell
.\package-extension.ps1
npm install -g web-ext
$env:WEB_EXT_API_KEY="<your API key>"
$env:WEB_EXT_API_SECRET="<your API secret>"
npx web-ext sign --source-dir .\zen-unpacked --artifacts-dir .\signed --channel unlisted
```

Install the resulting `.\signed\*.xpi` via `about:addons` → **Install Add-on From File...**.

### Updating

Sign the new version the same way and install it **over** the existing one. Never uninstall
first — that deletes your stored rules.

---

## Route B — Local enterprise policy (may work · unverified · wiped by Zen updates)

The policy engine installs whatever XPI is named in `distribution\policies.json`. Whether it
**also waives the signature check** is not something this project can state as verified:
Mozilla does not document an unsigned waiver for `force_installed`, and Zen enforces signing
like a release build. Treat this as an experiment, and verify it rather than assuming it:

- `about:policies` — your `ExtensionSettings` entry should be listed. An empty page means the
  file was not read (wrong path or wrong JSON).
- `about:addons` — the extension should appear on its own, without a manual install.

**Known drawback:** Zen's updater replaces `C:\Program Files\Zen Browser`, so
`distribution\policies.json` is **deleted on every Zen update** and must be re-applied. That
makes this route a recurring chore, which is exactly why Route A is recommended.

1. Close Zen Browser completely.
2. In an Administrator PowerShell (`Win + X` → *Terminal (Admin)*):

   ```powershell
   $polDir = "C:\Program Files\Zen Browser\distribution"
   # Set this to the folder you extracted this repository into, then point install_url at
   # the XPI inside it. Replace the placeholder below with your own absolute path — do not
   # copy someone else's, and note that policies.json does NOT expand environment variables,
   # so a literal path is required.
   $xpiPath = "C:\path\to\YouTube-Blacklister\blacklist-firefox.xpi"
   New-Item -ItemType Directory -Path $polDir -Force | Out-Null
   @"
   {
     "policies": {
       "ExtensionSettings": {
         "youtubeblacklister@pyrategfx.productions": {
           "installation_mode": "force_installed",
           "install_url": "file:///$($xpiPath -replace '\\','/')"
         }
       }
     }
   }
   "@ | Set-Content (Join-Path $polDir "policies.json") -Encoding UTF8
   ```

3. Launch Zen and check `about:policies` and `about:addons` as described above.

`fix-zen-install.bat` automates this step (and writes a `user.js` copy of the preference,
which Zen is expected to ignore — it is kept only so the script is honest about what it did).

---

## Refreshing after source changes

The packages are generated from the universal `manifest.json` by `.\package-extension.ps1`.
After editing any source file:

1. Re-run `.\package-extension.ps1` so `blacklist-firefox.xpi` reflects your changes.
2. **Route A:** re-sign the new build, then install it over the existing one.
   **Route B:** re-install over the existing one (in-place upgrade, same `gecko.id` — your
   rules are kept). Never uninstall first.

### Files Ready for Installation

- `blacklist-firefox.xpi` (needs signing for a permanent install — see Route A)
- `blacklist-firefox.zip`
- `blacklist-firefox.jar`

## Troubleshooting

- **"This add-on could not be installed because it appears to be corrupt" / "not verified":**
  you are installing an **unsigned** XPI. Release-branded Zen will always refuse it; use
  Route A.
- **`about:policies` is empty after Route B:** the file was not read — check the path is
  exactly `C:\Program Files\Zen Browser\distribution\policies.json` and the JSON parses.
- **The policy worked, then stopped after a Zen update:** expected — the update replaced the
  install directory. Re-apply, or move to Route A.
- **Temporary installs need no signature** but wipe your rules on restart — use them only as a
  smoke test, never as your permanent install.
- **Rules missing after install?** Export a backup **before** switching methods
  (popup → Settings → **Export Backup**) and import once after. The extension's storage is
  keyed to the installed add-on, so a temporary instance's data is not carried over
  automatically.
