# Changelog

All notable changes to Unaware Sessions Browser Extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added

- **Auto-refresh toggle in popup:** Button next to refresh to enable/disable periodic session data refresh
- **Auto-refresh settings:** Configurable interval (5s/10s/30s/60s) and per-domain toggle in options page
- **Settings store:** New `settings-store.ts` module for extension settings persistence with listener pattern
- **GitHub icon in popup header:** Opens repository page in new tab
- **OpenCollective icon in popup header:** Heart icon linking to donate page
- **GitHub link in About tab:** Repository link with external-link icon
- **OpenCollective section in About tab:** Donate and Sponsors/Backers links
- **New icons:** `github`, `heart`, `external-link` added to Icon.svelte
- **Release scripts:** `npm run release`, `release:minor`, `release:major` for semver versioning
- **Auto-refresh button title in SessionsTab:** Visible "Auto-refresh" text label on per-domain toggle
- **New tests:** 144 new unit tests across 8 new/expanded test files (263 total, 90% statement coverage)
  - `tests/shared/api.test.ts` — 32 tests covering all API message wrappers
  - `tests/shared/settings-store.test.ts` — 25 tests covering settings persistence and listeners
  - `tests/content/idb-swap.test.ts` — 15 tests covering IndexedDB snapshot/restore round-trip
  - `tests/content/index.test.ts` — 12 tests covering content script message handlers
  - `tests/background/service-worker.test.ts` — 6 tests covering initialization and event handlers
  - Expanded: cookie-engine (+14), messaging (+15), tab-tracker (+7), cookie-store (+5), storage-store (+5), badge-manager (+3), session-manager (+5)

### Changed

- **Session switch now saves all cookies** (not just origin-scoped) before switching, preserving cross-domain auth cookies
- **Session switch now saves tab storage** (localStorage/sessionStorage) before navigating
- **`initSettings()` awaited before mount** in popup and options entry points, preventing race condition with stale defaults
- **`initSettings()` notifies listeners** after loading from storage, ensuring late-subscribing components receive initial state
- **SessionsTab `loadAllDetails` uses version guard** to prevent stale data from concurrent calls

### Fixed

- **DOM storage never restored after session switch:** `pendingRestores` map was never populated — session switch now queues a pending restore before navigation, and `handleContentScriptReady` triggers the restore when the content script loads
- **Cross-domain auth cookies lost on switch:** `switchSession` was calling `saveCookies()` (origin-only) which overwrote the full snapshot saved by `saveAllCookiesForSession()` — now uses `saveAllCookiesForSession` to preserve cross-domain cookies
- **Empty session names via `updateSession`:** `updateSession` now validates and trims the `name` field, rejecting empty/whitespace-only names (same validation as `createSession`)
- **"No sessions for this site yet" hides all sessions on unvisited origins:** The "Other sessions" group in the popup now auto-expands when no site-specific sessions exist (e.g., first visit to `authenticator.cursor.sh`), keeping all sessions accessible instead of hidden behind a collapsed toggle with a misleading empty-state message
- **"Create Session" silently fails when service worker is asleep:** `sendMessage` in `src/shared/api.ts` now retries once with a 200 ms delay when Chrome MV3 throws "Receiving end does not exist" (service worker waking from sleep); also guards against `undefined` responses to prevent a downstream `TypeError`

#### Prior Unreleased Items

- **Design system:** CSS custom properties with light/dark theme tokens (`src/shared/theme.css`)
- **Dark mode:** System preference detection + manual toggle (light/dark/system) with `chrome.storage` persistence
- **SVG icon library:** Inline Lucide icons replacing all Unicode symbols (`src/shared/components/Icon.svelte`)
- **Session emoji avatars:** Emoji picker in session creation, displayed alongside color
- **Session pinning:** Pin sessions to the top of the list
- **Session duplication:** Duplicate a session profile via context menu or API
- **Session reordering:** Drag-to-reorder with persistent sort order
- **Tab count badges:** Per-session tab count shown in the session list
- **Search/filter bar:** Auto-shown when more than 5 sessions exist
- **Inline rename:** Double-click session name to edit in place
- **Session detail panel:** Expandable stats (tabs, cookies, storage, IDB databases, origins)
- **Undo delete:** Toast notification with undo button after session deletion
- **Right-click context menu:** Rename, duplicate, pin/unpin, delete on session items
- **Keyboard shortcuts:** `n` (new session), `/` (search), `?` (quick-switch overlay), `Escape` (close)
- **Quick-switch overlay:** Press `?` then a number key (1-9) to switch sessions
- **First-run onboarding:** Guided empty state with 3-step instructions
- **Glassmorphism cards:** Session items with shadow, border, and color accent strip
- **Favicon display:** Current tab's favicon shown in the tab panel
- **Theme-aware brand logo:** `AppLogo.svelte` with light/dark variants from custom icon assets
- **Branded extension icons:** Resized from new Sun/Moon brand art (16/32/48/128px)
- **Options page tabbed layout:** Sessions, Settings, Import/Export, About tabs
- **Storage usage dashboard:** Per-session horizontal bar chart (cookies vs storage)
- **Drag-and-drop file import:** Drop JSON files onto the import zone
- **Visual diff on import:** Preview new/update/unchanged sessions before confirming
- **Settings tab:** Theme preference selection (radio buttons)
- **Shared API module:** Moved `api.ts` to `src/shared/` for popup + options reuse
- **Shared UI components:** ConfirmDialog, Toast, InlineEdit, ColorPicker, EmojiPicker, ThemeToggle, AppLogo
- **Accessibility:** Focus rings, ARIA labels, `prefers-reduced-motion`, `prefers-contrast: more` support, tooltips on truncated text
- **New message types:** `GET_TABS_FOR_SESSION`, `GET_ALL_TAB_COUNTS`, `GET_SESSION_STATS`, `DUPLICATE_SESSION`, `REORDER_SESSIONS`
- **Stats API:** `getStatsForSession()` on `CookieStore` and `StorageStore` for storage dashboard
- **New tests:** 55 new unit tests across 5 new test files and 4 expanded test files (119 total, 68% coverage)
- Installed `jsdom` dev dependency for browser environment tests
- **Domain-grouped session list:** "This site" shows sessions with saved data for current origin, "Other sessions" collapsed below
- **Default (no session):** Clears all cookies and navigates for a fresh login — acts as a clean browsing state
- **Per-origin session indicator:** Globe icon badge on sessions that have saved data for the current domain
- **Refresh button:** Inline icon in tab panel to re-capture session cookies and refresh popup state
- **Session detection:** Detects active session by comparing live cookies against saved snapshots (manual via refresh)
- **New message types:** `GET_SESSIONS_FOR_ORIGIN`, `SAVE_SESSION_DATA`, `DETECT_SESSION`, `CLEAR_ORIGIN_DATA`
- **`favicon` permission:** Required for MV3 `_favicon` API to display site icons

