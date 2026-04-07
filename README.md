# Unaware Sessions Browser Extension

**Open-source, privacy-first multi-session browser manager — entirely local.**

---

## Table of Contents

- [Project Overview](#project-overview)
- [Motivation](#motivation)
- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Development](#development)
- [Testing](#testing)
- [Contributing](#contributing)
- [Support](#support)
- [Privacy Policy](#privacy-policy)
- [License](#license)

---

## Project Overview

Unaware Sessions lets you run multiple isolated browser sessions side-by-side within a single browser window. Each tab operates in its own sandboxed context with separate cookies, localStorage, sessionStorage, and IndexedDB — no cloud accounts, no telemetry, no subscriptions. Everything lives on your machine.

Think of it as SessionBox, but open-source and offline-only by design.

---

## Motivation

Managing multiple accounts on the same service (Gmail, Twitter, dev/staging/prod environments, client dashboards) is a daily reality for developers, QA engineers, social media managers, and freelancers. The existing solutions come with trade-offs:

- **SessionBox** is proprietary, requires an account, syncs data to external servers, and locks advanced features behind a paywall.
- **Browser profiles** (Chrome, Firefox) are heavyweight — each profile is a separate OS-level process with its own window, history, and extensions.
- **Incognito / Private windows** don't persist sessions and can't run in parallel with identity separation.
- **Multi-Account Containers** (Firefox) are the closest native solution but are Firefox-only and lack cross-browser portability.

Unaware Sessions fills the gap: lightweight session isolation that works inside your existing browser, stores nothing remotely, and is fully auditable.

---

## Features

### Core

- Create named, color-coded session profiles (e.g., `work-gmail`, `client-A`, `staging`)
- Each profile gets its own isolated cookie jar, localStorage, and sessionStorage
- Open any link in any session context via right-click context menu
- Tab badge indicators showing which session a tab belongs to
- Switch a tab's session identity with automatic page reload

### Management

- Import / export session profiles as JSON (optionally encrypted)
- Session list with active tab counts and color indicators
- Rename, delete, and duplicate session profiles

### Privacy

- Zero network calls — the extension makes no outbound requests, ever
- No analytics, no crash reporting, no update pings beyond the browser's own extension update mechanism
- All data stored locally; nothing leaves the device

### Design Constraints

- **One session per origin at a time** — DOM storage is shared per-origin, so concurrent sessions on the same domain aren't possible at the extension level
- **Page reload on session switch** — required to cleanly swap DOM storage without race conditions
- **Manifest V3 only** — mandatory for Chrome Web Store distribution

---

## Architecture Overview

```text
+-----------------------------------------------------------+
|                      Extension                             |
|                                                            |
|  +------------------+   +--------------------+             |
|  | Popup UI (Svelte)|   | Options (Svelte)   |             |
|  +--------+---------+   +--------+-----------+             |
|           |                      |                         |
|           v                      v                         |
|  +--------------------------------------------+            |
|  |         Service Worker (Background)         |            |
|  |  - Session Manager                          |            |
|  |  - Cookie Engine (swap/save/restore)        |            |
|  |  - Tab Tracker                              |            |
|  |  - DNR Manager (declarativeNetRequest)      |            |
|  |  - Message Router                           |            |
|  +-----+------------------+-------------------+            |
|        |                  |                                |
|        v                  v                                |
|  +-----------+    +----------------+                       |
|  | Content   |    | Internal Store |                       |
|  | Scripts   |    | (IndexedDB +   |                       |
|  | (per-tab) |    |  chrome.storage)|                      |
|  +-----------+    +----------------+                       |
+-----------------------------------------------------------+
         |                  |
         v                  v
  +-------------+   +----------------+
  | Browser APIs|   | chrome.cookies |
  | (tabs, DNR) |   | (per-domain)   |
  +-------------+   +----------------+
```

### Session Switch Flow (Chromium)

1. User selects "Switch to Session B" in popup
2. Service Worker saves current session's cookies and triggers content script to save DOM storage
3. Service Worker clears origin cookies and restores Session B's cookies
4. Tab reloads — content script at `document_start` restores Session B's DOM storage
5. Badge updates to reflect new session

### Platform Strategy

| Platform | Isolation Method |
| -------- | ---------------- |
| Chromium (Chrome, Edge, Brave) | Snapshot & Swap — cookie API + content script storage swap + DNR rules |
| Firefox | `contextualIdentities` API for native container isolation |

### Data Model

| Entity | Storage Location | Purpose |
| ------ | ---------------- | ------- |
| Session profiles | `chrome.storage.local` | Name, color, settings (survives browser restart) |
| Tab-session mapping | `chrome.storage.session` | Which tab belongs to which session (survives SW restart) |
| Storage snapshots | Extension IndexedDB | localStorage, sessionStorage, IndexedDB snapshots per session per origin |
| Cookie snapshots | Extension IndexedDB | Saved cookie jars per session per origin |

---

## Tech Stack

| Layer | Technology | Role |
| ----- | ---------- | ---- |
| Extension Runtime | WebExtensions API (MV3) | Cross-browser extension framework |
| UI Framework | Svelte | Popup, options page |
| Build System | Vite + web-ext | Dev server, HMR, packaging |
| Language | TypeScript | End-to-end type safety |
| Internal Storage | chrome.storage.local + IndexedDB | Session profiles + storage snapshots |
| Styling | CSS Modules | Scoped, minimal styles |
| Testing | Vitest + Playwright | Unit + E2E |
| Linting | ESLint + Prettier | Code quality |

---

## Installation

### Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** 9+ (ships with Node.js)
- **Google Chrome** (or any Chromium-based browser) / **Firefox**

### Build from Source

```bash
# Clone the repository
git clone https://github.com/msaidbilgehan/unaware-sessions-browser-extension.git
cd unaware-sessions-browser-extension

# Install dependencies
npm install

# Build the extension
npm run build
```

### Load into Chrome

1. Open `chrome://extensions/` in Chrome.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the `dist/` folder from the project root.
5. The Unaware Sessions icon appears in your toolbar — click it to open the popup.

### Load into Firefox

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on**.
3. Select `dist/firefox/manifest.json`.

### Development Mode (HMR)

```bash
npm run dev
```

This starts a Vite dev server with hot module replacement. Load the extension from the `dist/` folder as above — changes in source files reflect immediately without manual reload.

### Open the Popup

Press `Alt+Shift+B` (the default keyboard shortcut) to open the Unaware Sessions popup from any tab.

---

## Usage

1. Click the Unaware Sessions icon in the toolbar.
2. Hit **+ New Session** — give it a name and pick a color.
3. Right-click any link and select **Open in Session** to choose your session.
4. The tab opens with a colored badge. Cookies and storage are fully isolated.
5. Create more sessions as needed. Switch any tab between sessions from the popup (triggers page reload).

---

## Project Structure

```text
src/
  background/
    service-worker.ts        # SW entry point
    session-manager.ts       # Session CRUD + persistence
    cookie-engine.ts         # Cookie swap logic
    dnr-manager.ts           # declarativeNetRequest rules
    tab-tracker.ts           # Tab-session mapping
    messaging.ts             # Message router
  content/
    index.ts                 # Content script entry
    storage-swap.ts          # localStorage/sessionStorage save/restore
    idb-swap.ts              # IndexedDB save/restore (best-effort)
  popup/
    index.html
    App.svelte
    components/
  options/
    index.html
    App.svelte
  shared/
    types.ts                 # Shared TypeScript interfaces
    constants.ts             # Extension-wide constants
    storage.ts               # chrome.storage helpers
    utils.ts                 # Shared utilities
  assets/
    icons/
Docs/
  1-Idea.md                  # Project concept and motivation
  2-Product-Specifications.md # Architecture, data model, isolation matrix
  3-implementation-Plan.md   # Phased delivery plan
tests/
  storage/                   # Chrome storage CRUD and schema migration tests
  messaging/                 # Message type guard and dispatch tests
  background/                # Handler-level integration tests
```

---

## Development

### Commands

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run type-check` | TypeScript strict mode validation |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run format` | Prettier auto-format |
| `npm run format:check` | Prettier dry-run check |

### Chrome Permissions

| Permission | Purpose |
| ---------- | ------- |
| `storage` | Persist session profiles and tab mappings |
| `cookies` | Read/write/delete cookies per domain for session swap |
| `tabs` | Track tab lifecycle, reload tabs, update badges |
| `activeTab` | Access current tab for session operations |
| `scripting` | Inject content scripts dynamically |
| `declarativeNetRequest` | Modify cookie headers on outbound requests |
| `declarativeNetRequestFeedback` | Debug DNR rule matches (dev only) |
| `contextMenus` | "Open in Session" right-click menu |
| `alarms` | Periodic state persistence and cleanup |

---

## Testing

```bash
# Run tests once
npm run test

# Watch mode
npm run test:watch

# With coverage report
npm run test:coverage
```

Tests use **Vitest** with a jsdom environment and Chrome API mocks. Coverage is tracked via v8.

---

## Contributing

### Getting Started

1. Fork the repository and clone your fork.
2. Install dependencies: `npm install`
3. Create a feature branch: `git checkout -b feature/your-feature`
4. Start the dev server: `npm run dev`
5. Load the extension from `dist/` in Chrome.

### Code Quality Gates

Before submitting a pull request, ensure all checks pass:

```bash
npm run type-check   # No TypeScript errors
npm run lint         # No linting violations
npm run format:check # Consistent formatting
npm run test         # All tests pass
```

### Conventions

- **TypeScript strict mode** — no `any`, no implicit types.
- **Entity-per-handler pattern** — each entity domain has its own handler in `background/handlers/` and service in `background/services/`.
- **Discriminated union messaging** — all messages between contexts use typed discriminated unions (see `shared/types/messages.ts`).
- **No external network calls** — the extension runs entirely locally. No analytics, no telemetry, no external APIs.

### Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR.
- Include tests for new functionality.
- Update relevant types in `shared/types/` when changing entity schemas.
- Test in Chrome with the extension loaded before submitting.

---

## Support

If you find Unaware Sessions useful, consider supporting its development:

[![Open Collective](https://img.shields.io/badge/Open%20Collective-Donate-blue?logo=opencollective)](https://opencollective.com/unaware-sessions-browser-extension)

### Donate

<a href="https://opencollective.com/unaware-sessions-browser-extension/donate" target="_blank">
  <img src="https://opencollective.com/unaware-sessions-browser-extension/donate/button@2x.png?color=blue" width="300" alt="Donate to Unaware Sessions on Open Collective" />
</a>

### Sponsors

Support this project by becoming a sponsor. Your logo will show up here with a link to your website.

<a href="https://opencollective.com/unaware-sessions-browser-extension#sponsor"><img src="https://opencollective.com/unaware-sessions-browser-extension/sponsors.svg?width=890" alt="Sponsors on Open Collective" /></a>

### Backers

Thank you to all our backers!

<a href="https://opencollective.com/unaware-sessions-browser-extension#backer"><img src="https://opencollective.com/unaware-sessions-browser-extension/backers.svg?width=890" alt="Backers on Open Collective" /></a>

### Contributors

<a href="https://opencollective.com/unaware-sessions-browser-extension#contributors"><img src="https://opencollective.com/unaware-sessions-browser-extension/contributors.svg?width=890" alt="Contributors on Open Collective" /></a>

---

## Privacy Policy

Read the full [Privacy Policy](PRIVACY_POLICY.md).

---

## License

This project is licensed under the BSD 3-Clause License. See the [LICENSE](LICENSE) file for details.

Copyright (c) 2026, Muhammed Said Bilgehan. All rights reserved.
