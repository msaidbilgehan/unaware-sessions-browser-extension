# CLAUDE.md — Unaware Sessions Browser Extension

## Project Overview

Privacy-first, open-source browser extension for isolated browsing sessions within a single browser window. Each session has its own cookies, localStorage, sessionStorage, and IndexedDB. Everything local by default, with opt-in encrypted Google Drive sync.

## Tech Stack

- **Runtime:** WebExtensions API (Manifest V3)
- **Language:** TypeScript (strict mode)
- **UI:** Svelte 5 (runes: `$state`, `$derived`, `$effect`)
- **Styling:** CSS custom properties design system (`src/shared/theme.css`) — light/dark themes, no CSS framework
- **Build:** Vite + @crxjs/vite-plugin
- **Testing:** Vitest + fake-indexeddb
- **Linting:** ESLint + Prettier

## Architecture

- **Service Worker** (`src/background/`) — session lifecycle, cookie swap, tab tracking, DNR rules, messaging, Drive sync
- **Content Scripts** (`src/content/`) — DOM storage save/restore (localStorage, sessionStorage, IndexedDB)
- **Popup UI** (`src/popup/`) — session list with domain grouping, "Default (no session)" for fresh login, 380px wide
- **Options Page** (`src/options/`) — tabbed settings, import/export, storage dashboard
- **Shared** (`src/shared/`) — types, constants, utilities, API layer, theme system, reusable Svelte components

### Key Design Constraints

