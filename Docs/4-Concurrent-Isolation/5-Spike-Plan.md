# 5 — Spike Plan: Verifying Approach C

**Version:** 0.1.0 (proposal)
**Status:** Not started
**Timebox:** 2 working days
**Last Updated:** 2026-09-02

---

## 1. Purpose

Approach C rests on a small number of platform assumptions that are documented nowhere authoritative enough to build on. The spike turns each into a **pass/fail observation** before any product code is written. Every hypothesis names the design element that depends on it and the fallback that applies if it fails, so the spike ends in a decision, not a discussion.

The spike is **throwaway code** on a branch (`spike/credentialless-shell`): a minimal shell page, a minimal service-worker addition, no UI polish, no tests beyond the checks below. Findings are recorded in `5a-Spike-Results.md` in this folder.

---

## 2. Environment

| Item | Value |
|---|---|
| Browsers | Chrome stable (≥ 110 required; use current), Edge stable, Brave stable — each run once for the headline (H11) and H1/H2 |
| Build | `npm run dev` (crxjs HMR) with the spike manifest additions: `webRequest`, `webNavigation`, `content_scripts[0].all_frames: true` |
| Test sites | (a) A **controlled origin** you own or run locally over HTTPS (e.g. a tiny Node/Deno server behind `mkcert`) that echoes request cookies, sets `HttpOnly` and non-`HttpOnly` cookies, sets cookies on a `302`, sends `X-Frame-Options`/`frame-ancestors` on demand, registers a service worker, and writes `localStorage`/IndexedDB. Deterministic checks need a server you control. (b) **Public**: GitHub (two accounts), a Google account (Gmail), one Cloudflare-fronted site. |
| Tooling | `chrome://net-export` for H7; DevTools *Application → Storage* on the frame target; the extension's Debug tab logs |

---

## 3. Harness

Minimal pieces, in this order:

1. **Shell page** `src/shell/index.html` — a `<div>` toolbar with an address input, one `<iframe credentialless sandbox="…" allow="…">` (attributes from `3-…` §9), and a button to add hidden sibling credentialless iframes.
2. **SW additions** — `SHELL_PRIME {tabId, host, cookies[]}` installs the PRIMER rules (`3-…` §6 slots 0–1) and resolves when the observer reports the primer response; `SHELL_UNPRIME` removes them. One top-level `onHeadersReceived` listener with `extraHeaders` logging `Set-Cookie` lines for shell tabs.
3. **Content script** — in shell mode logs `window.credentialless`, `location.href`, `document.contentType`, and answers `SHELL_PRIMER_READY` with a fixed localStorage/IDB restore.
4. **Controlled origin endpoints**: `/set` (sets `a=1; HttpOnly` and `b=2`), `/echo` (returns request cookies as JSON), `/login` (`302` → `/home` with `Set-Cookie: sid=…; HttpOnly`), `/xfo` (`X-Frame-Options: DENY`), `/csp` (`frame-ancestors 'self'`), `/sw.js` + `/pwa`, `/storage` (writes both storages), `/cached` (`Cache-Control: max-age=600`, body includes the request cookie).

---

## 4. Hypotheses

Legend: **Dep.** = design element that depends on it · **Pass** = observation required · **Fail →** = fallback.

### H1 — DNR-appended `Set-Cookie` is persisted into the credentialless partition's jar

- **Dep.** Prime-then-navigate bootstrap (`3-…` §4.2, §5). Load-bearing.
- **Procedure.** Install a session rule `{tabIds:[shell], urlFilter:'us-prime=1', resourceTypes:['sub_frame']}` → `responseHeaders: [{header:'set-cookie', operation:'append', value:'seed_ho=1; Path=/; HttpOnly'}, {header:'set-cookie', operation:'append', value:'seed_js=2; Path=/'}]`. Navigate the frame to `https://ctl/robots.txt?us-prime=1`, then to `https://ctl/echo`.
- **Pass.** `/echo` shows `seed_ho=1` and `seed_js=2` in the request cookies; DevTools shows them in the frame's cookie list; the profile's jar (`chrome://settings/cookies` or `chrome.cookies.getAll({domain:'ctl'})`) does **not** contain them.
- **Also check.** Appending a cookie with `Domain=.ctl-parent.test` on a response from `sub.ctl-parent.test`; an `Expires` in the past is dropped; a `Secure` cookie over HTTPS is kept; the seeded value wins over a same-name server cookie in the same response.
- **Fail →** F1: `chrome.debugger` on shell tabs, `Fetch.enable` Request stage, merge missing jar cookies into the outgoing `Cookie` header. Re-run the pass criteria with F1 before concluding the day.

