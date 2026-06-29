# Cookie 隔离技术研究

> **核心摘要：** 该项目通过"快照-清除-恢复"三步 cycle 实现 Cookie 隔离，结合 DNR (DeclarativeNetRequest) 注入 Cookie 头解决页面首次加载时的时序问题，并通过 per-tab 互斥锁防止并发切换导致的数据交错。隔离粒度为 origin 级别，支持 soft/strict 两种模式。

---

## 1. 架构总览

Cookie 隔离涉及 4 个核心模块的协作：

```
┌─────────────────────────────────────────────────────────────────┐
│                     switchSession(tabId, sessionId)              │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────── cookie-engine.ts ──────────────────────┐  │
│  │  1. saveCookies(当前会话)    ← 并行执行                    │  │
│  │  2. saveTabStorage(当前会话)                               │  │
│  │  3. clearCookies(origin)     ← 清除浏览器 Cookie           │  │
│  │  4. restoreCookies(目标会话) ← 从 IndexedDB 恢复           │  │
│  │  5. updateRulesForTab()      ← DNR 注入 Cookie 头          │  │
│  │  6. chrome.tabs.update()     ← 刷新页面触发内容脚本        │  │
│  └────────────────────────────────────────────────────────────┘  │
│         │              │              │                          │
│         ▼              ▼              ▼                          │
│  cookie-store.ts  tab-tracker.ts  dnr-manager.ts                │
│  (IndexedDB存储)   (标签页映射)   (请求头注入)                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 核心调用链：switchSession

入口：`cookie-engine.ts:388` — `switchSession(tabId, targetSessionId)`

### 2.1 Per-Tab 互斥锁

```typescript
// cookie-engine.ts:388-404
export async function switchSession(tabId: number, targetSessionId: string): Promise<void> {
  const previous = switchLocks.get(tabId) ?? Promise.resolve();
  const work = previous.catch(() => {}).then(() => doSwitchSession(tabId, targetSessionId));
  switchLocks.set(tabId, work);
  try {
    await work;
  } finally {
    if (switchLocks.get(tabId) === work) {
      switchLocks.delete(tabId);
    }
  }
}
```

**设计要点：** 使用 Promise 链式排队，而非简单的锁标志。同一 tab 上的多次 `switchSession` 调用会串行执行，防止两个会话的 cookie 操作交错（例如：A 的 clear 和 B 的 restore 交叉执行导致数据丢失）。

### 2.2 doSwitchSession 六步流程

```
步骤 1: 保存当前会话数据（并行）
         ├─ saveCookies(currentSessionId, origin, storeId)
         └─ saveTabStorage(tabId, currentSessionId, origin)

步骤 2: 检查隔离模式
         ├─ soft 模式 + 目标无数据 → 跳过 cookie 操作，直接刷新
         └─ strict 模式（或目标有数据）→ 继续完整流程

步骤 3: clearCookies(origin, storeId) — 清除浏览器中的所有相关 cookie

步骤 4: restoreCookies(targetSessionId, origin, storeId) — 从 IndexedDB 恢复

步骤 5: 更新映射和规则（并行）
         ├─ assignTab(tabId, targetSessionId, origin)
         └─ updateRulesForTab(tabId, targetSessionId, origin)

步骤 6: chrome.tabs.update(tabId, { url }) — 刷新页面
         └─ 内容脚本加载后自动恢复 DOM Storage