- **Fresh navigation on session switch** — uses `chrome.tabs.update({url})` for clean cookie state
- **Origin-scoped cookie swap** — saves/clears/restores cookies strictly per-origin (including parent-domain cookies via domain hierarchy walk); no cross-domain cookies are saved or restored
- **Cookie isolation modes** — `soft` (default) skips cookie clear/restore on domains where the target session has no saved data, preserving unrelated services; the pass-through also *adopts* the live cookies + storage as the target session's snapshot so a fresh session has durable data immediately; `strict` always clears cookies for full isolation even without target data
- **Capture-on-create** — `CREATE_SESSION` accepts an optional `captureTabId`; the background assigns the tab and snapshots its live cookies + DOM storage into the new session atomically (popup passes the active tab), so new sessions never sit empty until the next switch-away
- **Event-driven auto-save** — session data is saved not only on switch-away but also when a tracked tab closes (cookies only — the jar outlives the tab), before cross-origin navigation unassigns, and ~1.5 s after a same-origin load completes (debounced per tab, captures post-login state); periodic alarm refresh defaults to ON (5 min) for fresh installs
- **Idempotent session mutations** — `shared/api.ts` retries connection errors that can fire *after* a handler ran ("message port closed"), so CREATE/DUPLICATE carry a client-generated ID (retry returns the existing session) and DELETE of a missing session succeeds; never add a non-idempotent mutating message without an idempotency key
- **Per-tab session switch mutex** — concurrent session switches on the same tab are serialized to prevent interleaved cookie operations
- **Tab unassignment on cross-origin navigation** — when a tab navigates to a different origin, its session is automatically unassigned after its outgoing cookies are snapshotted (session data belongs to the old origin; keeping it assigned on a new origin causes cross-domain confusion)
- **Sync deletion tombstones** — deleting a session records a tombstone (`sessionId → deletedAt`, 30-day retention); sync merge unions tombstones from both sides and drops sessions (and their snapshots) whose tombstone is newer than their `updatedAt`, so deletions propagate across devices instead of resurrecting; a profile edited after the deletion wins and clears the tombstone; `applyFullData` replaces (never re-records) tombstones
- **IDB binary encoding** — content script encodes `ArrayBuffer`, `TypedArray`, and `Date` values into JSON-safe marker objects before `sendMessage` (Chrome extension messaging uses JSON serialization, not structured clone) and decodes them on restore
- **Optional security layer** — 4-digit passcode (PBKDF2-SHA256, 600K iterations) and/or WebAuthn biometric (fingerprint/Face ID); client-side auth gate in popup/options before protected actions; configurable grace period (1–30 min) via `chrome.storage.session` auto-clears on browser close; biometric requires passcode as prerequisite for recoverability
- **Opt-in encrypted Google Drive sync** — AES-256-GCM encryption with key derived from Google User ID (PBKDF2, 600K iterations); `drive.appdata` scope (hidden app folder, no access to user files); two Drive files: unencrypted manifest (checksums only) + encrypted payload; three merge strategies: trust-cloud, trust-local, ask (per-origin conflict picker); auto-sync via `chrome.alarms` at configurable intervals (Off/5m/15m/30m); same Google account on any device = same encryption key = cross-device sync; unreadable remote (undecryptable *or* unparseable, manifest or payload) auto-recovers by overwriting remote with local data
- **Payload-first commit ordering** — every upload path writes the encrypted payload first and the manifest last (the manifest is the commit marker and embeds the payload's SHA-256); a crash mid-write can only leave an old manifest describing old data (healed next sync), never a new manifest pointing at a stale payload (which trust-cloud would apply as data loss); on download, a manifest/payload checksum mismatch means the payload is newer, so the manifest is rebuilt from the authenticated payload
- **Serialized sync cycles** — the entire cycle runs behind one in-flight promise shared by manual sync and conflict resolution (`drive-sync.ts`): concurrent `triggerSync` calls coalesce, `resolveConflicts` queues behind a running cycle, and the auto-sync alarm skips while a conflict dialog is open, so `applyFullData` (delete-all → batch-set → snapshot writes) never races itself; the remote snapshot from conflict detection is cached and reused for the resolution cycle, version-guarded so a newer remote re-downloads and re-prompts instead of applying resolutions to stale data
- **Optimistic concurrency across devices** — Drive API v3 has no ETag/`If-Match`, so uploads re-read each file's monotonic `version` immediately before writing and abort with `SyncConcurrencyError` (one-shot retry against fresh remote) on a mismatch; `findFile` also collapses duplicate same-named `appDataFolder` files (keeps oldest, deletes extras) to prevent split-brain sync when two devices first-sync concurrently
- **Three-way conflict detection** — a per-origin (`sessionId:origin`) checksum mismatch is only a real conflict when BOTH sides diverged from `lastSyncedChecksums` (the baseline recorded at every successful sync); one-sided drift — ordinary local browsing between two syncs, the common `ask`-mode case — fast-forwards via `autoResolveOneSidedChanges` instead of parking in `conflict`. A pure two-way (local≠remote) comparison would misflag every single-sided change and, under `ask`, silently halt auto-sync until a human resolved a non-conflict. No baseline for a key (pre-upgrade installs) safely falls back to prompting once; the first resolution records the baseline and it self-heals thereafter. `mergeData`'s `ask` branch must consume those auto-resolutions or its "both present, no resolution → keep local" default silently discards a remote-only update
- **Persisted conflict surfacing** — `SyncState.conflicts` is in-memory only (lost on SW restart), so a conflict raised by a background auto-sync would be invisible; `drive-sync.ts` mirrors the set into `SyncConfig.pendingConflicts`, which drives an amber `!` action badge (all tabs, `badge-manager.ts`), a popup banner, and an options status pill + banner with a Review button that resolves against the persisted set. A transient sync error must NOT clear `pendingConflicts`; `SYNC_DISCONNECT` does
- **Sync-store lazy hydration** — `sync-store.ts` uses the same ensure-hydrated shared-load-promise pattern as `session-manager.ts`; every getter/setter reachable from an alarm or message (`getSyncConfigHydrated`, `setSyncConfig`, `ensureSyncStoreHydrated`) awaits hydration first, so a cold service worker woken by the sync alarm or a `SYNC_*` message reads the persisted config rather than the disabled default (which would no-op auto-sync or wipe the connection on `SYNC_CONFIGURE`)
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
- **No external network calls** — zero analytics or telemetry; the only network calls are opt-in Google Drive sync (user-initiated, encrypted)
- **Content scripts run at `document_start`** — critical for storage isolation before page scripts execute
- **CSS custom properties** — all colors, spacing, radii, shadows use design tokens from `theme.css`
- **Shared API layer** — `src/shared/api.ts` is the single source for popup/options to communicate with the service worker; retries once (200 ms delay) on MV3 service worker wake-up connection errors before surfacing to callers; mutating operations are made retry-safe with client-generated IDs (see Idempotent session mutations)
- **Soft isolation by default** — cookie isolation defaults to `soft` mode (skip clear/restore on unmanaged domains); configurable per-domain or globally via settings
- **Per-tab concurrency mutex** — `switchSession` serializes concurrent switches on the same tab to prevent interleaved cookie operations
- **Restore failure ring buffer** — `cookie-engine.ts` records the last 200 cookie restoration failures for debug inspection via the Debug tab
- **Session search matches domains** — search/filter in both popup and options SessionsTab matches session names AND associated origin domains (e.g., searching "claude" finds sessions with claude.ai data)
- **Svelte 5 `$effect` only tracks `$state`/`$derived` reads** — plain module-level variables (e.g., `currentSettings.autoRefreshDefaultEnabled`, `domainRefreshMap`) are not reactive; when they change via a storage listener, manually re-evaluate any derived state inside the same listener callback rather than relying on `$effect` to re-run automatically

## File Naming

- TypeScript files: `kebab-case.ts`
- Svelte components: `PascalCase.svelte`
- Test files: `*.test.ts` in `tests/` directory mirroring `src/` structure

## Key Modules

### Background (`src/background/`)

- `session-manager.ts` — session CRUD (idempotent create/delete via client IDs), ordering, duplicate, batch upsert for sync, deletion tombstones (record/prune/get/set)
- `cookie-engine.ts` — cookie swap orchestration (save, clear, restore, switch) with origin-scoped domain-hierarchy cookie resolution, DOM storage save/restore, pending restores, per-tab switch mutex, soft/strict isolation mode with pass-through adoption, `captureTabIntoSession` for capture-on-create, and restore failure tracking (ring buffer)
- `cookie-store.ts` — IndexedDB wrapper for cookie snapshots + stats
- `storage-store.ts` — IndexedDB wrapper for storage snapshots + stats
- `tab-tracker.ts` — tab-to-session mapping with persistence (incl. cookie `storeId`); event-driven auto-save: snapshots cookies on tab close and before cross-origin unassign, debounced cookie+storage save after same-origin load completes
- `dnr-manager.ts` — declarativeNetRequest session rules with origin-scoped cookie header filtering
- `messaging.ts` — message router (all MessageType handlers)
- `badge-manager.ts` — tab badge with session color + abbreviation; an amber `!` warning overrides all tab badges while `SyncConfig.pendingConflicts` is non-empty (hydrated on init, swept on `onSyncConfigChange`)
- `context-menu.ts` — "Open in Session" right-click menu
- `auto-refresh.ts` — alarm-driven periodic session data refresh for all tracked tabs
- `drive-sync.ts` — Google Drive sync orchestration: alarm-based auto-sync, sync triggers, conflict resolution; single in-flight-promise mutex serializes all cycles (coalesces triggers, queues resolutions, alarm skips during open conflict), version-guarded remote-data cache for the resolution cycle, one-shot retry on `SyncConcurrencyError`

### Shared (`src/shared/`)

- `types.ts` — all TypeScript interfaces, MessageType enum, Message union, `IsolationMode` type (`soft` | `strict`), `SecurityConfig`, `GracePeriodMs`, full export/import types, debug types (cookie diff, restore failures)
- `api.ts` — typed message wrappers for popup/options (createSession, switchSession, getSessionStats, exportFull, importFull, sync APIs, debug APIs, etc.)
- `sync/sync-types.ts` — sync type definitions (SyncConfig, SyncState, ConflictEntry, SyncManifest, EncryptedPayload)
- `sync/crypto-engine.ts` — AES-256-GCM encrypt/decrypt, PBKDF2 key derivation, SHA-256 checksums
- `sync/drive-client.ts` — Google Drive REST API v3 wrapper (appDataFolder); token management, 401 retry, file CRUD, Google User ID fetch; `findFile` returns a `DriveFileRef` (id + `version`) and deduplicates same-named files (keep oldest, delete extras); `getFileVersion`/`deleteFile` support optimistic concurrency
- `sync/sync-store.ts` — SyncConfig persistence + listeners (follows settings-store pattern); lazy ensure-hydrated pattern (`ensureSyncStoreHydrated`, `getSyncConfigHydrated`) so alarm/message entry points on a cold SW read the persisted config
- `sync/sync-engine.ts` — core sync orchestrator: manifest building (with `payloadChecksum` commit marker), three-way conflict detection against `lastSyncedChecksums` (baseline recorded at every success path) + `autoResolveOneSidedChanges` fast-forward, data merging (tombstone-aware, newer-`updatedAt` profile wins), payload-first encrypted upload/download, `SyncConcurrencyError` + `RemoteDataCache` for cross-device safety
- `theme.css` — CSS custom properties design system (light/dark tokens, spacing, radii, shadows)
- `theme-store.ts` — theme preference manager (light/dark/system with chrome.storage persistence)
- `settings-store.ts` — extension settings manager (auto-refresh interval, domain preferences, per-domain isolation mode overrides, log level, listener pattern)
- `security-store.ts` — security config manager (passcode PBKDF2 setup/verify, WebAuthn biometric enrollment/verify, grace period, listener pattern); persists to `chrome.storage.local`, grace period to `chrome.storage.session`
- `crypto-utils.ts` — PBKDF2 hashing (600K iterations, SHA-256), salt generation, constant-time verification; pure functions, no side effects
- `auth-check.ts` — `checkAuth()` utility returning `'not-needed'` | `'grace-active'` | `'auth-required'`; used by popup/options before protected actions
- `constants.ts` — extension-wide constants (storage keys including security config and grace period, colors, emojis, GitHub/OpenCollective URLs, grace period options)
- `logger.ts` — structured logger with configurable log levels (off/error/warn/info/debug), in-memory ring buffer, stored in chrome.storage.local
- `components/` — shared Svelte components (Icon, ThemeToggle, ConfirmDialog, AuthGate, Toast, InlineEdit, ColorPicker, EmojiPicker, AppLogo)

### Popup (`src/popup/`)

- `App.svelte` — main popup (380px): header with logo + theme toggle, origin panel with auto-refresh toggle, grouped session list, keyboard shortcuts, `withAuth` gate on session switch/delete; natural document scroll (no inner scroll container — Chrome popup viewport is the single scroll owner)
- `components/` — SessionList (domain-grouped with "Default" option, search by session name or domain), SessionItem, CurrentTabPanel (origin + refresh + auto-refresh toggle with green status indicator), NewSessionForm, SearchBar, ContextMenu, SessionDetail, KeyboardOverlay, OnboardingEmpty

### Options (`src/options/`)

- `App.svelte` — tabbed layout (Sessions, Settings, Data, About, Debug)
- `components/` — TabBar (with keyboard nav + ARIA tabs), SessionsTab (domain folders, inline cookie/storage editing, per-domain auto-refresh, search by session name or domain), SettingsTab (theme + cookie isolation mode + auto-refresh + security settings + Cloud Sync card with connect/disconnect, merge strategy, auto-sync interval), ImportExportTab (Full Export is the only export mode — cookies + storage data, with a per-session picker via `ExportSelector` — plus full import with stats preview + data management/clear all + `withAuth` gate on export/import/clear), DebugTab (cookie diff viewer + restore failure log + extension logs with log level selector), AboutTab (GitHub, OpenCollective), StorageDashboard, DragDropZone, ImportDiff, ExportSelector, SyncConflictDialog

## Key Documentation

- `Docs/1-Idea.md` — project concept and motivation
- `Docs/2-Product-Specifications.md` — architecture, data model, isolation matrix, future work
- `Docs/3-implementation-Plan.md` — phased delivery plan with exit criteria
- `PRIVACY_POLICY.md` — privacy commitments
- `CHANGELOG.md` — version history

## Permissions Required

`storage`, `cookies`, `tabs`, `declarativeNetRequest`, `contextMenus`, `alarms`, `favicon`, `identity` + `<all_urls>` host permission. OAuth2 scope: `drive.appdata`.

## Quality Gate

Before marking any task complete, run in this order:

```bash
npm run type-check   # TypeScript — zero errors required
npm run lint         # ESLint — zero violations required
npm run test         # Vitest — all 509+ tests must pass
```

Test files live in `tests/` mirroring `src/` structure (`*.test.ts`). Add tests for new background/shared logic; Svelte component tests are not required but encouraged for non-trivial state.

## License

BSD 3-Clause
