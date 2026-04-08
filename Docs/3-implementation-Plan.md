# Unaware Sessions — Implementation Plan

**Version:** 0.1.0
**Status:** Draft
**Last Updated:** 2026-04-07

---

## Phased Delivery

The implementation is split into 4 phases. Each phase produces a **shippable increment** — the extension works at the end of every phase, just with fewer features.

```mermaid
gantt
    title Implementation Phases
    dateFormat  YYYY-MM-DD
    axisFormat  %b %d

    section Phase 1 - Foundation
    Project scaffolding           :p1a, 2026-04-08, 3d
    Service Worker core           :p1b, after p1a, 5d
    Session CRUD                  :p1c, after p1b, 4d
    Cookie swap engine            :p1d, after p1c, 5d

    section Phase 2 - Storage Isolation
    Content script injection      :p2a, after p1d, 4d
    localStorage swap             :p2b, after p2a, 3d
    sessionStorage swap           :p2c, after p2b, 2d
    IndexedDB swap (best-effort)  :p2d, after p2c, 5d

    section Phase 3 - UX & Polish
    Popup UI (Svelte)             :p3a, after p2d, 5d
    Context menu integration      :p3b, after p3a, 3d
    Tab badges and indicators     :p3c, after p3b, 2d
    Options page                  :p3d, after p3c, 4d

    section Phase 4 - Cross-Browser & Release
    Firefox contextualIdentities  :p4a, after p3d, 5d
    Import/Export                  :p4b, after p4a, 3d
    E2E testing                   :p4c, after p4b, 4d
    Store packaging               :p4d, after p4c, 3d
```

---

## Phase 1 — Foundation (Cookie Isolation)

**Goal:** Extension can create sessions and swap cookies per-tab on Chromium. No UI yet — tested via dev console and background script commands.

### 1.1 Project Scaffolding

- [x] Initialize Vite + TypeScript project with web-ext plugin
- [x] Configure `manifest.json` for MV3 (permissions, service worker, content scripts)
- [x] Set up ESLint + Prettier with shared config
- [x] Set up Vitest for unit tests
- [x] Create folder structure:

```
src/
  background/
    service-worker.ts        # Entry point
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
    types.ts                 # Shared interfaces
    constants.ts             # Extension-wide constants
    storage.ts               # chrome.storage helpers
    utils.ts                 # Shared utilities
  assets/
    icons/
```

### 1.2 Service Worker Core

- [x] Implement SW lifecycle management (install, activate, wake)
- [x] State hydration from `chrome.storage.session` on SW wake
- [x] Message router: receive messages from popup/content scripts, dispatch to handlers
- [x] `chrome.alarms` for periodic state persistence (backup every 60s)

### 1.3 Session Manager

- [x] `createSession(name, color)` — generate UUID, store profile in `chrome.storage.local`
- [x] `deleteSession(id)` — remove profile, clean up all snapshots for that session
- [x] `listSessions()` — return all session profiles
- [x] `updateSession(id, partial)` — rename, recolor
- [x] `getSessionForTab(tabId)` — lookup from tab-session map

### 1.4 Cookie Swap Engine

- [x] `saveCookies(sessionId, origin)` — `chrome.cookies.getAll({domain})` → store in extension IndexedDB
- [x] `clearCookies(origin)` — `chrome.cookies.remove()` for all cookies on origin
- [x] `restoreCookies(sessionId, origin)` — load from extension IndexedDB → `chrome.cookies.set()` each
- [x] `switchSession(tabId, targetSessionId)` — orchestrate: save current origin cookies → clear origin cookies → restore target cookies (with cross-domain passthrough) → update mapping → update DNR → navigate tab via `chrome.tabs.update({url})`
- [x] Handle subdomain cookies (`.gmail.com` vs `mail.gmail.com`)
- [x] Handle `Secure`, `SameSite`, `HttpOnly` attributes correctly on restore

### 1.5 Tab Tracker

- [x] Listen to `chrome.tabs.onCreated`, `onRemoved`, `onUpdated`
- [x] Maintain `tabId → { sessionId, origin }` mapping
- [x] Persist mapping to `chrome.storage.session`
- [x] Clean up mappings when tabs close
- [x] Handle tab navigation (origin change within same tab)

### 1.6 DNR Manager

