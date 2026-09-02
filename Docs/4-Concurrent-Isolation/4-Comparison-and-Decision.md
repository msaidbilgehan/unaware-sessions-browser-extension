# 4 — Comparison and Decision

**Version:** 0.1.0 (proposal)
**Status:** Decision: **Approach C**, conditional on the spike
**Last Updated:** 2026-09-02

---

## 1. The two approaches in one sentence each

- **B — Virtualization.** Tabs stay real tabs; the extension replaces the browser's cookie store and every storage API with per-session emulations, held together by `chrome.debugger`.
- **C — Credentialless shell.** The site runs inside an extension page's `<iframe credentialless>`; Chromium creates a real partition per shell; the extension persists it.

Both meet the goal R1–R4 of `1-Problem-Statement-and-Browser-Constraints.md` on paper. They differ in **what enforces** the isolation and **what the user gives up**.

---

## 2. Side-by-side

| Dimension | B — Virtualization | C — Credentialless shell |
|---|---|---|
| **Who enforces isolation** | The extension (JS shim + CDP interception) | **Chromium** (storage/cookie/network partition) |
| **Failure mode of a gap** | Silent cross-session leak | Feature does not work inside the frame (fails closed) |
| **Surface that must be kept complete** | Every storage/cookie API Chrome ships, now and later | None — the partition covers whatever the page uses |
| **Cookie semantics** | Re-implemented (RFC 6265bis, PSL, SameSite, limits) | Native |
| **Redirect-after-login** | Correct only with `Fetch` pausing | Native |
| **Service workers** | Must be **blocked** on managed origins | Work, per partition |
| **Workers (dedicated/module)** | Residual hole | Covered |
| **HTTP cache** | Selective `no-store` injection | Partitioned (🧪 H7) |
| **Quota** | Shared per origin across sessions | Per partition |
| **Detectability / anti-fraud** | Patched globals are scoreable | Nothing patched |
| **`chrome.debugger`** | **Required** (identity injection + cookies) | Not required (fallback only) |
| **Infobar "is debugging this browser"** | Every managed tab | None (unless fallback) |
| **Enterprise `DeveloperToolsAvailability=2`** | Kills the feature | No effect |
| **New permissions** | `debugger` (+ `scripting`) | `webRequest`, `webNavigation` (optional) |
| **Store review risk** | High | Low–medium |
| **URL bar / history / bookmarks** | Native | Shell toolbar; shell URL in history/bookmarks |
| **Password manager, autofill** | Native | 🧪 H8 |
| **OAuth popup flows** | **Work** (opener intact, popup attached) | **Break** (noopener, other partition); redirect flows work |
| **Several tabs of one session sharing live state** | **Yes** (jar via SW) | No — via jar only (near-live); multi-frame shell later |
| **Container semantics (session spans origins)** | Yes | Yes |
| **Sites that refuse embedding** | N/A | Per-site consent to remove framing protection |
| **Deterministic storage restore before first script** | Yes (script injection) | Yes (primer) |
| **Exposure on SW restart** | Possible leak window (🧪) | None |
| **Robustness to Chrome updates** | Low (behavioural drift, new APIs) | High (web-platform contract) |
| **Estimated new code** | 6–9k lines + permanent tail | ~3–4k lines |
| **Reuse of existing modules** | Cookie store, DNR (partial); content-script swap **replaced** | Cookie store, storage store, DNR, content-script swap, auto-save cadence — **all reused** |

---

## 3. Surface coverage

| Surface | B | C |
|---|---|---|
| HTTP cookies (incl. HttpOnly) | ✅ emulated | ✅ native |
| JS cookies | ✅ emulated | ✅ native |
| WebSocket cookies | ⚠️ racy DNR | ✅ native |
| localStorage / IndexedDB / Cache Storage / OPFS | ✅ prefixed, shared quota | ✅ native |
| sessionStorage | ✅ native | ✅ native |
| Service workers | 🚫 blocked | ✅ |
| Workers | ❌ | ✅ |
| BroadcastChannel / Locks / SharedWorker | ✅ prefixed | ✅ |
| HTTP cache | ⚠️ selective no-store | ✅ (H7) |
| Clear-Site-Data | ✅ stripped | ✅ partition-scoped |
| FedCM | ❌ leak | ✅ fails closed |
| Detectability | ❌ | ✅ |