### H2 — `webRequest.onHeadersReceived` + `extraHeaders` exposes `Set-Cookie` for shell-tab responses in MV3

- **Dep.** Cookie capture (`3-…` §4.4.1).
- **Procedure.** With the top-level listener registered, load `/set` and `/login` in the frame; also an `<img>` inside a frame page whose response sets a cookie; also a `fetch()` from frame JS.
- **Pass.** Every `Set-Cookie` line appears in the listener for `sub_frame`, `image`, `xmlhttprequest` types, with the correct `tabId` (the shell's) and `frameId ≠ 0`. Also confirm the listener fires after the SW was idle-terminated (wait > 60 s, then trigger).
- **Fail →** `chrome.debugger` `Network.enable` + `Network.responseReceivedExtraInfo` on shell tabs (raw headers, includes `Set-Cookie`).

### H3 — Sibling credentialless iframes in the same top-level document share the partition

- **Dep.** Background priming of secondary origins (`3-…` §4.5).
- **Procedure.** Frame A: `/set`. Add hidden frame B (credentialless) on the same origin → `/echo`. Then reload the *shell* and repeat `/echo` in a fresh frame.
- **Pass.** B's `/echo` shows A's cookies (shared nonce within one document); after the shell reload the fresh frame shows none (new nonce).
- **Fail →** Lazy priming in the visible frame only, with one automatic reload per newly visited origin-with-data.

### H4 — Content scripts inject into credentialless frames, including `text/plain` primer documents; `window.credentialless` is visible in the ISOLATED world

- **Dep.** Primer protocol, storage restore/capture, frame reporting (`3-…` §8).
- **Procedure.** Load `/robots.txt?us-prime=1` (text/plain) and `/storage` (HTML) in the frame with `all_frames: true`. Check the content script's log lines and that `localStorage.setItem` from the content script in the primer is visible to the subsequent `/storage` document (also covers H10 partially).
- **Pass.** Script runs in both documents; `window.credentialless === true`; writes from the primer document are visible to the next document in the same frame.
- **Fail (text/plain only) →** Prime with an HTML-returning URL (e.g. `/favicon.ico` is worse; use `/?us-prime=1` with `default-src 'none'`). **Fail (any) →** `chrome.scripting.executeScript({target:{tabId, frameIds:[id]}})` after `webNavigation.onCommitted`; if that also fails, C is cookie-only → reassess (`4-…` §5).

### H5 — `chrome.cookies` is blind to the partition (expected)

- **Dep.** Confirms that capture must be observer-based and that today's `saveCookies` cannot accidentally read or clobber partition cookies.
- **Procedure.** After H1/H2 data exists in the frame, run `chrome.cookies.getAll({domain:'ctl'})` and `chrome.cookies.getAll({domain:'ctl', partitionKey:{}})`.
- **Pass.** Partition cookies are absent from both. (If present under some `partitionKey` form, record how — it would simplify capture.)

### H6 — `sandbox` + `credentialless` coexist; framebusting is blocked; Google sign-in completes inside the frame once XFO/CSP are removed

- **Dep.** Framing-hostile flow (`3-…` §4.6); the single most demanded real-world case.
- **Procedure.** (a) Load `/xfo` and `/csp` with EMBED rules off → observe the block and the observer's detection; turn EMBED rules on → observe render. (b) Load a page with `top.location = 'https://example.org'` → must not navigate the shell. (c) With EMBED rules for `google.com`/`accounts.google.com`/`gstatic.com` as needed, sign in to Gmail via the frame (redirect flow). (d) GitHub sign-in.
- **Pass.** (a)–(d) succeed; note every header that had to be removed and every site-side warning ("browser not secure", etc.).
- **Fail (c) →** Documented limitation for Google; login-in-normal-tab-first workaround verified: log in via the sequential model, then open the isolated tab and confirm the seeded session is logged in.

### H7 — HTTP cache is partitioned by nonce

- **Dep.** Whether the `CACHE_GUARD` rule (`3-…` §6 slot 4) is needed.
- **Procedure.** Shell 1 (session A cookies) loads `/cached` (body echoes the cookie, `max-age=600`). Shell 2 (session B) loads `/cached`. Check body content and `webRequest` `fromCache` on the second load; corroborate with `chrome://net-export`.
- **Pass.** Shell 2 gets a network fetch with B's cookie, not A's cached body.
- **Fail →** Enable `CACHE_GUARD` (`Cache-Control: no-store` for non-static types on shell tabs).

### H8 — Permission-gated features and autofill inside the frame (informational)

- **Dep.** Limitations list.
- **Procedure.** In the frame: Chrome password-manager autofill on a saved login; `navigator.clipboard.writeText`; WebAuthn `navigator.credentials.get` (a test RP, e.g. webauthn.io) with `allow="publickey-credentials-get"`; `getUserMedia` with `allow="camera"`; `Notification.requestPermission()`; file download; `window.print()`.
- **Pass.** Record each as works / prompts / blocked. No fallback — this populates `3-…` §12.

### H9 — Observer overhead is acceptable

- **Dep.** Permission choice (`webRequest` global listener vs debugger-scoped).
- **Procedure.** With and without the `extraHeaders` listener registered, load a heavy public page (e.g. a news site) 10× in a **normal** tab; compare median `loadEventEnd` from `performance.getEntriesByType('navigation')`.
- **Pass.** Median delta ≤ 3 % (or within noise).
- **Fail →** Register the listener only while shell tabs exist *and* keep the SW alive while they do; if that is unreliable, debugger-scoped observation on shell tabs.

### H10 — `sessionStorage` written in the primer survives the frame's navigation to the target URL

- **Dep.** Deterministic sessionStorage restore (`3-…` §4.2).
- **Procedure.** Content script in the primer writes `sessionStorage.probe = 1`; navigate the same frame to `/storage`; read.
- **Pass.** Value present. **Fail →** Restore sessionStorage post-load (today's behaviour).

### H11 — Headline: two shells, same origin, two accounts, 10 minutes

- **Dep.** Everything.
- **Procedure.** Open GitHub in shell 1 (session A) and shell 2 (session B); log in as different users (H6 flow if needed). For 10 minutes: navigate, open repository pages, star/unstar, reload each shell, reload the browser, reopen both shells from their bookmark/hash URLs. Repeat with Gmail if H6(c) passed.
- **Pass.** Each shell consistently shows its own account after every action, including after browser restart (jar-seeded). No cross-account content, ever.
- **Fail →** Root-cause. A partition-level cause kills C (`4-…` §5); an implementation cause is just a bug.

---

## 5. Schedule

| When | What |
|---|---|
| Day 1 morning | Harness (§3), controlled origin, H1, H2 |
| Day 1 afternoon | H3, H4, H5, H10; if H1 failed, F1 prototype |
| Day 2 morning | H6 (Google, GitHub), H7 |
| Day 2 afternoon | H8, H9, H11 across Chrome/Edge/Brave; write `5a-Spike-Results.md` |

---

## 6. Decision matrix after the spike

| H1 | H2 | H4 | H6(c) | H11 | Outcome |
|---|---|---|---|---|---|
| ✅ | ✅ | ✅ | any | ✅ | **Go — C as specified.** `6-Implementation-Plan-C.md` starts. Google limitation documented if H6(c) failed. |
| ❌ | ✅ | ✅ | any | ✅ | **Go — C with F1** (debugger bootstrap on shell tabs). Add `debugger` permission to the plan; infobar limited to isolated tabs. |
| any | ❌ | ✅ | any | ✅ | **Go — C with debugger-scoped observation.** |
| any | any | ❌ | any | ✅ | **Conditional.** Cookie isolation works, storage restore does not. Reassess against B (`4-…` §5). |
| any | any | any | any | ❌ | **Stop.** Root-cause; if partition-level, C is dead. |

H3, H5, H7, H8, H9, H10 shape the implementation but never change the go/no-go.

---

## 7. Deliverables

- `Docs/4-Concurrent-Isolation/5a-Spike-Results.md` — one table row per hypothesis: browser, observation, pass/fail, evidence (log excerpt or screenshot path), decision taken.
- Updated status lines in `README.md` and `4-Comparison-and-Decision.md`.
- The spike branch is **not merged**; the harness is rewritten properly in Phase 1 of the implementation plan.
