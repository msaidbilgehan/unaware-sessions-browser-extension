# 1 — Problem Statement and Browser Constraints

**Version:** 0.1.0 (proposal)
**Status:** Analysis complete
**Last Updated:** 2026-09-02

---

## 1. Goal

Two browser tabs, same origin, different sessions, **at the same time**. Concretely, all of the following must hold for two tabs T₁ (session A) and T₂ (session B) both showing `https://mail.example.com`:

| Requirement | Meaning |
|---|---|
| **R1 — Concurrent identity** | T₁ is logged in as user A and T₂ as user B simultaneously. Interacting in one never changes who the other is. |
| **R2 — No cookie leakage** | No cookie set in T₁ (HTTP `Set-Cookie` *or* `document.cookie`) is ever sent from T₂, and vice versa. Includes parent-domain cookies (`.example.com`). |
| **R3 — No storage leakage** | `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, service-worker registrations, `BroadcastChannel`, Web Locks, OPFS are disjoint between T₁ and T₂. |
| **R4 — No cache leakage** | An authenticated response cached for T₁ is never served to T₂ (HTTP cache, prefetch/preload caches). |
| **R5 — Persistence** | Both identities survive closing the tab, reloading, restarting the browser and — as today — export/import and Drive sync, through the existing session snapshot stores. |
| **R6 — Fail closed** | If the isolation machinery cannot be established for a tab, the tab does not load as an ambiguous identity. It blocks, with a reason. |
| **R7 — Coexistence** | Today's sequential model keeps working unchanged for users who do not need concurrency. |

"Real separation" is R1–R4 enforced in a way that does not depend on the page cooperating. Anything the page can observe, bypass or break is emulation, not separation. This definition is what disqualifies most of the options below.

---

## 2. Why the sequential model cannot be extended

The sequential model swaps state *around* the browser's single-identity data structures. Concurrency requires *multiple* such structures, and Chromium keys them on things a tab cannot influence:

| Layer | Keyed on | Consequence for two tabs on one origin |
|---|---|---|
| HTTP cookie jar | **Profile** (`chrome.cookies` `storeId`: `"0"` normal, `"1"` incognito — nothing else exists) | One jar. Whatever T₁'s server sets, T₂ sends. |
| `localStorage`, IndexedDB, Cache Storage, OPFS, service-worker registry | **StorageKey** = origin (+ top-level site for third-party contexts) | One bucket. A token T₁ writes, T₂ reads. |
| `sessionStorage` | Per top-level browsing context (tab) | Already isolated — the only layer that is. |
| HTTP cache, socket pools | Network isolation key = top-level site + frame origin | Shared between same-site top-level tabs. |
| `BroadcastChannel`, `SharedWorker`, Web Locks | Origin (+ storage partition) | Cross-talk between sessions. |

✅ **code** — the model's own documentation states the limit: `Docs/2-Product-Specifications.md` §2 ("Two tabs on gmail.com with different sessions would corrupt each other's storage") and §9. `background/cookie-engine.ts` `doSwitchSession` is the embodiment: save the outgoing session from the *one* jar, clear, restore the target into the *one* jar, reload. There is exactly one jar to restore into; there is no second jar to give T₂.

Two things in the current design are already tab-scoped and carry over unchanged to either approach below:

- ✅ **code** — `background/dnr-manager.ts` `updateRulesForTab` installs a **session-scoped DNR rule per tab** (`condition.tabIds: [tabId]`, `requestDomains: [domain]`, `modifyHeaders` → `Cookie: set`). The outbound request header is already per tab; what is missing is everything inbound and everything in the DOM.
- ✅ **code** — the snapshot stores are keyed `sessionId:origin` (`background/cookie-store.ts` `buildKey`, `background/storage-store.ts`), which is exactly the granularity a concurrent design needs for its persistent jar.

---

## 3. Chromium capability inventory

Every mechanism that could plausibly give a tab its own identity, and the verdict. "Verdict" is against R1–R7.

| Mechanism | What it provides | Verdict |
|---|---|---|
| `chrome.cookies` `storeId` | Enumerate/read/write the profile's stores. | ❌ Only `"0"` and `"1"`; no create API. 📘 |
| Incognito window (`chrome.windows.create({incognito:true})`) | A second, ephemeral jar + storage. | ❌ N = 2, ephemeral, requires "Allow in Incognito", and the SW runs in *spanning* mode with one shared state. Not a general mechanism. 📘 |
| Chrome profiles | Real isolation. | ❌ No extension API can open a tab in another profile. 📘 |
| `chrome.debugger` → `Target.createBrowserContext` | What Puppeteer uses for isolated contexts. | ❌ `chrome.debugger` attaches at tab/target level; browser-context management requires a browser-level DevTools session, which is not exposed to extensions. 📘 |
| `<webview partition="persist:x">` | Named persistent partitions. | ❌ Chrome Apps only. 📘 |
| `<controlledframe partition=…>` | Successor to `<webview>`. | ❌ Isolated Web Apps only (enterprise/dev install, not Web Store). 📘 |
| Storage partitioning by top-level site | Third-party *storage* is keyed by top-level site. | ❌ Cookies are not partitioned this way (only `Partitioned`-attribute cookies are, and only when the server opts in), and all our top-level documents would share one site anyway. 📘 |
| CHIPS (`Set-Cookie: …; Partitioned`) | Per-top-level-site cookies. | ❌ Server opt-in. 📘 |
| Partitioned popins | Partitioned popup windows. | ❌ Partitioned by the *opener's* top-level site — all our shells share it. Origin trial. 📘 |
| Fenced frames | Nonce-partitioned frames. | ❌ Designed for ads; no navigation/communication freedom. 📘 |
| **`<iframe credentialless>`** (Chrome 110+) | **A fresh, nonce-keyed, ephemeral partition per top-level document**: cookie jar, storage, service-worker registry, network partition. | ✅ **The only per-document fresh partition Chromium hands to web content.** Basis of Approach C. 📘 |
| `declarativeNetRequest` session rules with `tabIds` | Static, per-tab request/response header rewriting. | ✅ Half a mechanism: can inject/strip headers per tab, cannot *observe* anything, cannot compute values. Used by both approaches. 📘 ✅ code |
| `chrome.webRequest` (MV3, observe-only) | Read request/response headers including `Set-Cookie` with `extraHeaders`. Cannot block or modify. | ✅ The capture path for both approaches. 🧪 H2 confirms `Set-Cookie` visibility in MV3. 📘 |
| `chrome.scripting` / manifest `world: "MAIN"` (Chrome 111+) | Run extension code in the page's JavaScript world at `document_start`. | ✅ Needed by B for API virtualization; **not** needed by C's core. 📘 |
| `chrome.debugger` (tab-level CDP) | `Fetch` interception (synchronous request/response rewriting), `Page.addScriptToEvaluateOnNewDocument`, `Network.responseReceivedExtraInfo`. | ⚠️ Powerful and exact, but shows a persistent "is debugging this browser" infobar, is disabled by enterprise `DeveloperToolsAvailability`, and draws store-review scrutiny. **Required** by B; **fallback only** in C. 📘 |

Three consequences fall directly out of this table:

1. **There is no native answer.** Every mechanism that isolates by construction is closed to extensions, except `<iframe credentialless>` — and that one isolates a *frame*, not a tab, which is exactly the shape of Approach C's compromise.
2. **Anything tab-shaped must be emulated** (Approach B). Emulation has an unbounded surface: every storage API Chromium ships is a new hole until patched.
3. **Observation is asynchronous, modification is static.** `webRequest` can see but not change; DNR can change but not see, and only with values known in advance. Any design that needs "see a `Set-Cookie`, then change the next request accordingly" has a race in it, unless the browser's own jar does the seeing-and-changing. This single fact shapes both designs more than anything else.

---

## 4. What already exists and carries over

| Existing capability | Location (✅ code) | Reused by B | Reused by C |
|---|---|---|---|
| Per-tab DNR `Cookie` header rule with `requestDomains` scoping and the `||`-prefix-slide safeguard | `background/dnr-manager.ts` | Yes (steady-state WebSocket rule, defense in depth) | Yes (bootstrap only) |
| Per-origin cookie snapshot store, key listing/pruning, undo buffer | `background/cookie-store.ts`, `background/snapshot-undo.ts` | Yes — becomes *the* jar | Yes — becomes *the* jar |
| Per-origin storage snapshot store | `background/storage-store.ts` | Yes | Yes |
| Domain-hierarchy cookie resolution for an origin | `background/cookie-engine.ts` `getCookiesForOrigin` (live store) | Concept reused over the jar | Concept reused over the jar (seed set = all session cookies that domain-match the host) |
| Content-script localStorage/sessionStorage/IndexedDB save & restore, binary encoding | `content/storage-swap.ts`, `content/idb-swap.ts`, `content/index.ts` | Replaced by MAIN-world virtualization | Reused as-is for restore (partition starts empty → no clear step) and capture |
| Event-driven auto-save, debounce, tab-close/cross-origin capture | `background/tab-tracker.ts` | Partially (cookies come from the jar, not `chrome.cookies`) | Partially (cookie capture becomes continuous via the observer; storage cadence reused) |
| Tab → session map with `storeId`, persisted to `chrome.storage.session` | `background/tab-tracker.ts`, `shared/types.ts` `TabSessionEntry` | Extended with a mode | Extended with a mode + shell registry |
| Typed message router, idempotent mutations, API retry | `background/messaging.ts`, `shared/api.ts` | New message types | New message types |
| Badge, context menu, popup grouping | `background/badge-manager.ts`, `background/context-menu.ts`, `popup/` | New entry points | New entry points |
| Sync, export/import, tombstones | `shared/sync/*`, `EXPORT_FULL_*` | Untouched (same stores) | Untouched (same stores) |

What does **not** carry over in either approach: `chrome.cookies.getAll/set/remove` as the capture and restore mechanism for concurrent tabs. In B the browser jar is deliberately kept empty; in C the partition is invisible to `chrome.cookies` (🧪 H5). Capture becomes header observation in both.

---

## 5. Reading the market

Public evidence points the same way as the table above, and is worth recording so the conclusion is not re-derived every time the question comes up:

- The best-known Chrome extension for this exact feature ran, in its Manifest V2 era, on `webRequestBlocking` header rewriting plus in-page API overrides — i.e. Approach B with the one primitive MV3 removed. After MV3 the product moved its core to a desktop application. (Recorded from public product history; hedged — not verified against internal sources.)
- The remaining players in "multi-account browsing" are Chromium forks or anti-detect browsers, i.e. they changed the browser rather than extending it.

Nobody has shipped browser-enforced concurrent isolation as a plain MV3 Chrome extension. Approach C is, to our knowledge, the first design that could, because `<iframe credentialless>` (2023) post-dates the era in which those products made their architectural choices.

---

## 6. Non-goals

- Fingerprint isolation (canvas, fonts, UA) — orthogonal; covered by `2-Product-Specifications.md` §10.5 as future work.
- IP isolation — §10.2 (per-session proxy).
- Making two *normal* tabs concurrent on Chromium. Section 3 shows this is not available to extensions; the deliverable is a new tab *kind* (isolated tab) alongside normal tabs, not a change to normal tabs.
