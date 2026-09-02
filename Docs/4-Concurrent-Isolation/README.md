# Unaware Sessions — Concurrent Session Isolation (Design Study)

**Version:** 0.1.0 (proposal)
**Status:** Decision pending spike — recommended path is **Approach C**
**Last Updated:** 2026-09-02

---

## Why this folder exists

Today the extension is **sequential by construction**: on Chromium one origin can be bound to one session at a time, because the browser gives every tab in a profile the same cookie jar and the same per-origin DOM storage (`Docs/2-Product-Specifications.md` §2, "One active session per origin at a time"). The question this study answers is:

> Can two tabs on the **same origin** run **different sessions at the same time**, with real isolation — and if so, how exactly?

The short answers:

| Question | Answer |
|---|---|
| Can the current Snapshot & Swap model be extended to do it? | **No.** The constraint is the browser's, not the architecture's (see `1-Problem-Statement-and-Browser-Constraints.md`). |
| Does Chromium offer a native primitive to extensions? | **No.** No cookie-store creation, no per-tab partition API, no browser-context creation from `chrome.debugger`. |
| Is it achievable on Chromium at all? | **Yes, by two routes.** **B** — emulate a profile in JavaScript and at the network layer. **C** — host the site in a `<iframe credentialless>` inside an extension page and let Chromium's own partitioning do the isolation. |
| Which one? | **C.** It is the only route where the isolation is enforced by the browser rather than emulated by us. Its cost is user experience, which is a product decision we can design around; B's cost is correctness, which is not. |
| Is it decided? | **Not yet.** C rests on a small number of load-bearing platform assumptions. `5-Spike-Plan.md` verifies them in 1–2 days before any implementation starts. |
| Firefox? | Unaffected. `contextualIdentities` gives native per-tab containers; the planned Firefox work (`3-implementation-Plan.md` Phase 4.1) already covers it. |

## Documents

Read in order. Each document is self-contained but assumes the vocabulary below.

| # | Document | What it settles |
|---|---|---|
| 1 | `1-Problem-Statement-and-Browser-Constraints.md` | The precise definition of "real separation", the three browser-level walls, a complete inventory of Chromium mechanisms and why each does or does not help, and what in the current codebase carries over. |
| 2 | `2-Approach-B-Virtualization.md` | Full design of the emulation route: identity injection, cookie engine re-implementation, DOM storage virtualization, the service-worker problem, cache, detectability, permissions, coverage matrix, verdict. |
| 3 | `3-Approach-C-Credentialless-Shell.md` | Full design of the recommended route: partition semantics, the prime-then-navigate bootstrap, continuous capture, in-frame navigation, framing-hostile sites, popups, rule catalog, data model, shell UI, limitations, coverage matrix. |
| 4 | `4-Comparison-and-Decision.md` | Side-by-side comparison, the decision, what C gives up relative to B, and the conditions under which the decision would flip. |
| 5 | `5-Spike-Plan.md` | The hypotheses that must hold for C, how each is tested, pass/fail criteria, and the fallback for each failure. |
| 6 | `6-Implementation-Plan-C.md` | Phased delivery plan for C with module-level changes, message types, tests, exit criteria and a risk register. |

## Confidence legend

Every non-trivial claim in these documents carries one of three markers so that assumptions are never mistaken for facts:

| Marker | Meaning |
|---|---|
| ✅ **code** | Verified in this repository; the file and symbol are named. |
| 📘 **platform** | Documented Chromium / WebExtensions behaviour that the design relies on. |
| 🧪 **H*n*** | A load-bearing assumption that the spike in `5-Spike-Plan.md` verifies. The design states what happens if it fails. |

## Terminology

| Term | Meaning |
|---|---|
| **Sequential model** | Today's Snapshot & Swap: one session per origin at a time, switch = save → clear → restore → reload. |
| **Isolated tab** | The user-facing name for a tab running under Approach C. |
| **Shell** | The extension page (`chrome-extension://…/src/shell/index.html`) that hosts one `<iframe credentialless>` and the toolbar around it. One shell = one isolated tab. |
| **Partition** | The nonce-keyed cookie jar + storage bucket Chromium creates for a credentialless frame. Lives exactly as long as the shell document. |
| **Jar** | The extension-owned, persistent cookie snapshots in extension IndexedDB (`background/cookie-store.ts`, key `sessionId:origin`). The partition is ephemeral; the jar is what survives. |
| **Prime** | The bootstrap navigation that seeds a fresh partition from the jar before the real page loads. |
| **Observer** | The `chrome.webRequest.onHeadersReceived` listener that captures `Set-Cookie` headers for shell tabs. `chrome.cookies` cannot see a partition, so this is the only capture path. |
| **Managed origin** | An origin for which the active session holds a cookie or storage snapshot. |

## Explicit exclusions

The following were considered and are **out of scope by decision**, not oversight:

- Launching a second Chrome instance / profile through native messaging, or driving one over the remote-debugging protocol. It achieves real profile isolation but breaks the product thesis — a single window, zero installation, nothing outside the browser. Not covered further.
- Any Chromium fork or desktop wrapper.
- Manifest V2 mechanisms (`webRequestBlocking`). Unavailable to store-distributed MV3 extensions.
