# CLAUDE.md — Unaware Sessions Browser Extension

## Project Overview

Privacy-first, open-source browser extension for isolated browsing sessions within a single browser window. Each session has its own cookies, localStorage, sessionStorage, and IndexedDB. Zero network calls. Everything local.

## Tech Stack

- **Runtime:** WebExtensions API (Manifest V3)
- **Language:** TypeScript (strict mode)
- **UI:** Svelte 5 (runes: `$state`, `$derived`, `$effect`)
- **Styling:** CSS custom properties design system (`src/shared/theme.css`) — light/dark themes, no CSS framework
- **Build:** Vite + @crxjs/vite-plugin
- **Testing:** Vitest + fake-indexeddb
- **Linting:** ESLint + Prettier

## Architecture

- **Service Worker** (`src/background/`) — session lifecycle, cookie swap, tab tracking, DNR rules, messaging
- **Content Scripts** (`src/content/`) — DOM storage save/restore (localStorage, sessionStorage, IndexedDB)
- **Popup UI** (`src/popup/`) — Svelte-based session management interface (380px wide)
- **Options Page** (`src/options/`) — tabbed settings, import/export, storage dashboard
- **Shared** (`src/shared/`) — types, constants, utilities, API layer, theme system, reusable Svelte components

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
npm run test         # Run tests (vitest)
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report (v8)
npm run type-check   # TypeScript validation
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
npm run format       # Prettier format
npm run format:check # Prettier dry-run
```

## Conventions

- **No `any`** — TypeScript strict mode, no implicit types
- **Discriminated union messaging** — all messages between contexts use typed unions (`shared/types.ts`)
- **Entity-per-handler pattern** — each domain has its own handler in `background/`
- **No external network calls** — zero analytics, telemetry, or external APIs
- **Content scripts run at `document_start`** — critical for storage isolation before page scripts execute
- **CSS custom properties** — all colors, spacing, radii, shadows use design tokens from `theme.css`
- **Shared API layer** — `src/shared/api.ts` is the single source for popup/options to communicate with the service worker

## File Naming

- TypeScript files: `kebab-case.ts`
- Svelte components: `PascalCase.svelte`
- Test files: `*.test.ts` in `tests/` directory mirroring `src/` structure

## Key Modules

### Background (`src/background/`)

- `session-manager.ts` — session CRUD, ordering, duplicate
- `cookie-engine.ts` — cookie swap orchestration (save, clear, restore, switch)
- `cookie-store.ts` — IndexedDB wrapper for cookie snapshots + stats
- `storage-store.ts` — IndexedDB wrapper for storage snapshots + stats
- `tab-tracker.ts` — tab-to-session mapping with persistence
- `dnr-manager.ts` — declarativeNetRequest session rules
- `messaging.ts` — message router (all MessageType handlers)
- `badge-manager.ts` — tab badge with session color + abbreviation
- `context-menu.ts` — "Open in Session" right-click menu

### Shared (`src/shared/`)

- `types.ts` — all TypeScript interfaces, MessageType enum, Message union
- `api.ts` — typed message wrappers for popup/options (createSession, switchSession, getSessionStats, etc.)
- `theme.css` — CSS custom properties design system (light/dark tokens, spacing, radii, shadows)
- `theme-store.ts` — theme preference manager (light/dark/system with chrome.storage persistence)
- `constants.ts` — extension-wide constants (storage keys, colors, emojis)
- `components/` — shared Svelte components (Icon, ThemeToggle, ConfirmDialog, Toast, InlineEdit, ColorPicker, EmojiPicker, AppLogo)

### Popup (`src/popup/`)

- `App.svelte` — main popup (380px): header with logo + theme toggle, search, session list, keyboard shortcuts
- `components/` — SessionList, SessionItem, CurrentTabPanel, NewSessionForm, SearchBar, ContextMenu, SessionDetail, KeyboardOverlay, OnboardingEmpty

### Options (`src/options/`)

- `App.svelte` — tabbed layout (Sessions, Settings, Import/Export, About)
- `components/` — TabBar, SessionsTab, SettingsTab, ImportExportTab, AboutTab, StorageDashboard, DragDropZone, ImportDiff

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
