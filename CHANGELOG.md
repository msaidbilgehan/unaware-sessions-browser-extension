# Changelog

All notable changes to Unaware Sessions Browser Extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added

- **Encrypted Google Drive sync:** Opt-in two-way sync of all session data (`FullExportData`) to the user's own Google Drive using `drive.appdata` scope (hidden app folder, no access to user files)
  - **AES-256-GCM encryption** with PBKDF2 key derivation (600K iterations) — encryption key derived from Google User ID, enabling cross-device sync with the same Google account
  - **Three merge strategies:** Trust Cloud (overwrite local), Trust Local (overwrite cloud), Ask (per session:origin conflict picker with bulk "All Local" / "All Cloud" buttons)
  - **Auto-sync** via `chrome.alarms` at configurable intervals (Off / 5m / 15m / 30m)
  - **Conflict detection** via SHA-256 per-origin checksums stored in an unencrypted manifest file on Drive
  - **Auto-recovery** on decryption failure (e.g., account change or data migration) — automatically overwrites remote with local data
  - **Cloud Sync card** in Settings tab with connect/disconnect, status indicator, merge strategy pills, auto-sync interval pills, and encryption explainer
  - **Sync Conflict Dialog** (`SyncConflictDialog.svelte`) — modal with per-origin local/cloud toggle, bulk resolution, timestamps
- **New shared modules for sync:**
  - `src/shared/sync/sync-types.ts` — `SyncConfig`, `SyncState`, `ConflictEntry`, `SyncManifest`, `EncryptedPayload` types
  - `src/shared/sync/crypto-engine.ts` — `encrypt()`, `decrypt()`, `deriveKey()`, `sha256Hex()`
  - `src/shared/sync/drive-client.ts` — Google Drive REST API v3 wrapper: `getToken()`, `findFile()`, `createFile()`, `updateFile()`, `downloadFile()`, `revokeAccess()`, `getGoogleUserId()`
  - `src/shared/sync/sync-store.ts` — `SyncConfig` persistence with listeners (follows `settings-store.ts` pattern)
  - `src/shared/sync/sync-engine.ts` — `buildLocalManifest()`, `detectConflicts()`, `mergeData()`, `applyFullData()`, `executeSyncCycle()`
  - `src/background/drive-sync.ts` — alarm-based auto-sync, sync triggers, conflict resolution
- **Batch session operations for sync:** `batchSetSessions()` in session-manager for atomic session replacement (single storage write vs O(N²)), `deleteAllSessions()` cascade
- **`getAllSnapshots()` on CookieStore and StorageStore:** Single-pass IDB read for sync export, replacing per-session O(N×T) cursor scans
- **New icons in Icon.svelte:** `cloud`, `cloud-off`
- **6 new message types:** `SYNC_CONNECT`, `SYNC_DISCONNECT`, `SYNC_NOW`, `SYNC_GET_STATE`, `SYNC_CONFIGURE`, `SYNC_RESOLVE_CONFLICTS`
- **6 new API wrappers:** `syncConnect()`, `syncDisconnect()`, `syncNow()`, `syncGetState()`, `syncConfigure()`, `syncResolveConflicts()`
- **`identity` permission + `oauth2` block** in manifest.json for Google OAuth2
- **New tests:** 84 new tests across 10 new/expanded test files (467 total)
  - `tests/shared/sync/crypto-engine.test.ts` — encrypt/decrypt round-trip, wrong key, SHA-256
  - `tests/shared/sync/drive-client.test.ts` — Drive API calls with mocked fetch, 401 retry, `getGoogleUserId`
  - `tests/shared/sync/sync-store.test.ts` — config persistence, listeners, init
  - `tests/shared/sync/sync-engine.test.ts` — manifest building, conflict detection, merge strategies
  - `tests/background/drive-sync.test.ts` — sync triggers, alarm management, error persistence
  - Expanded: `session-manager.test.ts` (+6 for `batchSetSessions`, `deleteAllSessions`)
  - `tests/shared/logger.test.ts` — 20 tests for level filtering, entry structure, buffer management, console mirroring
  - Expanded: `security-store.test.ts` (+5 for `removeBiometric`, `removePasscode` edge cases, `isBiometricAvailable`)
  - Expanded: `drive-sync.test.ts` (+3 for config change alarm update/clear, alarm handler with googleId)
