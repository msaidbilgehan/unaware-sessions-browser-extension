# Unaware Sessions Browser Extension

**Open-source, privacy-first multi-session browser manager — entirely local.**

---

## Project Aim

Unaware Sessions Browser Extension lets you run multiple isolated browser sessions side-by-side within a single browser window. Each tab operates in its own sandboxed context with separate cookies, storage, and credentials — no cloud accounts, no telemetry, no subscriptions. Everything lives on your machine.

Think of it as SessionBox, but open-source and offline-only by design.

---

## Motivation

Managing multiple accounts on the same service (Gmail, Twitter, dev/staging/prod environments, client dashboards) is a daily reality for developers, QA engineers, social media managers, and freelancers. The existing solutions come with trade-offs:

- **SessionBox** is proprietary, requires an account, syncs data to external servers, and locks advanced features behind a paywall.
- **Browser profiles** (Chrome, Firefox) are heavyweight — each profile is a separate OS-level process with its own window, history, and extensions. Switching between eight client accounts means eight windows.
- **Incognito / Private windows** don't persist sessions and can't run in parallel with identity separation.
- **Multi-Account Containers** (Firefox) are the closest native solution but are Firefox-only and lack cross-browser portability.

Unaware Sessions Browser Extension fills the gap: lightweight session isolation that works inside your existing browser, stores nothing remotely, and is fully auditable.

---

## Tech Stack

| Layer | Technology | Role |
|---|---|---|
| Extension Runtime | WebExtensions API (Manifest V3) | Cross-browser extension framework |
| Session Isolation | `chrome.cookies` API + content script storage swap | Sandboxed cookie jars per tab |
| Storage | `chrome.storage.local` + extension IndexedDB | Persist session profiles, labels, colors |
| UI Framework | Svelte | Popup & sidebar interface |
| Styling | CSS Custom Properties | Design system with light/dark themes |
| Build System | Vite + @crxjs/vite-plugin | Dev server, hot reload, packaging |
| Language | TypeScript | End-to-end type safety |

---

## Features

**Core**

- Create named, color-coded session profiles (e.g. `work-gmail`, `client-A`, `staging`)
- Each profile gets its own isolated cookie jar, localStorage, and sessionStorage
- Open any link in any session context via right-click menu
- Tab badge indicators showing which session a tab belongs to
- Switch a tab's session identity with automatic page navigation
- Domain-grouped session list — "This site" shows relevant sessions, "Other sessions" collapsed
- "Default (no session)" option for clean browsing / fresh login

**Management**

- Import / export session profiles as JSON with visual diff preview
- Drag-to-reorder sessions
- Per-session storage usage dashboard

**Privacy**

- Zero network calls — the extension makes no outbound requests, ever
- No analytics, no crash reporting, no update pings beyond the browser's own extension update mechanism
- All data stored in `chrome.storage.local` + extension IndexedDB; nothing leaves the device

**Developer-Friendly**

- Per-session User-Agent override (configurable in settings interface)

---

## Basic Flow

```
┌──────────────────────────────────────────────────────┐
│  User clicks "New Session"                           │
│  ┌─────────────────────────────┐                     │
│  │ Popup UI (Svelte)           │                     │
│  │  - Name: "client-A"         │                     │
│  │  - Color: #3B82F6           │                     │
│  └────────────┬────────────────┘                     │
│               │                                      │
│               ▼                                      │
│  ┌─────────────────────────────┐                     │
│  │ Background Service Worker   │                     │
│  │  1. Save session profile in │                     │
│  │     chrome.storage.local    │                     │
│  │  2. Store profile metadata  │                     │
│  │     and tab-session mapping │                     │
│  │  3. Register tab listeners  │                     │
│  └────────────┬────────────────┘                     │
│               │                                      │
│               ▼                                      │
│  ┌─────────────────────────────┐                     │
│  │ Tab Opens in Sandboxed      │                     │
│  │ Context                     │                     │
│  │  - Isolated cookies         │                     │
│  │  - Isolated storage         │                     │
│  │  - Badge: "client-A" 🔵    │                     │
│  └─────────────────────────────┘                     │
│                                                      │
│  Repeat: user opens more tabs in same or different   │
│  sessions. Each tab's context is tracked by the      │
│  service worker and routed to the correct jar.       │
└──────────────────────────────────────────────────────┘
```

**Lifecycle in brief:**

1. User creates a session profile (name, color, optional settings).
2. Background worker stores the session profile and tracks the tab-session mapping.
3. Any tab opened under that session inherits the isolated context.
4. On session switch, cookies are saved/swapped for the origin and the page navigates to apply new session.
5. When the user closes a session, its tabs close and its cookie jar can be preserved or wiped — user's choice.

---

## Usage

### Install from Source

```bash
# Clone the repository
git clone https://github.com/<org>/Unaware Sessions Browser Extension.git
cd Unaware Sessions Browser Extension

# Install dependencies
npm install

# Development mode
npm run dev

# Production build
npm run build
```

### Load as Unpacked Extension

**Chrome / Edge / Brave:**

1. Navigate to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `dist/`

### Quick Start

1. Click the Unaware Sessions Browser Extension icon in the toolbar.
2. Hit **+ New Session** — give it a name and pick a color.
3. Right-click any link → **Open in Session** → choose your session.
4. The tab opens with a colored badge. Cookies and storage are fully isolated.
5. Create more sessions as needed. Switch any tab between sessions from the popup.

---

## Future Work

> All items below are **out of scope for v1**. See [2-Product-Specifications.md](2-Product-Specifications.md) Section 10 for detailed specifications.

### Drive Sync (Encrypted Cloud Sync)

An opt-in module that syncs encrypted session profiles to a cloud drive of the user's choice. The extension itself still makes zero direct network calls — sync is mediated entirely through the drive's local client folder.

**Planned approach:**

- Session profiles are serialized, encrypted with a user-provided passphrase (AES-256-GCM), and written to a designated local folder (e.g. `~/Google Drive/Unaware Sessions/` or `~/OneDrive/Unaware Sessions/`).
- The cloud drive's own desktop client handles upload/download — the extension never touches the network.
- On another machine, the extension watches the same local folder and imports any new or updated profiles after decryption.
- Conflict resolution: last-write-wins with a merge prompt for divergent edits to the same profile.
- Supported targets: Google Drive, OneDrive, Dropbox, Syncthing, or any folder-based sync tool.

**What gets synced:**

- Session profile metadata (name, color, settings)
- Session templates

**What never gets synced:**

- Cookies and active session state
- Browsing history
- localStorage / sessionStorage / IndexedDB contents

This keeps sync lightweight and ensures that credentials never leave the originating device, even in encrypted form.

### Per-Session Proxy Routing

HTTP/SOCKS5 proxy configuration per session for IP-level isolation.

- Proxy settings stored per session profile
- Implemented via `chrome.proxy` API (Chromium) or proxy PAC scripts (Firefox)
- Each session's network traffic routed through its configured proxy
- Provides IP-level isolation complementary to cookie/storage isolation
- Requires careful handling of DNS leaks, WebRTC leak prevention, proxy authentication

### Session Templates

Pre-configured groups of tabs + session pairings for common workflows. One-click launch of entire work contexts (e.g., open 4 client dashboards each in their own session).

### Request Header Injection

Per-session custom request headers — useful for staging auth tokens, API keys, or custom debug headers. Implemented via `declarativeNetRequest` rules scoped to session.

### Passphrase Lock

Optional passphrase to encrypt and lock the session vault. Requires unlock on browser start to access session data.

---

## License

BSD 3-Clause

---

> *Your sessions. Your machine. Your rules.*
