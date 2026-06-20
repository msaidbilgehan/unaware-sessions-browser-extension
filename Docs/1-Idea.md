# Unaware Sessions Browser Extension

**Open-source, privacy-first multi-session browser manager — local by default, with opt-in encrypted cloud sync.**

---

## Project Aim

Unaware Sessions Browser Extension lets you run multiple isolated browser sessions side-by-side within a single browser window. Each tab operates in its own sandboxed context with separate cookies, localStorage, sessionStorage, and IndexedDB — no third-party accounts, no telemetry, no subscriptions. Everything lives on your machine by default; an optional Google Drive sync can keep sessions in sync across devices — all data (profiles, cookie snapshots, storage snapshots) is encrypted end-to-end (AES-256-GCM) before it leaves the device.

Think of it as SessionBox, but open-source and privacy-first by design.

---

## Motivation

Managing multiple accounts on the same service (Gmail, Twitter, dev/staging/prod environments, client dashboards) is a daily reality for developers, QA engineers, social media managers, and freelancers. The existing solutions come with trade-offs:

- **SessionBox** is proprietary, requires an account, syncs data to external servers, and locks advanced features behind a paywall.
- **Browser profiles** (Chrome, Firefox) are heavyweight — each profile is a separate OS-level process with its own window, history, and extensions. Switching between eight client accounts means eight windows.
- **Incognito / Private windows** don't persist sessions and can't run in parallel with identity separation.
- **Multi-Account Containers** (Firefox) are the closest native solution but are Firefox-only and lack cross-browser portability.

Unaware Sessions Browser Extension fills the gap: lightweight session isolation that works inside your existing browser, stores nothing remotely unless you opt in, and is fully auditable.

---

## Tech Stack

| Layer | Technology | Role |
|---|---|---|
| Extension Runtime | WebExtensions API (Manifest V3) | Cross-browser extension framework |
| Session Isolation | `chrome.cookies` API + content script storage swap + `declarativeNetRequest` | Sandboxed cookie jars and DOM storage per session |
| Storage | `chrome.storage.local` + `chrome.storage.session` + extension IndexedDB | Persist session profiles, tab mappings, cookie/storage snapshots |
| UI Framework | Svelte 5 (runes) | Popup & options interface |
| Styling | CSS custom properties | Design system tokens with light/dark themes, no CSS framework |
| Build System | Vite + @crxjs/vite-plugin | Dev server, HMR, extension bundling |
| Language | TypeScript (strict) | End-to-end type safety |
| Testing | Vitest + fake-indexeddb | Unit tests with Chrome API mocks |
| Tooling | ESLint + Prettier | Lint and format |
| Optional Sync | Google Drive REST v3 (`drive.appdata`) + Web Crypto (AES-256-GCM, PBKDF2) | Opt-in encrypted session sync |

---

## Features

### Core

- Create named, color-coded, emoji-tagged session profiles (e.g. `work-gmail`, `client-A`, `staging`)
- Each profile gets its own isolated cookie jar, localStorage, sessionStorage, and IndexedDB
- Open any link in any session context via right-click menu
- Tab badge indicators showing which session a tab belongs to
- Switch a tab's session identity with a fresh navigation to apply the new context cleanly
- Domain-grouped session list — "This site" shows relevant sessions, "Other sessions" collapsed
- "Default (no session)" option for clean browsing / fresh login
- Cookie isolation modes: **soft** (default, preserves unmanaged domains) or **strict** (full isolation); configurable per-domain

### Management

- Full backup / restore: export sessions, cookies, and storage as timestamped JSON
- Import / export session profiles as JSON with visual diff preview and drag-and-drop
- Rename (inline), delete (with undo), duplicate, and pin session profiles
- Drag-to-reorder sessions
- Per-session storage usage dashboard
- Search/filter by session name or associated domain
- Auto-refresh for tracked tabs at a configurable interval (globally or per-domain)

### UI & Accessibility

- Light / dark / system theme via CSS custom properties
- Keyboard shortcuts: `n` (new), `/` (search), `?` (quick-switch), `Escape` (close)
- Quick-switch overlay — press `?` then a number key to jump to a session
- Lucide SVG icon set and emoji avatars
- Full ARIA labels, focus rings, `prefers-reduced-motion`, and `prefers-contrast` support

### Debugging

- Cookie diff viewer (snapshot vs live browser cookies)
- Rolling restore failure log with per-cookie status (matched, value changed, flags changed, missing, extra, expired)
- Structured in-memory logger with configurable levels (off / error / warn / info / debug)

### Security

- Optional 4-digit passcode protecting session switching, deletion, export, and clear-all
- Optional biometric authentication (fingerprint / Face ID) via WebAuthn platform authenticator
- Passcode hashed with PBKDF2-SHA256 at 600,000 iterations — never stored in plain text
- Configurable grace period (1–30 min) in `chrome.storage.session` to skip re-auth after a successful check; auto-clears on browser close
- Biometric requires passcode as a prerequisite — always recoverable via PIN
- Rate limiting: 5 failed attempts triggers a 30-second cooldown

### Cloud Sync (opt-in)

