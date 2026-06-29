# Edge Store Certification Notes

## Extension Overview

Unaware Sessions is a privacy-first browser extension that enables isolated browsing sessions within a single browser window. Each session maintains its own cookies, localStorage, sessionStorage, and IndexedDB, allowing users to manage multiple accounts on the same website without conflicts.

## Key Features

1. **Session Management** - Create, switch, rename, duplicate, and delete sessions
2. **Cookie Isolation** - Save and restore cookies per session with soft/strict modes
3. **Storage Isolation** - DOM storage (localStorage, sessionStorage, IndexedDB) saved/restored per session
4. **WebDAV Backup** - Encrypted backups to any WebDAV server (self-hosted, no cloud dependency)
5. **Auto-refresh** - Periodic session data refresh for active tabs
6. **Security** - Optional passcode and biometric protection

## Testing Instructions

### Basic Session Flow
1. Click the extension icon to open the popup
2. Create a new session (click "+" or press `n`)
3. Switch to a session by clicking its card
4. The tab will navigate to a fresh page with isolated cookies
5. Log into any website (e.g., GitHub, Twitter)
6. Switch back to "Default (no session)" - notice you're logged out
7. Switch to your session again - notice you're still logged in

### Multi-Account Test
1. Create "Account A" session, log into a website
2. Create "Account B" session, log into the same website with different credentials
3. Switch between sessions to verify independent login states

### WebDAV Backup
1. Go to Options > Settings > WebDAV Backup
2. Enter WebDAV server details (host, username, password, path)
3. Click "Test Connection" to verify
4. Click "Backup Now" or use the upload icon in popup header
5. Restore via the download icon in popup header

### Data Persistence
1. Create a session and log into a website
2. Close and reopen the browser
3. Open the popup - your session should still be listed
4. Switch to the session - login state should persist

## Permissions Justification

| Permission | Reason |
|------------|--------|
| `storage` | Store session profiles, settings, and sync config |
| `cookies` | Save/restore cookies for session isolation |
| `tabs` | Track active tab, assign sessions to tabs |
| `declarativeNetRequest` | Filter Cookie headers per session for DNR-based isolation |
| `contextMenus` | "Open in Session" right-click menu |
| `alarms` | Auto-refresh and WebDAV backup scheduling |
| `favicon` | Display site favicons in session list |
| `<all_urls>` | Access cookies and storage on any website for session isolation |

## Privacy

- **Zero telemetry** - No analytics, no tracking, no external network calls
- **All data local** - Session data stored in extension's IndexedDB
- **WebDAV only** - Optional backup to user's own server (encrypted with AES-256-GCM)
- **No data collection** - Extension does not collect or transmit any user data

## Technical Notes

- Built with TypeScript + Svelte 5 + Vite
- Manifest V3 compliant
- Service worker architecture (no persistent background page)
- Content scripts run at `document_start` for storage isolation before page scripts execute

## Known Limitations

- IndexedDB restore may fail on some sites with complex schemas (e.g., Signal Protocol)
- Some websites may require page refresh after session switch
- WebDAV backup requires user to provide their own server


