# Privacy Policy

**Unaware Sessions Browser Extension**
**Last updated:** 2026-04-18

## Summary

Unaware Sessions is a privacy-first browser extension. All data is stored locally by default. The extension collects no analytics, no telemetry, and no tracking data. The only network communication is an **opt-in** Google Drive sync feature — all synced data is encrypted end-to-end (AES-256-GCM) before leaving your device.

## Data Storage

All extension data is stored locally on your device using:

- **chrome.storage.local** — session profiles (name, color, emoji, settings)
- **chrome.storage.session** — tab-to-session mappings (cleared when browser closes)
- **Extension IndexedDB** — cookie snapshots and DOM storage snapshots per session per origin

No data is stored on external servers unless you explicitly enable Google Drive sync (see below).

## Data Collection

Unaware Sessions Browser Extension does **not** collect:

- Personal information (name, email, address, etc.)
- Browsing history or habits
- Analytics or telemetry data
- Tracking identifiers or cookies
- Crash reports

## Network Requests

Unaware Sessions makes **no network requests** by default. The extension:

- Does not phone home for updates (browser handles extension updates)
- Does not send crash reports or usage statistics
- Does not load remote resources, scripts, or stylesheets
- Does not contact any analytics, advertising, or tracking service

The **only** network communication occurs when you explicitly enable **Google Drive sync** in the Settings tab. See the next section for details.

## Google Drive Sync (Opt-In)

If you choose to enable Google Drive sync, the extension communicates with the Google Drive API to keep your sessions in sync across devices. This feature is **off by default** and requires explicit opt-in.

**What is synced:**

- Session profiles (name, color, emoji, settings)
- Cookie snapshots and DOM storage snapshots per session per origin
- All data is encrypted with **AES-256-GCM** (PBKDF2 key derivation, 600K iterations) **before** leaving your device

**How it works:**

- Uses the `drive.appdata` scope — a hidden, app-specific folder on your Google Drive that the extension cannot use to access any of your personal files
- Two files are stored: an unencrypted manifest (checksums only, no session data) and an encrypted payload
- The encryption key is derived from your Google User ID — only the same Google account can decrypt the data
- You can disconnect at any time from Settings, which revokes the OAuth token

**What is NOT synced:**

- Browsing history
- Live browser state or active tabs
- Auth tokens (these stay in the browser's OAuth store)

## Permissions

The extension requests the following permissions:

| Permission | Purpose |
|---|---|
| `storage` | Persist session profiles, settings, and tab mappings locally |
| `cookies` | Read/write/delete cookies per domain for session isolation |
| `tabs` | Track tab lifecycle, navigate tabs, update badges |
| `declarativeNetRequest` | Modify cookie headers on outbound requests for session isolation |
| `contextMenus` | "Open in Session" right-click menu |
| `alarms` | Auto-refresh, auto-sync, periodic cleanup |
| `favicon` | Display website icons in the popup interface |
| `identity` | Google OAuth2 token for opt-in Drive sync (only used when sync is enabled) |
| `<all_urls>` | Required for cookie access and content script injection across all websites |

## Third-Party Services

Unaware Sessions does not integrate with any analytics, advertising, or tracking services. The only third-party integration is the **opt-in Google Drive sync**, which uses the Google Drive API solely to store and retrieve encrypted session data in a hidden app folder (`drive.appdata`). No data is shared with Google in readable form — all payloads are encrypted before upload.

## User Control

- **View data:** All session profiles are visible in the popup and options page.
- **Export data:** Export all session data as a JSON file from the options page.
- **Disable sync:** Disconnect Google Drive at any time from Settings — revokes the OAuth token.
- **Delete data:** Delete individual sessions or clear all data from the options page.
- **Uninstall:** Removing the extension deletes all stored data.

## Children's Privacy

Unaware Sessions Browser Extension does not knowingly collect any data from children under the age of 13.

## Changes to This Policy

If this privacy policy is updated, the changes will be reflected in this document with an updated date. Continued use of the extension after changes constitutes acceptance of the revised policy.

## Contact

If you have questions about this privacy policy, please open an issue on the [Unaware Sessions Browser Extension GitHub repository](https://github.com/msaidbilgehan/unaware-sessions-browser-extension).