- **Security layer (passcode + biometric):** Optional 4-digit passcode (PBKDF2-SHA256, 600K iterations, 16-byte random salt) and/or WebAuthn platform biometric (fingerprint/Face ID) to protect session switch, delete, export, import, and clear-all actions; configurable grace period (1/2/5/10/30 min) stored in `chrome.storage.session` (auto-clears on browser close); biometric requires passcode as prerequisite for recoverability
- **Security store (`src/shared/security-store.ts`):** Config manager following settings-store pattern with `chrome.storage.local` persistence, `chrome.storage.onChanged` cross-context sync, listener pattern, and init guard for idempotent initialization
- **Crypto utilities (`src/shared/crypto-utils.ts`):** Pure PBKDF2 hashing, salt generation, constant-time comparison; `saltToBase64`/`base64ToSalt` encoding helpers
- **Auth check utility (`src/shared/auth-check.ts`):** `checkAuth()` returns `'not-needed'` | `'grace-active'` | `'auth-required'`; used by popup and options pages before protected actions
- **AuthGate component (`src/shared/components/AuthGate.svelte`):** Modal overlay with 4-digit PIN input (auto-advance, backspace, paste, shake on error), biometric button, auto-trigger biometric once on mount with PIN fallback, rate limiting (5 attempts → 30s cooldown), "Forgot Passcode?" reset flow
- **Security card in Settings tab:** Passcode toggle with inline PIN setup/confirm/change/disable flows, biometric toggle (disabled until passcode is set, uses biometric verification to disable with PIN fallback), grace period pill selector
- **`withAuth()` wrapper in popup and ImportExportTab:** Gates protected actions behind auth check; shows AuthGate modal when authentication is required
- **`fingerprint` icon in Icon.svelte:** SVG path for biometric UI elements
- **`SecurityConfig` and `GracePeriodMs` types:** Added to `src/shared/types.ts`
- **Security storage keys:** `SECURITY_CONFIG` and `SECURITY_GRACE_UNTIL` added to `STORAGE_KEYS`; `DEFAULT_SECURITY_CONFIG` and `GRACE_PERIOD_OPTIONS` constants
- **New tests:** 39 new tests across 3 new test files (383 total)
  - `tests/shared/crypto-utils.test.ts` — 11 tests for hashing, salt encoding, verification
  - `tests/shared/security-store.test.ts` — 24 tests for store lifecycle, passcode, grace period, listeners, cross-context sync
  - `tests/shared/auth-check.test.ts` — 4 tests for auth check states