#### Prior Changed

- Session switch uses `chrome.tabs.update({url})` for fresh navigation instead of `chrome.tabs.reload()`
- Cookie restore runs in parallel via `Promise.allSettled` instead of sequential `await` per cookie
- Session switch only clears/restores cookies for the current origin (not all browser cookies)
- Cross-domain auth cookies (e.g., `anthropic.com` for `claude.ai`) are set without clearing
- Removed session selector dropdown from CurrentTabPanel — sessions are switched via the list cards
- CurrentTabPanel now shows only: favicon, origin URL, and refresh button
- Popup width from 320px to 380px
- Session items now use card-based glassmorphism design with left color border accent
- CurrentTabPanel now shows favicon, prominent domain, and session color accent
- NewSessionForm now includes emoji picker alongside color picker
- Options page refactored from monolithic layout to tabbed component architecture
- Moved `src/popup/lib/api.ts` to `src/shared/api.ts`
- Moved `src/popup/components/ColorPicker.svelte` to `src/shared/components/ColorPicker.svelte`
- Entry points (`popup/main.ts`, `options/main.ts`) now import theme CSS and initialize theme store
- `SessionProfile` type extended with optional `emoji` and `pinned` fields
- `CreateSessionMessage` extended with optional `emoji` field
- `UpdateSessionMessage` updates expanded to include `emoji` and `pinned`
- All hardcoded CSS colors replaced with CSS custom property tokens
- `confirm()` calls replaced with custom `ConfirmDialog` component (fixes Chrome extension popup compatibility)

#### Prior Fixed

- Chrome mock missing `updateSessionRules`/`getSessionRules` — 7 pre-existing test failures resolved
- Test assertions referencing `updateDynamicRules` updated to match actual `updateSessionRules` API
- **ERR_CONNECTION_RESET on session switch:** Stopped clearing ALL browser cookies; now only clears origin-scoped cookies
- **`__Host-` / `__Secure-` cookies:** Omit `domain` attribute and force `secure`/`path` for prefixed cookies during restore
- **Broken favicon in popup:** Use MV3 `_favicon` endpoint with error fallback to globe icon
- **Popup overflow clipping:** Restructured layout with scrollable content area and fixed-width container
- **Circular import crash:** Removed `cookie-engine` ↔ `tab-tracker` circular dependency that crashed service worker
- **Race conditions:** Tab tracker event handlers now call `ensureHydrated()` before accessing state
- **Unhandled promise rejections:** All async event listeners wrapped with `.catch()` error handlers
- **Stale popup state:** Popup updates `currentTabEntry` immediately after session switch
- **Auto-detect re-assigning cleared sessions:** Removed aggressive auto-detection from popup load
- **Svelte a11y warnings:** Added `role`, `onkeydown`, and `tabindex` attributes to interactive elements
- **`state_referenced_locally` warnings:** Suppressed via `svelte.config.js` `onwarn` filter

## [0.1.0] - 2026-04-07

### Added

- Initial project scaffolding with Manifest V3 configuration
- Project documentation:
  - `Docs/1-Idea.md` — project concept, motivation, and future vision
  - `Docs/2-Product-Specifications.md` — architecture, data model, isolation matrix, platform strategy, design constraints, and future work
  - `Docs/3-implementation-Plan.md` — 4-phase delivery plan with dependency map and risk register
- `CLAUDE.md` — AI assistant project context and conventions
- `README.md` — complete project documentation with architecture overview, installation, usage, and contributing guidelines
- `PRIVACY_POLICY.md` — privacy commitments (zero network calls, no telemetry)
- `manifest.json` — MV3 extension manifest with required permissions
- `.gitignore` — Node.js, Vite, IDE, and build artifact exclusions
