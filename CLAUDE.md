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
- **Popup UI** (`src/popup/`) — session list with domain grouping, "Default (no session)" for fresh login, 380px wide
- **Options Page** (`src/options/`) — tabbed settings, import/export, storage dashboard
- **Shared** (`src/shared/`) — types, constants, utilities, API layer, theme system, reusable Svelte components

### Key Design Constraints

- **Fresh navigation on session switch** — uses `chrome.tabs.update({url})` for clean cookie state
- **Origin-scoped cookie swap** — saves/clears/restores cookies strictly per-origin (including parent-domain cookies via domain hierarchy walk); no cross-domain cookies are saved or restored
- **Cookie isolation modes** — `soft` (default) skips cookie clear/restore on domains where the target session has no saved data, preserving unrelated services; `strict` always clears cookies for full isolation even without target data
- **Per-tab session switch mutex** — concurrent session switches on the same tab are serialized to prevent interleaved cookie operations
- **Tab unassignment on cross-origin navigation** — when a tab navigates to a different origin, its session is automatically unassigned (session data belongs to the old origin; keeping it assigned on a new origin causes cross-domain confusion)
- **IDB binary encoding** — content script encodes `ArrayBuffer`, `TypedArray`, and `Date` values into JSON-safe marker objects before `sendMessage` (Chrome extension messaging uses JSON serialization, not structured clone) and decodes them on restore
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
npm run release      # Patch version bump + push tags
npm run release:minor # Minor version bump + push tags
npm run release:major # Major version bump + push tags
```

## Conventions

- **No `any`** — TypeScript strict mode, no implicit types
- **Discriminated union messaging** — all messages between contexts use typed unions (`shared/types.ts`)
- **Entity-per-handler pattern** — each domain has its own handler in `background/`
- **No external network calls** — zero analytics, telemetry, or external APIs
- **Content scripts run at `document_start`** — critical for storage isolation before page scripts execute
- **CSS custom properties** — all colors, spacing, radii, shadows use design tokens from `theme.css`
- **Shared API layer** — `src/shared/api.ts` is the single source for popup/options to communicate with the service worker; retries once (200 ms delay) on MV3 service worker wake-up connection errors before surfacing to callers
- **"Other sessions" auto-expand** — `SessionList.svelte` expands the collapsed "Other sessions" group automatically when no site-specific sessions exist, so all sessions remain reachable from any origin
- **Soft isolation by default** — cookie isolation defaults to `soft` mode (skip clear/restore on unmanaged domains); configurable per-domain or globally via settings
- **Per-tab concurrency mutex** — `switchSession` serializes concurrent switches on the same tab to prevent interleaved cookie operations
- **Restore failure ring buffer** — `cookie-engine.ts` records the last 200 cookie restoration failures for debug inspection via the Debug tab
- **Session search matches domains** — search/filter in both popup and options SessionsTab matches session names AND associated origin domains (e.g., searching "claude" finds sessions with claude.ai data)
- **Popup uses natural document scroll** — no inner scroll containers; Chrome's popup viewport is the single scroll owner, styled thin by the global `* { scrollbar-width: thin }` rule
- **Auto-refresh uses green status indicator** — active auto-refresh toggles use `--color-success` (green) with a pulsing dot, visually distinct from blue accent action buttons

## File Naming

- TypeScript files: `kebab-case.ts`
- Svelte components: `PascalCase.svelte`
- Test files: `*.test.ts` in `tests/` directory mirroring `src/` structure

## Key Modules

### Background (`src/background/`)

- `session-manager.ts` — session CRUD, ordering, duplicate
- `cookie-engine.ts` — cookie swap orchestration (save, clear, restore, switch) with origin-scoped domain-hierarchy cookie resolution, DOM storage save/restore, pending restores, per-tab switch mutex, soft/strict isolation mode, and restore failure tracking (ring buffer)
- `cookie-store.ts` — IndexedDB wrapper for cookie snapshots + stats
- `storage-store.ts` — IndexedDB wrapper for storage snapshots + stats
- `tab-tracker.ts` — tab-to-session mapping with persistence; unassigns sessions on cross-origin tab navigation
- `dnr-manager.ts` — declarativeNetRequest session rules with origin-scoped cookie header filtering
- `messaging.ts` — message router (all MessageType handlers)
- `badge-manager.ts` — tab badge with session color + abbreviation
- `context-menu.ts` — "Open in Session" right-click menu
- `auto-refresh.ts` — alarm-driven periodic session data refresh for all tracked tabs

### Shared (`src/shared/`)

- `types.ts` — all TypeScript interfaces, MessageType enum, Message union, `IsolationMode` type (`soft` | `strict`), full export/import types, debug types (cookie diff, restore failures)
- `api.ts` — typed message wrappers for popup/options (createSession, switchSession, getSessionStats, exportFull, importFull, debug APIs, etc.)
- `theme.css` — CSS custom properties design system (light/dark tokens, spacing, radii, shadows)
- `theme-store.ts` — theme preference manager (light/dark/system with chrome.storage persistence)
- `settings-store.ts` — extension settings manager (auto-refresh interval, domain preferences, per-domain isolation mode overrides, log level, listener pattern)
- `constants.ts` — extension-wide constants (storage keys including domain isolation modes, colors, emojis, GitHub/OpenCollective URLs)
- `logger.ts` — structured logger with configurable log levels (off/error/warn/info/debug), in-memory ring buffer, stored in chrome.storage.local
- `components/` — shared Svelte components (Icon, ThemeToggle, ConfirmDialog, Toast, InlineEdit, ColorPicker, EmojiPicker, AppLogo)

### Popup (`src/popup/`)

- `App.svelte` — main popup (380px): header with logo + theme toggle, origin panel with auto-refresh toggle, grouped session list, keyboard shortcuts; natural document scroll (no inner scroll container — Chrome popup viewport is the single scroll owner)
- `components/` — SessionList (domain-grouped with "Default" option, search by session name or domain), SessionItem, CurrentTabPanel (origin + refresh + auto-refresh toggle with green status indicator), NewSessionForm, SearchBar, ContextMenu, SessionDetail, KeyboardOverlay, OnboardingEmpty

### Options (`src/options/`)

- `App.svelte` — tabbed layout (Sessions, Settings, Data, About, Debug)
- `components/` — TabBar (with keyboard nav + ARIA tabs), SessionsTab (domain folders, inline cookie/storage editing, per-domain auto-refresh, search by session name or domain), SettingsTab (theme + cookie isolation mode + auto-refresh settings), ImportExportTab (profile-only + full export/import with stats preview + data management/clear all), DebugTab (cookie diff viewer + restore failure log + extension logs with log level selector), AboutTab (GitHub, OpenCollective), StorageDashboard, DragDropZone, ImportDiff

## Key Documentation

- `Docs/1-Idea.md` — project concept and motivation
- `Docs/2-Product-Specifications.md` — architecture, data model, isolation matrix, future work
- `Docs/3-implementation-Plan.md` — phased delivery plan with exit criteria
- `PRIVACY_POLICY.md` — privacy commitments
- `CHANGELOG.md` — version history

## Permissions Required

`storage`, `cookies`, `tabs`, `declarativeNetRequest`, `contextMenus`, `alarms`, `favicon` + `<all_urls>` host permission.

## License

BSD 3-Clause