- **Structured logger (`src/shared/logger.ts`):** Configurable log levels (off/error/warn/info/debug) with in-memory ring buffer, persistent to `chrome.storage.local`, viewable and exportable from Debug tab
- **Extension Logs in Debug tab:** Log viewer with level filter, refresh, export, and clear actions; log level selector (pill buttons) moved from Settings to Debug for co-location with log output
- **Missing icons added to Icon.svelte:** `file-text` (used by Logging/Extension Logs sections) and `folder` (used by domain groups in popup SessionList)
- **`--text-2xs` design token:** New 10px font size token in theme.css for badge and caption text
- **`--color-interactive-thumb` design token:** Dedicated token for toggle switch thumbs (white in both themes)
- **Custom scrollbar styling:** Thin 6px scrollbar with theme-aware colors via `--scrollbar-*` tokens, applied globally via `::-webkit-scrollbar` and `scrollbar-width: thin`
- **Dark mode `*-soft` token visibility:** Bumped accent-soft, error-soft, success-soft, and warning-soft opacity from 0.12 to 0.18 in dark theme for visible icon badge backgrounds
- **High-contrast `prefers-color-scheme: dark` fallback:** Added nested media query in `@media (prefers-contrast: more)` for users with system dark mode without explicit `data-theme` attribute
- **Auto-refresh toggle in popup:** Button next to refresh to enable/disable periodic session data refresh
- **Auto-refresh settings:** Configurable interval (1m/2m/5m) and per-domain toggle in options page
- **Settings store:** New `settings-store.ts` module for extension settings persistence with listener pattern
- **GitHub icon in popup header:** Opens repository page in new tab
- **OpenCollective icon in popup header:** Heart icon linking to donate page
- **GitHub link in About tab:** Repository link with external-link icon
- **OpenCollective section in About tab:** Donate and Sponsors/Backers links
- **New icons:** `github`, `heart`, `external-link` added to Icon.svelte
- **Release scripts:** `npm run release`, `release:minor`, `release:major` for semver versioning
- **Auto-refresh button title in SessionsTab:** Visible "Auto-refresh" text label on per-domain toggle
- **Cookie isolation modes:** `soft` (default) preserves cookies on domains without saved session data; `strict` always clears cookies for full isolation — configurable globally and per-domain via Settings tab
- **Full backup/restore:** "Full Export" packages all sessions, cookie snapshots, and storage snapshots into a single timestamped JSON file; "Full Import" with stats preview and session name deduplication
- **Debug tab in options page:** Cookie diff viewer comparing saved snapshots against live browser cookies with per-cookie status (matched, value changed, flags changed, missing, extra, expired); restore failure log showing recent cookie restoration failures with timestamp, session, origin, and failure reason
- **Per-tab session switch mutex:** Concurrent session switches on the same tab are serialized to prevent interleaved cookie operations
- **Restore failure tracking:** Ring buffer (max 200 entries) in cookie engine records failed cookie restorations with detailed context for Debug tab inspection
- **TabBar keyboard navigation:** Arrow key navigation with circular wrap, ARIA `role="tab"` and `aria-selected` attributes, `tabindex` management, focus-visible styling
- **New message types:** `EXPORT_FULL`, `IMPORT_FULL`, `GET_LIVE_COOKIES`, `GET_COOKIE_DIFF`, `GET_RESTORE_FAILURES`
- **New API functions:** `exportFull()`, `importFull()`, `getLiveCookies()`, `getCookieDiff()`, `getRestoreFailures()`
- **New types:** `IsolationMode` (`soft` | `strict`), `FullExportData`, `CookieDiffEntry`, `CookieDiffResult`, `RestoreFailureEntry`, `LiveCookieInfo`
- **IDB binary encoding:** Content script encodes `ArrayBuffer`, `TypedArray`, and `Date` values into JSON-safe marker objects before `chrome.runtime.sendMessage` (Chrome extension messaging uses JSON serialization, not structured clone) and decodes them on restore — fixes Instagram Signal Protocol IDB restore failures ("contacts", "identity", "meta" stores)
- **`allKeys` field on `ObjectStoreSnapshot`:** Cursor keys are now saved for all records (not just out-of-line key stores), providing a fallback when inline keyPath values are corrupted during JSON round-trips
- **New tests:** 82 new unit tests across 2 new + expanded test files (344 total, 93%+ statement coverage)
  - `tests/background/auto-refresh.test.ts` — 10 tests covering alarm creation, storage listeners, session refresh deduplication
  - `tests/background/cold-start.test.ts` — 8 tests covering concurrent hydration, cold-start data availability, switch mutex serialization
  - Expanded: messaging (+9 for cookie diff branches), dnr-manager (+3 for origin filter), cookie-engine (+3 for origin filtering), idb-swap (+8 for encode/decode, out-of-line keys, error handling), tab-tracker (+1 for cross-origin unassignment)

