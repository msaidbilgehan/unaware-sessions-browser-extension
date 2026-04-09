# Privacy Policy

**Unaware Sessions Browser Extension**
**Last updated:** 2026-04-08

## Summary

Unaware Sessions is a privacy-first browser extension that runs entirely on your device. It makes zero network calls, collects no data, and sends nothing to external servers.

## Data Storage

All extension data is stored locally on your device using:

- **chrome.storage.local** — session profiles (name, color, emoji, settings)
- **chrome.storage.session** — tab-to-session mappings (cleared when browser closes)
- **Extension IndexedDB** — cookie snapshots and DOM storage snapshots per session per origin

No data is stored on external servers, cloud services, or third-party infrastructure.

## Data Collection

Unaware Sessions Browser Extension does **not** collect:

- Personal information (name, email, address, etc.)
- Browsing history or habits
- Analytics or telemetry data
- Tracking identifiers or cookies
- Crash reports

## Network Requests

Unaware Sessions makes **zero outbound network requests**. The extension:

- Does not contact any server, API, or endpoint
- Does not phone home for updates (browser handles extension updates)
- Does not send crash reports or usage statistics
- Does not load remote resources, scripts, or stylesheets

## Permissions

The extension requests the following permissions, all used exclusively for local session management:

| Permission | Purpose |
|---|---|
| `storage` | Persist session profiles and tab mappings locally |
| `cookies` | Read/write/delete cookies per domain for session isolation |
| `tabs` | Track tab lifecycle, navigate tabs, update badges |
| `declarativeNetRequest` | Modify cookie headers on outbound requests for session isolation |
| `contextMenus` | "Open in Session" right-click menu |
| `alarms` | Periodic state persistence and stale rule cleanup |
| `favicon` | Display website icons in the popup interface |
| `<all_urls>` | Required for cookie access and content script injection across all websites |

## Third-Party Services

Unaware Sessions Browser Extension does not integrate with any third-party analytics, advertising, or tracking services.

## User Control

- **View data:** All session profiles are visible in the popup and options page.
- **Export data:** Export all session profiles as a JSON file from the options page.
- **Delete data:** Delete individual sessions or clear all data from the options page.
- **Uninstall:** Removing the extension deletes all stored data.

## Children's Privacy

Unaware Sessions Browser Extension does not knowingly collect any data from children under the age of 13.

## Changes to This Policy

If this privacy policy is updated, the changes will be reflected in this document with an updated date. Continued use of the extension after changes constitutes acceptance of the revised policy.

## Contact

If you have questions about this privacy policy, please open an issue on the [Unaware Sessions Browser Extension GitHub repository](https://github.com/msaidbilgehan/unaware-sessions-browser-extension).