```

---

## 3. Cookie 作用域解析：域层次遍历

`getCookiesForOrigin()` (`cookie-engine.ts:98-140`) 是整个隔离的基础——它决定了"哪些 cookie 属于这个 origin"。

### 问题

Chrome 的 `chrome.cookies.getAll({ domain: "www.google.com" })` **不会**返回 `.google.com` 的父域 cookie。但浏览器在实际请求时会发送父域 cookie。

### 解决方案：域层次拆分

```typescript
// "www.google.com" → ["www.google.com", "google.com"]
const parts = hostname.split('.');
const domainLevels: string[] = [];
for (let i = 0; i < parts.length - 1; i++) {
  domainLevels.push(parts.slice(i).join('.'));
}
```

然后并行查询每个层级的 cookie，去重后过滤出真正适用于目标 hostname 的 cookie。

### 去重逻辑

```typescript
const key = `${cookie.name}\0${cookie.domain}\0${cookie.path}\0${cookie.storeId}`;
```

使用 `\0` 分隔的复合键确保同一 cookie 不会被重复计入。

---

## 4. 隔离模式：Soft vs Strict

定义于 `settings-store.ts:55`：

```typescript
export function getDomainIsolationMode(domain: string): IsolationMode {
  return domainIsolationMap[domain] ?? currentSettings.isolationModeDefault;
}
```

### Soft 模式（默认）

**场景：** 用户在 Instagram 会话中访问了 Google，但 Google 没有保存过该会话的数据。

**行为：** 跳过 cookie 的 clear/restore，保留浏览器当前的 cookie 状态。只更新 tab 映射和移除 DNR 规则。

```typescript
// cookie-engine.ts:441-451
if (!hasTargetData && isolationMode === 'soft') {
  await Promise.all([assignTab(tabId, targetSessionId, origin), removeRulesForTab(tabId)]);
  await chrome.tabs.update(tabId, { url: tab.url });
  return;
}
```

**优势：** 不会破坏用户在其他服务（如 Google 登录）的会话状态。

### Strict 模式

**行为：** 无论目标会话是否有数据，都执行完整的 clear + restore cycle。

**优势：** 完全隔离，适合需要高隐私保护的场景。

---

## 5. DNR 请求头注入：解决首次加载时序问题

`dnr-manager.ts` 解决了一个关键时序问题：

### 问题

页面刷新时，浏览器在发起 HTTP 请求时就需要正确的 Cookie 头。但 `chrome.cookies.set()` 设置的 cookie 在当前标签页的**下一次请求**才会生效。如果在 `tabs.update()` 之前才调用 `restoreCookies()`，第一次请求可能携带错误的 cookie。

### 解决方案：DeclarativeNetRequest 规则

```typescript
// dnr-manager.ts:58-87
const rule: chrome.declarativeNetRequest.Rule = {
  id: ruleId,  // DNR_RULE_ID_BASE + tabId，确保唯一
  priority: 1,
  action: {
    type: 'modifyHeaders',
    requestHeaders: [{
      header: 'Cookie',
      operation: 'set',
      value: cookieHeader,  // 序列化后的 "name=value; name2=value2"
    }],
  },
  condition: {
    tabIds: [tabId],        // 只影响目标标签页
    urlFilter: `||${domain}`, // 只匹配目标域名
    resourceTypes: [...],    // 覆盖所有资源类型
  },
};
```

**关键细节：**
- 使用 `sessionRules`（非持久化规则），浏览器关闭自动清理
- 规则 ID 基于 tabId 计算：`DNR_RULE_ID_BASE + tabId`，确保每个 tab 最多一条规则
- 只注入目标 origin 的 cookie（经过域层次过滤），防止跨域 cookie 泄漏

### 序列化

```typescript
function serializeCookies(cookies: chrome.cookies.Cookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}
```

---

## 6. DOM Storage 隔离

除了 Cookie，浏览器还有 localStorage、sessionStorage、IndexedDB 三种存储需要隔离。

### 6.1 Content Script 架构

Content Script 在 `document_start` 时注入（关键！确保在页面脚本执行前就绑定监听器）：

```
content/index.ts
├─ 监听 SAVE_STORAGE 消息 → 调用 saveLocalStorage() + saveSessionStorage() + saveIndexedDB()
├─ 监听 RESTORE_STORAGE 消息 → 调用 restoreLocalStorage() + restoreSessionStorage() + restoreIndexedDB()
└─ 发送 CONTENT_SCRIPT_READY 通知 service worker
```

### 6.2 localStorage/sessionStorage 操作

`storage-swap.ts` 的实现非常直接：

```typescript
// 保存：遍历所有 key-value 对
export function saveLocalStorage(): Record<string, string> {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null) {
      const value = localStorage.getItem(key);
      if (value !== null) data[key] = value;
    }
  }
  return data;
}

// 恢复：先清空再逐个写入
export function restoreLocalStorage(data: Record<string, string>): void {
  localStorage.clear();
  for (const [key, value] of Object.entries(data)) {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      console.warn(`Failed to restore localStorage key "${key}":`, err);
    }
  }
}
```

### 6.3 恢复时序

DOM Storage 的恢复发生在页面刷新**之后**：

1. `switchSession()` 调用 `chrome.tabs.update()` 刷新页面
2. 新页面加载时 content script 注册消息监听器
3. Content script 发送 `CONTENT_SCRIPT_READY` 消息
4. Service worker 从 `pendingRestores` Map 中取出待恢复数据
5. 发送 `RESTORE_STORAGE` 消息给 content script
6. Content script 执行 localStorage/sessionStorage/IndexedDB 恢复

```typescript
// cookie-engine.ts:374-382
export function handleContentScriptReady(tabId: number): void {
  const pending = pendingRestores.get(tabId);
  if (!pending) return;
  pendingRestores.delete(tabId);
  restoreTabStorage(tabId, pending.sessionId, pending.origin).catch(...);
}
```

---

## 7. Tab 生命周期管理

`tab-tracker.ts` 负责维护 tab ↔ session 的映射关系。

### 7.1 跨 Origin 导航自动解绑

```typescript
// tab-tracker.ts:78-99
async function handleTabUpdated(tabId, changeInfo, tab) {
  if (changeInfo.url && tab.url) {
    const entry = tabMap.get(tabId);
    if (entry) {
      const newOrigin = extractOrigin(tab.url);
      if (newOrigin && newOrigin !== entry.origin) {
        // Origin 变化 → 解绑会话
        tabMap.delete(tabId);
        await persistTabMap();
        await removeRulesForTab(tabId);
        cleanupPendingRestore(tabId);
      }
    }
  }
}
```

**设计原因：** 会话数据属于旧 origin，如果在新 origin 上保持绑定，会导致跨域混乱（会话出现在错误的"当前站点"下）。

### 7.2 持久化

映射关系存储在 `chrome.storage.session` 中，Service Worker 重启时通过 `hydrateTabMap()` 恢复。

---

## 8. 数据流向图

```
用户点击切换会话
        │
        ▼