### Changed

- **Popup and options init chain:** `initSecurity()` runs in parallel with `initSettings()` via `Promise.all` before mounting the Svelte app
- **SettingsTab expanded:** Added Security card section with passcode, biometric, and grace period controls
- **ImportExportTab protected actions:** Full export, full import, and clear-all now gated behind `withAuth()` check
- **Popup protected actions:** Session switch and session delete now gated behind `withAuth()` check
- **Data Management moved to Data tab:** "Clear All Data" danger zone relocated from About tab to ImportExportTab ("Data" tab) for logical grouping with export/import; AboutTab no longer requires `sessions`/`onupdate` props
- **Logging settings moved to Debug tab:** Log level selector relocated from Settings tab to Debug tab's Extension Logs card for co-location with log output; removed log-level state and imports from SettingsTab
- **Search matches domains:** Session search in both popup (`SessionList.svelte`) and options (`SessionsTab.svelte`) now matches against associated origin domains in addition to session names — searching "claude" finds sessions with claude.ai data
- **Auto-refresh toggle uses green status indicator:** Active auto-refresh buttons use `--color-success` (green) with pulsing dot instead of blue accent, visually distinct from action buttons; applied to both popup (`CurrentTabPanel`) and options (`SessionsTab`)
- **Popup uses natural document scroll:** Removed all inner scroll containers (`overflow-y: auto`, `max-height`, `overflow: clip` hacks); Chrome's popup viewport is now the single scroll owner — eliminates the double-scrollbar problem
- **13 hardcoded `font-size: 10px` replaced with `var(--text-2xs)`:** Across SessionItem, SessionList, SessionDetail, DebugTab, SessionsTab, AboutTab
- **Toggle thumb uses design token:** `background: white` in SettingsTab replaced with `var(--color-interactive-thumb)`
- **Options page tab labels updated:** "Import/Export" tab renamed to "Data"
- **Settings tab expanded:** Added cookie isolation section with soft/strict mode toggle and educational explainer
- **ImportExportTab redesigned:** Dual export paths (profile-only vs full export), auto-detection of full vs legacy import format, stats preview for full imports
- **`switchSession` respects isolation mode:** In soft mode, skips cookie clear/restore on domains with no target session data; removes DNR rules and lets browser cookies pass through
- **`getCookiesForOrigin()` exported as public** from cookie-engine for use in debug APIs
- **Tab tracker and session manager APIs now async:** `getTabEntry()` and `getTabsForSession()` awaited consistently
- **Options page quiet updates:** `updateSessionsQuietly()` only replaces state when data actually changed, preventing unnecessary re-renders
- **Cookie operations now walk the domain hierarchy:** `saveCookies`, `clearCookies`, and `detectSessionForOrigin` use `getCookiesForOrigin()` to query all ancestor domains (e.g., `.google.com` when on `www.google.com`), ensuring parent-domain cookies are included
- **"Default (no session)" clears only origin cookies:** `CLEAR_ORIGIN_DATA` now uses `clearCookies(origin)` instead of wiping all browser cookies, preventing forced re-login on unrelated sites
- **Removed unused permissions:** Removed `scripting` (content scripts are manifest-declared), `declarativeNetRequestFeedback` (debug-only, never used), and `activeTab` (redundant with `<all_urls>` host permission) from manifest.json
- **Session switch saves origin-scoped cookies only:** Replaced `saveAllCookiesForSession` (captured entire browser cookie jar) with origin-scoped `saveCookies` across all call sites (session switch, auto-refresh, manual save, clear-origin) — prevents cross-domain cookie pollution
- **Session switch now saves tab storage** (localStorage/sessionStorage) before navigating
- **Tab unassignment on cross-origin navigation:** When a tab navigates to a different origin, the session is automatically unassigned — session data belongs to the old origin; keeping it assigned causes cross-domain confusion (session appearing under wrong "THIS SITE" group)
- **`restoreCookies` filters by origin domain hierarchy:** Only restores cookies matching the target origin (same domain, parent domain, or subdomain); legacy snapshots with cross-domain cookies are safely filtered
- **DNR rules filter cookies by origin:** `updateRulesForTab` now filters snapshot cookies by origin domain hierarchy before building the Cookie header — prevents legacy cross-domain cookies from being sent to wrong servers
- **Removed cross-domain cookie restore block:** The 65-line cross-domain cookie restore logic in `doSwitchSession` was removed — origin-scoped saves make it unnecessary
- **`cleanupPendingRestore` wired to tab removal:** Pending storage restores are now cleaned up when tabs are closed, preventing memory leaks in the service worker
- **IDB `deleteDatabase` errors are now non-fatal:** Both `onerror` and `onblocked` from `deleteDatabase` log a warning and proceed with the restore attempt instead of aborting — fixes IDB restore failures in incognito mode and restricted contexts where `deleteDatabase` is rejected even on a clean session
- **IDB restore forces schema upgrade on blocked delete:** When `deleteDatabase` is blocked (page holds open connections), opens the DB with `version + 1` to force `onupgradeneeded`, deletes all pre-existing object stores, and recreates from the snapshot — prevents silent schema mismatch and data merge corruption
- **IDB restore clears stores before writing:** `store.clear()` is called before `put()` during restore to prevent old data from merging with snapshot records
- **IDB restore validates store existence:** Before opening a transaction, verifies all expected stores exist in the DB — produces a clear error instead of an uncatchable `NotFoundError`
- **IDB snapshot closes leaked connections on timeout:** When `withTimeout` rejects a snapshot operation, the inner `indexedDB.open()` success handler now detects the settled state and closes the DB immediately — prevents connection leaks that cascaded into blocked `deleteDatabase` calls
- **Auto-refresh respects per-domain toggle:** `refreshAllActiveSessions` now checks `isDomainAutoRefreshEnabled` before saving, making the per-domain opt-out setting functional (previously dead code)
- **Auto-refresh skips tabs mid-session-switch:** Alarm handler checks `isTabSwitching(tabId)` to avoid saving empty or mid-swap cookie state during a concurrent session switch
- **Settings store syncs across contexts via `onChanged`:** `initSettings` registers a `chrome.storage.onChanged` listener to keep in-memory `currentSettings`, `domainRefreshMap`, and `domainIsolationMap` in sync when modified from popup or options page — fixes stale per-domain settings in the background service worker
- **`initAutoRefresh` and `initSettings` are idempotent:** Both functions now guard against duplicate initialization on service worker restarts, preventing accumulation of redundant storage listeners
- **Alarm handler wrapped in error boundary:** `chrome.alarms.onAlarm` listener now catches and logs errors from `refreshAllActiveSessions` and `persistTabMap` to prevent unhandled rejections from crashing the service worker
- **Removed 30-second auto-refresh interval:** Chrome `alarms.create` enforces a minimum 1-minute period; the 30s option was silently clamped and has been removed from `AutoRefreshInterval` type and Settings UI
- **`initSettings()` awaited before mount** in popup and options entry points, preventing race condition with stale defaults
- **`initSettings()` notifies listeners** after loading from storage, ensuring late-subscribing components receive initial state
- **SessionsTab `loadAllDetails` uses version guard** to prevent stale data from concurrent calls