- [x] Generate `declarativeNetRequest` dynamic rules for cookie header manipulation
- [x] Scope rules to specific tab + session combination
- [x] Update rules on session switch
- [x] Monitor rule count (warn if approaching 5,000 limit)
- [x] Clean up stale rules on session/tab removal

**Phase 1 Exit Criteria:**

- Can create 3 sessions via background script console
- Can assign a tab to a session
- Switching sessions on a tab swaps cookies and reloads
- Two different sessions on `gmail.com` produce two different logged-in states
- All state survives SW restart

---

## Phase 2 — Storage Isolation

**Goal:** Extend isolation to localStorage, sessionStorage, and IndexedDB (best-effort). Content scripts handle the DOM storage layer.

### 2.1 Content Script — Storage Swap

- [x] Change content script `run_at` from `document_idle` to `document_start`
- [x] On SW message `saveStorage`:
  - Read all `localStorage` keys/values → send to SW for IndexedDB storage
  - Read all `sessionStorage` keys/values → send to SW for IndexedDB storage
- [x] On SW message `restoreStorage`:
  - Clear `localStorage` and `sessionStorage`
  - Write all keys/values from snapshot
- [x] Handle storage quota errors (skip with warning if origin storage exceeds limits)
- [x] Measure and report storage sizes to SW

### 2.2 Content Script — IndexedDB Swap (Best-Effort)

- [x] Enumerate databases via `indexedDB.databases()` (check browser support)
- [x] For each database:
  - Open with current version
  - Iterate all object stores
  - Read all records via cursor
  - Serialize to transferable format (handle Blobs, ArrayBuffers)
- [x] Save full IDB snapshot to extension's own IndexedDB (namespaced by session + origin)
- [x] Restore: delete existing databases → recreate with saved schema + data
- [x] Add timeout (5s max per database) — skip and warn on slow/large databases
- [x] Skip databases over configurable size threshold (default: 50MB)

### 2.3 Integrate with Session Switch Flow

- [x] Storage save is decoupled from session switch — users save storage manually via the "Refresh session data" button. Cookie swap handles the switch. Content script restores storage on page load if a pending restore is queued.
- [x] Handle edge case: content script not yet injected (fresh tab)
- [x] Handle edge case: content script message timeout (page unresponsive)

**Phase 2 Exit Criteria:**

- localStorage and sessionStorage can be saved/restored via manual action
- IndexedDB snapshots work on simple sites
- Cookie isolation handles login state across switches

---

## Phase 3 — UX & Polish

**Goal:** Full popup UI, context menus, tab badges. The extension is usable by a human without dev console.

### 3.1 Popup UI (Svelte)

- [x] Session list view:
  - Display all sessions with name, color dot, tab count
  - Active session highlighted
  - Domain-grouped session list ("This site" / "Other sessions")
  - "Default (no session)" option for fresh login
- [x] New session form:
  - Name input (validate: non-empty, unique)
  - Color picker (8 preset colors + custom hex)
  - Create button
- [x] Current tab panel:
  - Show current tab's origin and active session
  - Click session cards to switch sessions
- [x] Session management:
  - Inline rename (double-click or right-click → Rename)
  - Delete (confirm dialog, warn about data loss)
  - Context menu on sessions (Rename, Duplicate, Pin, Delete)
  - Refresh button to re-capture session data
- [x] Empty state: first-run onboarding prompt
- [x] Loading states during session switch

### 3.2 Context Menu

- [x] Register `chrome.contextMenus` on extension install
- [x] "Open in Session" parent menu on links
- [x] Dynamic child items: one per session + "New Session..."
- [x] Update menu items when sessions are created/deleted
- [x] Handle: open link in new tab with target session's cookies pre-loaded

### 3.3 Tab Badges

- [x] Set `chrome.action.setBadgeText` with session name abbreviation (first 2 chars)
- [x] Set `chrome.action.setBadgeBackgroundColor` with session color
- [x] Update badge on tab focus change
- [x] Clear badge when tab has no session (default context)

### 3.4 Options Page

- [x] Session profile management (list, bulk delete)
- [x] Import/Export buttons (JSON file)
- [x] Per-session settings: User-Agent override, custom headers
- [x] Data usage display (total storage per session)
- [x] "Clear all data" with confirmation
- [x] About section (version, links)

