# Changelog

All notable changes to Unaware Sessions Browser Extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added

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

### Changed

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

### Fixed

- Chrome mock missing `updateSessionRules`/`getSessionRules` — 7 pre-existing test failures resolved
- Test assertions referencing `updateDynamicRules` updated to match actual `updateSessionRules` API

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
