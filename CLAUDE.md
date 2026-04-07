# CLAUDE.md — Unaware Sessions Browser Extension

## Project Overview

Privacy-first, open-source browser extension for isolated browsing sessions within a single browser window. Each session has its own cookies, localStorage, sessionStorage, and IndexedDB. Zero network calls. Everything local.

## Tech Stack

- **Runtime:** WebExtensions API (Manifest V3)
- **Language:** TypeScript (strict mode)
- **UI:** Svelte
- **Build:** Vite + web-ext
- **Testing:** Vitest + Playwright
- **Linting:** ESLint + Prettier

## Architecture

- **Service Worker** (`src/background/`) — session lifecycle, cookie swap, tab tracking, DNR rules, messaging
- **Content Scripts** (`src/content/`) — DOM storage save/restore (localStorage, sessionStorage, IndexedDB)
- **Popup UI** (`src/popup/`) — Svelte-based session management interface
- **Options Page** (`src/options/`) — settings, import/export, data management
- **Shared** (`src/shared/`) — types, constants, utilities

### Key Design Constraints

- **Page reload required on session switch** — DOM storage cannot be swapped under a running page
- **One active session per origin at a time** — DOM storage is shared per-origin across all tabs
- **MV3 only** — no MV2 support, no persistent background page
- **Service Worker state must survive restarts** — persist to `chrome.storage.session` / `chrome.storage.local` / extension IndexedDB

### Platform Strategy

- **Chromium:** Snapshot & Swap (cookie API + content script storage swap + DNR rules)
- **Firefox:** `contextualIdentities` API for native isolation where available

## Commands

```bash
npm run dev          # Dev server with HMR
npm run build        # Production build -> dist/
npm run test         # Run tests
npm run test:watch   # Watch mode
npm run type-check   # TypeScript validation
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
npm run format       # Prettier format
npm run format:check # Prettier dry-run
```

## Conventions

- **No `any`** — TypeScript strict mode, no implicit types
- **Discriminated union messaging** — all messages between contexts use typed unions (`shared/types/messages.ts`)
- **Entity-per-handler pattern** — each domain has its own handler in `background/handlers/` and service in `background/services/`
- **No external network calls** — zero analytics, telemetry, or external APIs
- **Content scripts run at `document_start`** — critical for storage isolation before page scripts execute

## File Naming

- TypeScript files: `kebab-case.ts`
- Svelte components: `PascalCase.svelte`
- Test files: `*.test.ts` in `tests/` directory mirroring `src/` structure

## Key Documentation

- `Docs/1-Idea.md` — project concept and motivation
- `Docs/2-Product-Specifications.md` — architecture, data model, isolation matrix, future work
- `Docs/3-implementation-Plan.md` — phased delivery plan with exit criteria
- `PRIVACY_POLICY.md` — privacy commitments
- `CHANGELOG.md` — version history

## Permissions Required

`storage`, `cookies`, `tabs`, `activeTab`, `scripting`, `declarativeNetRequest`, `declarativeNetRequestFeedback`, `contextMenus`, `alarms` + `<all_urls>` host permission.

## License

BSD 3-Clause