**Phase 3 Exit Criteria:**

- User can create, switch, rename, delete sessions entirely via popup UI
- Right-click "Open in Session" works on any link
- Tab badges show session identity at a glance
- Options page allows import/export and settings

---

## Phase 4 — Cross-Browser & Release

**Goal:** Firefox support via `contextualIdentities`, import/export, E2E tests, and store-ready packaging.

### 4.1 Firefox Support (Not started)

- [ ] Detect Firefox at runtime (`typeof browser !== 'undefined'` + user agent)
- [ ] Firefox session manager: create/delete `contextualIdentities` (containers)
- [ ] Map session profiles to container IDs
- [ ] On session switch: open new tab with `cookieStoreId` instead of cookie swap
- [ ] Adapt popup UI: hide "storage isolation" indicators (Firefox handles natively)
- [ ] Test with `web-ext run` on Firefox

### 4.2 Import / Export

- [x] Export: serialize all session profiles to JSON → download as file
- [x] Import: file picker with drag-drop support → validate JSON schema → visual diff preview → create sessions
- [x] Handle conflicts (duplicate session names): prompt user to rename or skip
- [ ] Optional: AES-256-GCM encryption with user-provided passphrase

### 4.3 E2E Testing

- [ ] Set up Playwright with Chrome and Firefox browser contexts
- [ ] Test scenarios:
  - Create session → open tab → verify cookies isolated
  - Switch session → verify cookies swapped + page reloaded
  - Delete session → verify cleanup
  - Context menu → open link in session
  - Import/export round-trip
  - SW restart → verify state persisted
- [ ] CI pipeline: run tests on push

### 4.4 Store Packaging

- [ ] Chrome Web Store:
  - Build with `vite build`
  - Generate `.zip` of `dist/chrome`
  - Write store listing (description, screenshots, privacy policy)
- [ ] Firefox Add-ons (AMO):
  - Build with Firefox-specific manifest adjustments
  - Generate `.zip` of `dist/firefox`
  - Submit source code for review (AMO requirement)
- [ ] Privacy policy document (already exists: `PRIVACY_POLICY.md`)
- [ ] Update `README.md` with install instructions and screenshots

**Phase 4 Exit Criteria:**

- Import/export with visual diff preview works
- Firefox support, E2E tests, and store packaging are not yet implemented

---

## Dependency Map

```mermaid
graph LR
    P1A[1.1 Scaffolding] --> P1B[1.2 SW Core]
    P1B --> P1C[1.3 Session Manager]
    P1B --> P1E[1.5 Tab Tracker]
    P1C --> P1D[1.4 Cookie Engine]
    P1E --> P1D
    P1D --> P1F[1.6 DNR Manager]

    P1D --> P2A[2.1 Storage Swap]
    P1D --> P2B[2.2 IDB Swap]
    P2A --> P2C[2.3 Integration]
    P2B --> P2C

    P1C --> P3A[3.1 Popup UI]
    P2C --> P3A
    P1C --> P3B[3.2 Context Menu]
    P1E --> P3C[3.3 Tab Badges]
    P3A --> P3D[3.4 Options Page]

    P3A --> P4A[4.1 Firefox Support]
    P3D --> P4B[4.2 Import/Export]
    P4A --> P4C[4.3 E2E Testing]
    P4B --> P4C
    P4C --> P4D[4.4 Store Packaging]
```

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| IndexedDB snapshot fails on complex apps (Gmail, Slack) | High | Medium | Best-effort with user warning. Cookie isolation covers login scenarios. IDB is a bonus, not a requirement. |
| DNR rule limit reached with many sessions | Low | Medium | Monitor count, prune stale rules, warn user at 80% capacity. |
| Content script race condition on storage restore | Medium | Low | `document_start` injection. Acceptable for v1 — most sites init storage after DOM ready. |
| SW killed mid-swap (MV3 lifecycle) | Medium | High | Make swap operations atomic: persist each step's completion state. Resume on SW wake if interrupted. |
| Chrome Web Store review rejects `<all_urls>` | Low | High | Justify in review notes: cookie/storage access requires broad host permissions. Precedent: SessionBox, Multi-Account Containers. |
| `indexedDB.databases()` not supported in all browsers | Medium | Low | Feature-detect. Skip IDB enumeration where unavailable. Does not block core functionality. |