### Fixed

- **Drive sync 401 on reconnect after disconnect:** `getGoogleUserId()` called `/oauth2/v3/userinfo` which requires the `openid` scope — not declared in the manifest. After token revocation + reconnect, Chrome only granted the declared `drive.appdata` scope, causing 401 "Invalid Credentials". Switched to `/drive/v3/about?fields=user(permissionId)` which only requires the existing `drive.appdata` scope
- **Drive sync decryption failure blocks all future syncs:** When remote data was encrypted with a different account (e.g., after account change or migration from passphrase-based encryption), `decrypt()` threw an unrecoverable error, trapping the user in an error loop. Now catches decryption failures and auto-recovers by overwriting remote with local data (trust-local fallback)
- **Auto-refresh button shows stale state when `autoRefreshDefaultEnabled` changes:** The `onSettingsChange` handler in `App.svelte` updated `autoRefreshInterval` but never re-evaluated `domainAutoRefreshOn`. When the global "Auto-refresh for new domains" default changed (e.g., toggled in the Options page while the popup was open), the background immediately applied the new default—refreshing sessions with no explicit per-domain entry—while the popup button stayed unchanged and showed the wrong active/inactive state. The `SessionsTab` had the same bug: `domainRefreshVersion` only incremented on `AUTO_REFRESH_DOMAINS` storage changes, not on `EXTENSION_SETTINGS` changes, so per-domain toggle indicators in the options page also stayed stale. Fixed by re-evaluating `domainAutoRefreshOn` in `App.svelte`'s settings change callback and by bumping `domainRefreshVersion` in `SessionsTab`'s settings change callback.