---

## 4. Decision

**Approach C is the recommended path.**

Rationale, in order of weight:

1. **It is the only route that satisfies the definition of "real separation".** Isolation enforced by the browser is categorically different from isolation emulated by us. B's residual holes (workers, FedCM, future APIs) are not bugs on a list; they are the shape of emulation. The project's own philosophy — no hacky fixes, no compounding debt — decides this on its own.
2. **Its compromise is a product decision, not a correctness decision.** The browser-in-browser UX is real, visible and designable: a toolbar, a session chip, explicit states. B's compromises are invisible until they fail.
3. **It reuses the codebase instead of replacing it.** Snapshot stores, content-script swap, DNR manager, auto-save cadence, undo buffer, sync — all carry over. B replaces the content-script layer and adds a cookie engine that must track Chrome forever.
4. **It does not depend on `chrome.debugger`.** No infobar, no enterprise-policy exposure, lower store-review risk. Debugger appears only as a *fallback* for one hypothesis.
5. **It keeps service workers.** The web apps users most want to multi-account on are PWAs; B degrades exactly those.
6. **It ships as a second mode.** Isolated tabs sit next to normal tabs; nothing about the sequential model changes for users who do not need concurrency (R7).

What C gives up relative to B, stated plainly so it is a conscious trade:

- OAuth/SSO **popup** flows (redirect flows work; login-in-normal-tab-first is the workaround).
- Native URL bar, history and bookmarks for the embedded site.
- Live sharing between several tabs of the same session (jar-mediated instead; near-live because capture is continuous).
- Sites that refuse embedding require a per-site, explicit consent to remove their framing protection inside the shell.

---

## 5. When the decision would flip

The decision is conditional on `5-Spike-Plan.md`. It changes only if the *browser-enforced* route is shown to be unusable, not merely inconvenient:

| Spike outcome | Consequence |
|---|---|
| H1 fails (appended `Set-Cookie` not persisted) | C continues with fallback F1 (`Fetch` merge on shell tabs). Isolation is still browser-enforced; only the bootstrap uses the debugger. Decision stands. |
| H2 fails (`Set-Cookie` not observable) | C continues with debugger-based observation on shell tabs. Decision stands. |
| H3 fails (siblings do not share the partition) | Lazy priming with one reload per new origin. Decision stands. |
| H4 fails (content scripts do not run in credentialless frames) | Storage restore/capture must move to `chrome.scripting.executeScript` by frame id; if that also fails, C cannot restore DOM storage → **C is cookie-only** → reassess against B. |
| H6 fails (Google sign-in cannot complete inside a frame even with headers removed) | Documented limitation + login-in-normal-tab-first. Decision stands unless the same holds for a majority of major sites. |
| H11 fails (two shells cannot hold two accounts on a major site) | Root-cause; if it is a partition property rather than a bug, **C is dead → B or nothing.** |

B is retained in full (`2-Approach-B-Virtualization.md`) precisely so that this last row has a ready answer.

---

## 6. Coexistence and platform plan

| Platform | Concurrency mechanism | Sequential model |
|---|---|---|
| Chromium 110+ | Isolated tabs (C) | Unchanged |
| Chromium < 110 | Feature hidden (feature-detect `credentialless`) | Unchanged |
| Firefox | `contextualIdentities` container tabs (`3-implementation-Plan.md` 4.1) — "Open in isolated tab" maps to `tabs.create({cookieStoreId})` | Fallback only where containers do not apply |

The two "open in isolated tab" actions therefore share one user-facing verb and one popup affordance across platforms, with browser-native isolation underneath on both.