- Encrypted Google Drive sync using AES-256-GCM with PBKDF2 key derivation (600K iterations)
- Encryption key derived from the Google User ID — the same account on any device can decrypt
- Uses the `drive.appdata` scope — a hidden app folder only; the extension cannot access user files
- Three merge strategies: Trust Cloud, Trust Local, or Ask (per-origin conflict picker)
- Auto-sync at configurable intervals (Off / 5m / 15m / 30m) via `chrome.alarms`
- All session data (profiles, cookie snapshots, storage snapshots) syncs encrypted; auth tokens and live browser state stay local

### Privacy

- No analytics, no crash reporting, no telemetry, no update pings beyond the browser's own extension update mechanism
- All data stored locally by default in `chrome.storage.local` + extension IndexedDB
- Google Drive sync is strictly opt-in, end-to-end encrypted, and uses an app-scoped hidden folder

---

## Basic Flow

```text
┌──────────────────────────────────────────────────────┐
│  User clicks "New Session"                           │
│  ┌─────────────────────────────┐                     │
│  │ Popup UI (Svelte 5)         │                     │
│  │  - Name: "client-A"         │                     │
│  │  - Color: #3B82F6           │                     │
│  │  - Emoji: 🧑‍💼                │                     │
│  └────────────┬────────────────┘                     │
│               │                                      │
│               ▼                                      │
│  ┌─────────────────────────────┐                     │
│  │ Background Service Worker   │                     │
│  │  1. Save session profile in │                     │
│  │     chrome.storage.local    │                     │
│  │  2. Track tab-session map   │                     │
│  │     in chrome.storage.session│                    │
│  │  3. Register tab/DNR hooks  │                     │
│  └────────────┬────────────────┘                     │
│               │                                      │
│               ▼                                      │
│  ┌─────────────────────────────┐                     │
│  │ Tab Opens in Sandboxed      │                     │
│  │ Context                     │                     │
│  │  - Isolated cookies         │                     │
│  │  - Isolated DOM storage     │                     │
│  │  - Badge: "client-A" 🔵    │                     │
│  └─────────────────────────────┘                     │
│                                                      │
│  Repeat: user opens more tabs in same or different   │
│  sessions. Each tab's context is tracked by the      │
│  service worker and routed to the correct jar.       │
└──────────────────────────────────────────────────────┘
```

### Lifecycle in Brief

1. User creates a session profile (name, color, emoji, optional settings).
2. Background worker persists the profile and the tab-session mapping.
3. Any tab opened under that session inherits the isolated context — cookies via the cookies API, DOM storage via the content script at `document_start`.
4. On session switch, the service worker saves the current session's cookies, clears origin cookies, restores the target session's cookies, and navigates the tab to apply the new context; the content script restores matching DOM storage and IndexedDB snapshots.
5. When the user closes a session, its tabs are released and its cookie/storage jars can be preserved or wiped — user's choice.

---

## Usage

### Install from the Chrome Web Store

Install **Unaware Sessions** directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/unaware-sessions/pfpfakjgmkfmcimgknmnebloclkbfhbh) and click **Add to Chrome**.

### Install from Source

```bash
# Clone the repository
git clone https://github.com/msaidbilgehan/unaware-sessions-browser-extension.git
cd unaware-sessions-browser-extension

# Install dependencies
npm install

# Development mode (Vite HMR)
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

1. Click the Unaware Sessions icon in the toolbar (or press `Alt+Shift+B`).
2. Hit **+ New Session** — give it a name, pick a color and emoji.
3. Right-click any link → **Open in Session** → choose your session.
4. The tab opens with a colored badge. Cookies and storage are fully isolated.
5. Create more sessions as needed. Switch any tab between sessions from the popup.

---

## Future Work

> All items below are **out of scope for v1**. See [2-Product-Specifications.md](2-Product-Specifications.md) for detailed specifications.

### Firefox `contextualIdentities` Integration

Use Firefox's native container isolation where available, falling back to Snapshot & Swap only for storage layers not covered by contextual identities. Provides kernel-level cookie jar isolation without content script overhead.

### Per-Session Proxy Routing

HTTP/SOCKS5 proxy configuration per session for IP-level isolation.

- Proxy settings stored per session profile
- Implemented via `chrome.proxy` API (Chromium) or proxy PAC scripts (Firefox)
- Each session's network traffic routed through its configured proxy
- Provides IP-level isolation complementary to cookie/storage isolation
- Requires careful handling of DNS leaks, WebRTC leak prevention, and proxy authentication

### Session Templates

Pre-configured groups of tabs + session pairings for common workflows. One-click launch of entire work contexts (e.g., open 4 client dashboards each in their own session).

### Request Header Injection

Per-session custom request headers — useful for staging auth tokens, API keys, or custom debug headers. Implemented via `declarativeNetRequest` rules scoped to session.

### Per-Session User-Agent Override

Configurable User-Agent string per session for device/browser spoofing during QA and cross-environment testing. The `SessionSettings.userAgent` field is reserved in the type model but not yet wired up end-to-end.

---

## License

BSD 3-Clause

---

> *Your sessions. Your machine. Your rules.*