- **Google "cookie settings" error on session switch:** `clearCookies()` only queried `chrome.cookies.getAll({ domain })` for the exact hostname, missing parent-domain cookies (e.g., `.google.com` when on `www.google.com`) — orphaned old-session cookies coexisted with new-session cookies, triggering Google's security check. Now walks the domain hierarchy via `getCookiesForOrigin()` to clear all applicable cookies
- **"Default (no session)" nuked all browser cookies:** `CLEAR_ORIGIN_DATA` handler called `chrome.cookies.getAll({})` and removed every cookie across all domains, forcing re-login on every site — now scoped to origin-only clearing
- **DOM storage never restored after session switch:** `pendingRestores` map was never populated — session switch now queues a pending restore before navigation, and `handleContentScriptReady` triggers the restore when the content script loads
- **Gmail/Google services break after Instagram session switch:** `restoreCookies` restored ALL cookies from the snapshot (including stale Google cookies from legacy `saveAllCookiesForSession` snapshots) without origin filtering — old Google auth cookies overwrote current valid ones, corrupting the Gmail session. Now filters by origin domain hierarchy; cross-domain cookies handled separately with soft/strict isolation
- **Sessions appear under wrong "THIS SITE" in popup:** `saveAllCookiesForSession` captured the entire browser cookie jar under a `sessionId:origin` key, creating false associations between sessions and unrelated origins. Switching Instagram sessions could create `session:https://chatgpt.com` entries. Replaced with origin-scoped `saveCookies` across all call sites
- **Session assigned to wrong domain after tab navigation:** When a tab navigated from chatgpt.com to claude.ai, `handleTabUpdated` kept the session assigned and just updated the origin — causing auto-refresh to save cookies for the wrong origin and the popup to show the session under the wrong "THIS SITE" group. Now unassigns the session on cross-origin navigation
- **Instagram IDB restore failures ("contacts", "identity", "meta"):** `chrome.runtime.sendMessage` uses JSON serialization (not structured clone), so `ArrayBuffer` and `Date` values in IndexedDB records became `{}` or strings after the round-trip, causing `DataError: Evaluating the object store's key path yielded a value that is not a valid key`. Now encodes binary/Date values into JSON-safe marker objects before sending and decodes them on restore
- **DNR Cookie header leaks cross-domain cookies:** Legacy snapshots containing cookies from multiple domains had all cookies serialized into the DNR `Cookie` header — sending Google cookies to Instagram's servers. Now filters by origin domain hierarchy before building the header
- **Pending storage restores leak on tab close:** `cleanupPendingRestore` was exported and tested but never called from any tab removal handler — pending restores for closed tabs accumulated in the service worker's memory. Now wired to `handleTabRemoved`
- **IDB restore fails in incognito mode:** `deleteDatabase()` errors (common in incognito/restricted contexts where IDB access is limited) caused the entire restore to abort even on clean sessions with no existing database. Now treats `deleteDatabase` failures as non-fatal warnings and proceeds with the restore — if IDB is truly inaccessible, the subsequent `open()` fails gracefully via the existing catch handler
- **IDB restore corrupts database on blocked delete (claude.ai `keyval-store`):** When `deleteDatabase` was blocked by an active page connection, `onblocked` resolved as if deletion succeeded. The subsequent `open(name, version)` with the same version skipped `onupgradeneeded` entirely — object stores were never recreated, the transaction on snapshot store names threw `NotFoundError`, and any surviving stores had old data merged with snapshot data via `put()` without clearing. Now bumps the version to force upgrade, deletes existing stores, recreates from snapshot, and clears before writing
- **IDB snapshot timeout leaks connections causing cascading failures (claude.ai):** When `withTimeout` rejected a snapshot after 5 seconds, the inner `indexedDB.open()` eventually succeeded but nobody closed the resulting `IDBDatabase` handle. This leaked connection then blocked all future `deleteDatabase` calls on the same database name, creating a vicious cycle: timeout → leaked connection → blocked delete → failed restore. Now detects post-timeout success and immediately closes the DB
- **Per-domain auto-refresh toggle had no effect:** `refreshAllActiveSessions` iterated ALL tracked tabs unconditionally — the `isDomainAutoRefreshEnabled` check, the domain refresh map, and the per-domain UI toggle were completely dead code. Users who disabled auto-refresh for a specific session+origin still had their data refreshed on every alarm tick. Now checks the per-domain setting before each tab refresh
- **Auto-refresh overwrites session data during concurrent switch:** If the auto-refresh alarm fired mid-session-switch (after cookies were cleared but before restore), `saveCookies` would save an empty cookie jar to the outgoing session's snapshot, destroying its data. The `switchLocks` mutex only protected `switchSession` calls against each other. Now skips tabs with an active switch lock
- **Settings changes from popup/options not visible to background:** `settings-store.ts` loaded settings into module-level variables at init time with no `chrome.storage.onChanged` listener to sync them. When the options page updated `domainRefreshMap` or `domainIsolationMap`, the background service worker's in-memory copies stayed stale until the next SW restart. Now registers an `onChanged` listener to keep all maps in sync
- **Empty session names via `updateSession`:** `updateSession` now validates and trims the `name` field, rejecting empty/whitespace-only names (same validation as `createSession`)
- **"No sessions for this site yet" hides all sessions on unvisited origins:** The "Other sessions" group in the popup now auto-expands when no site-specific sessions exist (e.g., first visit to `authenticator.cursor.sh`), keeping all sessions accessible instead of hidden behind a collapsed toggle with a misleading empty-state message
- **"Create Session" silently fails when service worker is asleep:** `sendMessage` in `src/shared/api.ts` now retries once with a 200 ms delay when Chrome MV3 throws "Receiving end does not exist" (service worker waking from sleep); also guards against `undefined` responses to prevent a downstream `TypeError`
- **Popup crashes with `each_key_duplicate` after creating/duplicating/restoring a session:** `handleCreate`, `handleRestore`, and duplicate appended the new session to the local array (`sessions = [...sessions, newItem]`), but the `chrome.storage.onChanged` listener concurrently refreshed `sessions` via `listSessions()` — the same session ID appeared twice, crashing Svelte 5's keyed `{#each}` block and freezing the popup (back button, navigation all broken). Now fetches the authoritative session list from the background after mutation instead of local append
- **"Default (no session)" discards session data:** `CLEAR_ORIGIN_DATA` handler cleared cookies and unassigned the tab without first saving the current session's cookies and DOM storage — switching back to the session found an empty or stale snapshot. Now saves via `saveAllCookiesForSession` + `saveTabStorage` before clearing, matching the save behavior in `switchSession`

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
