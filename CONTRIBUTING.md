# Contributing to Always New To You

Thank you for your interest in improving **Always New To You - Smart Feed Blacklist**! Contributions from the open-source community are always welcome.

---

## Code of Conduct

Please be respectful, constructive, and courteous in all discussions, issues, and pull requests.

---

## How Can I Contribute?

### 1. Reporting Bugs
YouTube updates its web client frontend and DOM components frequently. If YouTube alters its component structures or breaks a selector:
- Check existing [GitHub Issues](https://github.com/PyrateGFXProductions/YouTube-Blacklister/issues) to see if the issue has already been reported.
- Open a new issue using the **Bug Report** template.
- Include your browser version and any console logs starting with `[NewToYouExt]`.

### 2. Suggesting Enhancements
Feature ideas and rule improvements are welcome! Open an issue using the **Feature Request** template to discuss your idea before opening a PR.

### 3. Submitting Pull Requests
1. **Fork** the repository and create a branch for your feature or bug fix:
   ```bash
   git checkout -b feature/my-enhancement
   ```
2. **Make your changes** cleanly. Please adhere to the project's design principles:
   - **Zero Network Fingerprint**: Never contact external servers or alter YouTube's outgoing analytics/feedback requests unless explicitly toggled by the user.
   - **Local Storage First**: Store state exclusively in `chrome.storage.local`.
   - **Defensive DOM Operations**: Wrap all asynchronous operations in `try/catch` guards so unhandled rejections never cause Chrome to flag extension issues.
   - **Watch-Page Isolation**: Never touch `ytd-watch-flexy` or `ytd-watch-metadata` to ensure video playback is completely untouched.
3. **Test thoroughly**:
   - Load the unpacked extension in Chrome / Edge / Brave.
   - Verify that adding, unblocking, and filtering work smoothly across YouTube pages.
4. **Commit & Push**:
   ```bash
   git commit -m "feat: describe your change"
   git push origin feature/my-enhancement
   ```
5. **Open a Pull Request** against the `master` branch.

---

## Local Development & Testing

1. Clone or download the repository:
   ```bash
   git clone https://github.com/PyrateGFXProductions/YouTube-Blacklister.git
   ```
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the repository root directory.
5. Open `https://www.youtube.com/` and open Developer Tools (`F12`) to inspect console logs and DOM mutations.

---

## Packaging a Release

To generate a clean zip distribution ready for upload:
```powershell
.\package-extension.ps1
```
This produces a release zip archive in the root directory, excluding development, git, and system files.

---

## Support the Project

If you love this tool and want to support ongoing maintenance and new features, consider [buying us a coffee on Ko-fi](https://ko-fi.com/pyrategfxproductions)!