popup/App.svelte
        │ switchSession(tabId, sessionId)
        ▼
shared/api.ts
        │ chrome.runtime.sendMessage(...)
        ▼
background/messaging.ts
        │ 路由到对应 handler
        ▼
cookie-engine.ts::switchSession()
        │
        ├─► saveCookies() ──► cookie-store.ts ──► IndexedDB
        ├─► saveTabStorage() ──► content script ──► storage-store.ts ──► IndexedDB
        ├─► clearCookies() ──► chrome.cookies.remove()
        ├─► restoreCookies() ──► chrome.cookies.set()
        ├─► updateRulesForTab() ──► chrome.declarativeNetRequest
        ├─► assignTab() ──► tab-tracker.ts ──► chrome.storage.session
        └─► chrome.tabs.update() ──► 页面刷新
                                         │
                                         ▼
                                    content/index.ts
                                         │ CONTENT_SCRIPT_READY
                                         ▼
                                    cookie-engine.ts::handleContentScriptReady()
                                         │ RESTORE_STORAGE
                                         ▼
                                    storage-swap.ts (localStorage/sessionStorage)
                                    idb-swap.ts (IndexedDB)
```

---

## 9. 关键设计决策与权衡

### 9.1 为什么用 DNR 而非在 tabs.update 前设置 cookie？

`chrome.cookies.set()` 设置的 cookie 在**同一次请求**中不会生效——它只对**下一次**请求有效。DNR 规则直接修改请求头，可以在页面首次加载时就注入正确的 cookie。

### 9.2 为什么需要 per-tab 互斥锁？

考虑以下场景：
1. 用户快速点击切换到会话 A
2. 在 A 的切换完成前，又点击切换到会话 B

如果没有互斥锁：
- A 的 `clearCookies()` 执行
- B 的 `clearCookies()` 执行（此时 A 的 cookie 已被清除，但 A 还没 restore）
- A 的 `restoreCookies()` 执行
- B 的 `restoreCookies()` 执行（覆盖了 A 刚恢复的 cookie）

最终结果：A 的 cookie 丢失。

### 9.3 为什么 soft 模式是默认？

大多数用户在一个浏览器中使用多个站点。如果每次切换会话都清除所有 cookie，会破坏用户在其他站点（如 Google、GitHub）的登录状态。Soft 模式只在目标会话有保存数据时才执行隔离，对未管理的站点"透传"当前状态。

### 9.4 为什么使用 origin 而非 domain 作为隔离粒度？

Origin = `protocol + host + port`，比 domain 更精确：
- `https://api.example.com` 和 `https://www.example.com` 是不同的 origin
- 同一 domain 下的不同端口是不同的 origin
- 避免了协议或端口不同导致的 cookie 泄漏

---

## 10. 值得注意的边界情况处理

| 场景 | 处理方式 | 代码位置 |
|------|---------|---------|
| 单标签 hostname（如 localhost） | `domainLevels` 至少包含自身 | `cookie-engine.ts:112-114` |
| `__Host-` 前缀 cookie | 不设置 domain 属性，path 固定为 `/` | `cookie-engine.ts:209-210` |
| `__Secure-` 前缀 cookie | 强制 `secure: true` | `cookie-engine.ts:212-214` |
| `sameSite: no_restriction` | 强制 `secure: true` | `cookie-engine.ts:212` |
| 恢复失败的 cookie | 记录到环形缓冲区（最近 200 条） | `cookie-engine.ts:49-66` |
| DNR 规则容量 | 接近上限时发出警告 | `dnr-manager.ts:94-98` |
| Content script 未就绪 | 5 秒超时后放弃恢复 | `cookie-engine.ts:18,72-86` |
| 跨 origin 导航 | 自动解绑会话 | `tab-tracker.ts:88-96` |

---

## 11. 总结

这个项目的 Cookie 隔离技术可以概括为三个核心机制：

1. **快照-清除-恢复 Cycle** — 通过 IndexedDB 持久化每个会话的 cookie 快照，切换时先保存当前状态、清除浏览器 cookie、再恢复目标会话的 cookie
2. **DNR 请求头注入** — 利用 DeclarativeNetRequest API 在页面首次请求时就注入正确的 Cookie 头，解决 `chrome.cookies.set()` 的时序限制
3. **Per-Tab 互斥锁** — 通过 Promise 链式排队，确保同一 tab 上的会话切换串行执行，防止并发操作导致的数据丢失

**值得借鉴的做法：**
- 域层次遍历而非简单 domain 查询，确保父域 cookie 不遗漏
- Soft/strict 双模式设计，平衡隔离强度与用户体验
- 恢复失败的环形缓冲区，便于调试而不会无限增长内存
- Content script 的 `document_start` 注入 + ready 信号机制，确保时序正确
