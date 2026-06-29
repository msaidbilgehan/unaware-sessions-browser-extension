# 项目编码习惯分析

**创建日期**: 2026-06-25
**项目**: Unaware Sessions Browser Extension

## 目录

- [核心编码规范](#核心编码规范)
- [TypeScript 类型使用](#typescript-类型使用)
- [命名约定](#命名约定)
- [文件组织原则](#文件组织原则)
- [导入/导出模式](#导入导出模式)
- [注释风格](#注释风格)
- [状态管理模式](#状态管理模式)
- [错误处理模式](#错误处理模式)
- [异步处理模式](#异步处理模式)
- [CSS/样式组织](#css样式组织)
- [测试编写习惯](#测试编写习惯)
- [关键设计模式](#关键设计模式)

---

## 核心编码规范

| 维度 | 规范 |
|------|------|
| 语言 | TypeScript strict 模式，ES2022 目标 |
| UI 框架 | Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`) |
| 模块系统 | ESM，路径别名 (`@shared/*`, `@background/*`, `@content/*`) |
| 导出风格 | 仅命名导出，无 barrel 文件，无默认导出 |
| 文件命名 | kebab-case (`.ts`)，PascalCase (`.svelte`) |
| 常量 | SCREAMING_SNAKE_CASE，`as const` 数组，对象命名空间 |
| 消息传递 | 判别联合 (`MessageType` 枚举 + `Message` 联合类型) |
| 状态管理 | 模块级可变状态 + `chrome.storage` + 发布/订阅监听器 |
| 样式 | CSS 自定义属性 (设计令牌)，Svelte 作用域样式，暗色/亮色/系统主题 |
| 测试 | Vitest + 完整 Chrome API mock，目录结构镜像 |
| 错误处理 | `instanceof Error` + `Promise.allSettled` 处理部分失败 |
| 异步模式 | async/await，`Promise.all` 并行，防抖存储监听器 |
| 国际化 | svelte-i18n 懒加载，支持 4 种语言 (en, zh, de, ja) |
| 格式化 | Prettier: 单引号、尾随逗号、100 字符宽度、2 空格缩进 |
| 代码检查 | ESLint flat config + typescript-eslint strict + svelte + prettier |

---

## TypeScript 类型使用

### 严格配置

`tsconfig.json` 启用以下严格选项：
- `strict: true`
- `noImplicitAny: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `forceConsistentCasingInFileNames: true`

### 类型模式

**接口用于数据形状，类型别名用于联合/枚举：**

```typescript
// 接口 - 数据模型
interface SessionProfile {
  id: string
  name: string
  color: string
  // ...
}

// 类型别名 - 联合类型
type IsolationMode = 'soft' | 'strict'
type AutoRefreshInterval = 'off' | '5m' | '15m' | '30m'
type LogLevel = 'off' | 'error' | 'warn' | 'info' | 'debug'
```

**判别联合用于消息传递：**

```typescript
enum MessageType {
  CREATE_SESSION = 'CREATE_SESSION',
  SWITCH_SESSION = 'SWITCH_SESSION',
  // 40+ 消息类型...
}

interface CreateSessionMessage {
  type: MessageType.CREATE_SESSION
  name: string
  // ...
}

type Message = CreateSessionMessage | SwitchSessionMessage | // ...
```

**标准响应包装器：**

```typescript
interface MessageResponse<T> {
  success: boolean
  data?: T
  error?: string
}
```

**`as const` 断言：**

```typescript
const STORAGE_KEYS = {
  SESSIONS: 'sessions',
  TAB_MAP: 'tabMap',
  // ...
} as const

const DEFAULT_SESSION_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', // ...] as const
```

**`Pick` 和 `Partial` 用于更新载荷：**

```typescript
type UpdateSessionPayload = Partial<Pick<SessionProfile, 'name' | 'color' | 'emoji' | 'pinned'>>
```

**内联 `import(...)` 类型引用避免循环依赖：**

```typescript
type SyncConfig = Partial<import('@shared/sync/sync-types').SyncConfig>
```

**未使用变量前缀 `_`：**

```typescript
function handleMessage(msg: Message, _sender: chrome.runtime.MessageSender) {
  // _sender 未使用
}
```

---

## 命名约定

### 文件命名

| 类型 | 格式 | 示例 |
|------|------|------|
| TypeScript 文件 | kebab-case | `session-manager.ts`, `cookie-engine.ts` |
| Svelte 组件 | PascalCase | `SessionItem.svelte`, `AuthGate.svelte` |
| 测试文件 | 源文件名 + `.test.ts` | `session-manager.test.ts` |
| 常量文件 | kebab-case | `constants.ts` |

### 变量和函数

```typescript
// 变量和函数 - camelCase
const sessionManager = new SessionManager()
function hydrateSessions() { /* ... */ }
function getCookieStoreIdForTab(tabId: number) { /* ... */ }

// 常量 - SCREAMING_SNAKE_CASE
const ALARM_PERSIST_STATE = 'persist-state'
const STORAGE_KEYS = { /* ... */ } as const
const MESSAGE_TIMEOUT_MS = 5000
const PBKDF2_ITERATIONS = 600_000

// 布尔 getter - is/has 前缀
function isTabSwitching(tabId: number): boolean { /* ... */ }
function isGracePeriodActive(): boolean { /* ... */ }
function isSecurityEnabled(): boolean { /* ... */ }

// 事件处理函数 - handle 前缀
function handleTabRemoved(tabId: number) { /* ... */ }
function handleStorageChange(changes: chrome.storage.StorageChange) { /* ... */ }
function handleCreate(msg: CreateSessionMessage) { /* ... */ }

// 监听器订阅函数 - on 前缀
function onSettingsChange(callback: (settings: Settings) => void): () => void { /* ... */ }
function onThemeChange(callback: (theme: Theme) => void): () => void { /* ... */ }
```

### 接口

```typescript
// PascalCase，描述性名词
interface SessionProfile { /* ... */ }
interface TabSessionEntry { /* ... */ }
interface CookieSnapshot { /* ... */ }
interface SyncConfig { /* ... */ }
interface ConflictEntry { /* ... */ }

// 消息接口 - VerbNounMessage
interface CreateSessionMessage { /* ... */ }
interface SwitchSessionMessage { /* ... */ }
interface GetCookieDiffMessage { /* ... */ }
```

### 枚举

```typescript
// 枚举名 PascalCase，成员 SCREAMING_SNAKE_CASE
enum MessageType {
  CREATE_SESSION = 'CREATE_SESSION',
  SWITCH_SESSION = 'SWITCH_SESSION',
  GET_COOKIE_DIFF = 'GET_COOKIE_DIFF',
  // ...
}
```

---

## 文件组织原则

### 目录结构

```
src/
├── background/           # Service Worker 模块 (11 个文件)
│   ├── session-manager.ts
│   ├── cookie-engine.ts
│   ├── cookie-store.ts
│   ├── storage-store.ts
│   ├── tab-tracker.ts
│   ├── dnr-manager.ts
│   ├── messaging.ts
│   ├── badge-manager.ts
│   ├── context-menu.ts
│   ├── auto-refresh.ts
│   └── drive-sync.ts
├── content/              # 内容脚本 (3 个文件)
├── popup/                # 弹窗 UI
│   ├── App.svelte
│   └── components/       # 弹窗专用组件
├── options/              # 选项页 UI
│   ├── App.svelte
│   └── components/       # 选项页专用组件
└── shared/               # 跨上下文共享代码
    ├── types.ts
    ├── api.ts
    ├── constants.ts
    ├── logger.ts
    ├── theme.css
    ├── theme-store.ts
    ├── settings-store.ts
    ├── security-store.ts
    ├── crypto-utils.ts
    ├── auth-check.ts
    ├── components/       # 共享 Svelte 组件 (9 个文件)
    ├── i18n/             # 国际化 (en, zh, de, ja)
    ├── sync/             # Google Drive 同步子系统
    └── webdav/           # WebDAV 备份子系统
```

### 设计原则

- **单一职责** - 每个 background 模块负责一个领域
- **高内聚低耦合** - 共享模块通过路径别名导入
- **测试目录镜像** - `tests/` 完全镜像 `src/` 结构

---

## 导入/导出模式

### 路径别名

```typescript
// tsconfig.json 和 vite.config.ts 配置
"@shared/*": ["src/shared/*"]
"@background/*": ["src/background/*"]
"@content/*": ["src/content/*"]
```

### 分离值导入和类型导入

```typescript
// 值导入
import { MessageType } from '@shared/types'
import { STORAGE_KEYS } from '@shared/constants'

// 类型导入
import type { Message, SessionProfile, MessageResponse } from '@shared/types'
```

### 仅命名导出

```typescript
// ✅ 正确：命名导出
export function createSession(name: string): SessionProfile { /* ... */ }
export type { SessionProfile, Message }

// ❌ 错误：无默认导出
export default class SessionManager { /* ... */ }
```

### 无 Barrel 文件

```typescript
// ✅ 正确：直接导入路径
import { createSession } from '@background/session-manager'
import { MessageType } from '@shared/types'

// ❌ 错误：通过 index.ts barrel 导入
import { createSession, MessageType } from '@background'
```

### 模块初始化模式

```typescript
// theme-store.ts
let initialized = false

export function initTheme(): Promise<void> {
  if (initialized) return Promise.resolve()
  // 初始化逻辑...
  initialized = true
  return Promise.resolve()
}

// 仅用于测试
export function resetThemeInit(): void {
  initialized = false
}
```

---

## 注释风格

### 节分隔符

```typescript
// -- Session Profile --
export interface SessionProfile { /* ... */ }

// -- Extension Settings --
export interface ExtensionSettings { /* ... */ }

// -- Messaging --
export enum MessageType { /* ... */ }

// -- Response Wrapper --
export interface MessageResponse<T> { /* ... */ }
```

### JSDoc 注释

仅用于复杂类型和非显而易见的行为：

```typescript
/**
 * Cookie 隔离模式
 * - `soft`: 跳过无目标数据的域名的 cookie 清除/恢复，保留无关服务
 * - `strict`: 即使无目标数据也始终清除 cookie，实现完全隔离
 */
export type IsolationMode = 'soft' | 'strict'

/**
 * 获取指定源的所有 cookie（包括父域 cookie）
 * 通过域层级遍历实现跨子域 cookie 收集
 */
export async function getCookiesForOrigin(origin: string): Promise<chrome.cookies.Cookie[]> {
  // ...
}
```

### 内联注释

解释"为什么"而非"是什么"：

```typescript
// Soft mode pass-through for ${origin} -- no target data, skipping cookies
// Chrome separates normal ("0") and incognito ("1") cookie stores
// Require at least 30% match to avoid false positives
```

### 无注释情况

- 简单 getter/setter
- 简单数据访问
- 显而易见的类型收窄

---

## 状态管理模式

### 后台 (Service Worker)

使用**模块级内存状态**，由 `chrome.storage.local` 支持：

```typescript
// session-manager.ts
const sessions = new Map<string, SessionProfile>()
let hydrated = false

async function ensureHydrated(): Promise<void> {
  if (hydrated) return
  const stored = await chrome.storage.local.get(STORAGE_KEYS.SESSIONS)
  // 水合逻辑...
  hydrated = true
}

export async function hydrateSessions(): Promise<void> {
  await ensureHydrated()
}

export async function persistSessions(): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.SESSIONS]: Object.fromEntries(sessions)
  })
}
```

### 延迟水合模式

```typescript
// 所有后台模块使用 ensureHydrated() 懒加载守卫
export async function getSession(id: string): Promise<SessionProfile | null> {
  await ensureHydrated()
  return sessions.get(id) ?? null
}
```

### 服务启动序列

```typescript
// background/index.ts
async function hydrateState(): Promise<void> {
  await Promise.all([
    initSettings(),
    initSyncStore(),
    initWebDavStore(),
    hydrateSessions(),
    hydrateTabMap()
  ])
}

const hydrationPromise = hydrateState()

// 延迟同步模块初始化直到水合完成
hydrationPromise.then(() => {
  initDriveSync()
  initAutoRefresh()
})
```

### Popup/Options UI

使用 **Svelte 5 runes** 实现响应式状态：

```typescript
// 可变状态
let sessions = $state<SessionProfile[]>([])
let loading = $state(true)

// 计算值
const sortedSessions = $derived(
  [...sessions].sort((a, b) => a.name.localeCompare(b.name))
)

// 副作用和生命周期管理
$effect(() => {
  const unsubscribe = onSessionsChange((newSessions) => {
    sessions = newSessions
  })
  return unsubscribe // 清理函数
})

// 组件 Props
interface Props {
  session: SessionProfile
  onSelect: (id: string) => void
}
const { session, onSelect }: Props = $props()
```

### 跨上下文同步

UI 组件监听 `chrome.storage.onChanged` 事件并防抖更新：

```typescript
$effect(() => {
  const handleStorageChange = (changes: chrome.storage.StorageChangeMap) => {
    if (changes[STORAGE_KEYS.SESSIONS]) {
      // 50ms 防抖合并快速连续写入
      setTimeout(() => {
        sessions = parseSessions(changes[STORAGE_KEYS.SESSIONS].newValue)
      }, 50)
    }
  }

  chrome.storage.onChanged.addListener(handleStorageChange)
  return () => chrome.storage.onChanged.removeListener(handleStorageChange)
})
```

### 发布/订阅监听器

```typescript
// settings-store.ts
type SettingsListener = (settings: ExtensionSettings) => void
const listeners = new Set<SettingsListener>()

export function onSettingsChange(callback: SettingsListener): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback) // 返回取消订阅函数
}

function notifyListeners(settings: ExtensionSettings): void {
  for (const listener of listeners) {
    listener(settings)
  }
}
```

---

## 错误处理模式

### Try-catch 类型收窄

```typescript
try {
  await riskyOperation()
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  console.error('Operation failed:', message)
  throw new Error(`User-friendly message: ${message}`)
}
```

### 一致的错误传播

```typescript
// 后台消息处理器
async function handleCreateSession(msg: CreateSessionMessage): Promise<MessageResponse<SessionProfile>> {
  try {
    const session = await sessionManager.create(msg.name)
    return { success: true, data: session }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

// api.ts 中的 sendMessage 抛出响应错误
export async function sendMessage<T>(message: Message): Promise<T> {
  const response = await chrome.runtime.sendMessage(message)
  if (!response.success) {
    throw new Error(response.error)
  }
  return response.data
}
```

### Service Worker 唤醒重试

```typescript
// api.ts
export async function sendMessage<T>(message: Message): Promise<T> {
  try {
    return await attemptSend(message)
  } catch (err) {
    // 捕获连接错误并重试一次
    if (err instanceof Error && isConnectionError(err.message)) {
      await delay(200)
      return await attemptSend(message)
    }
    throw err
  }
}

function isConnectionError(message: string): boolean {
  return message.includes('Receiving end does not exist') ||
         message.includes('message port closed')
}
```

### 静默错误吞没（非关键操作）

```typescript
// updateSessionsQuietly() - UI 保持当前数据如果后台刷新失败
export async function updateSessionsQuietly(): Promise<void> {
  try {
    sessions = await sessionManager.getAll()
  } catch {
    // 静默失败，UI 保持当前数据
  }
}
```

### 恢复失败环形缓冲区

```typescript
// cookie-engine.ts
const MAX_RESTORE_FAILURES = 200
const restoreFailures: RestoreFailureEntry[] = []

export function recordRestoreFailure(entry: RestoreFailureEntry): void {
  restoreFailures.push(entry)
  if (restoreFailures.length > MAX_RESTORE_FAILURES) {
    restoreFailures.shift() // 移除最旧的条目
  }
}

export function getRestoreFailures(): RestoreFailureEntry[] {
  return [...restoreFailures]
}
```

### 超时包装器

```typescript
// content script 消息超时
function withTimeout<T>(promise: Promise<T>, ms: number = 5000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), ms)
    )
  ])
}
```

### Promise.allSettled 处理部分失败

```typescript
// Cookie 恢复和自动刷新使用 Promise.allSettled()
const results = await Promise.allSettled(
  tabs.map(tab => restoreTabSession(tab.id, sessionId))
)

const failures = results
  .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  .map(r => r.reason)

if (failures.length > 0) {
  console.warn(`${failures.length} tab(s) failed to restore:`, failures)
}
```

---

## 异步处理模式

### async/await 主导

```typescript
// ✅ 推荐：async/await
async function loadSession(id: string): Promise<SessionProfile> {
  await ensureHydrated()
  const session = sessions.get(id)
  if (!session) throw new Error('Session not found')
  return session
}

// ❌ 避免：原始 Promise 链
function loadSession(id: string): Promise<SessionProfile> {
  return ensureHydrated()
    .then(() => {
      const session = sessions.get(id)
      if (!session) throw new Error('Session not found')
      return session
    })
}
```

### Promise.all 并行独立操作

```typescript
// 并行水合
await Promise.all([hydrateSessions(), hydrateTabMap()])

// 并行保存
await Promise.all([saveCookies(origin, sessionId), saveTabStorage(origin, sessionId)])

// 并行获取
const [cookies, storage] = await Promise.all([
  cookieStore.getAllSnapshotsForSession(sessionId),
  storageStore.getAllSnapshotsForSession(sessionId)
])
```

### 每标签互斥锁

```typescript
// cookie-engine.ts - 序列化同一标签上的并发切换操作
const switchLocks = new Map<number, Promise<void>>()

export async function switchSession(tabId: number, sessionId: string): Promise<void> {
  const previousLock = switchLocks.get(tabId) ?? Promise.resolve()

  const currentLock = previousLock
    .catch(() => {}) // 不因先前失败而中止
    .then(() => doSwitchSession(tabId, sessionId))

  switchLocks.set(tabId, currentLock)

  try {
    await currentLock
  } finally {
    // 如果这是当前锁，则清除
    if (switchLocks.get(tabId) === currentLock) {
      switchLocks.delete(tabId)
    }
  }
}
```

### 防抖异步更新

```typescript
// 存储变更监听器使用 setTimeout 防抖
let debounceTimer: ReturnType<typeof setTimeout> | null = null

chrome.storage.onChanged.addListener((changes) => {
  if (changes[STORAGE_KEYS.SESSIONS]) {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      hydrateSessions() // 50ms 后触发异步数据重载
    }, 50)
  }
})
```

### 延迟水合

```typescript
// 使用记忆化 Promise 避免冗余水合
let hydrationPromise: Promise<void> | null = null

function ensureHydrated(): Promise<void> {
  if (!hydrationPromise) {
    hydrationPromise = doHydrate()
  }
  return hydrationPromise
}
```

### 初始化序列

```typescript
// 服务 Worker 使用 hydrationPromise.then(...) 延迟同步模块初始化
const hydrationPromise = hydrateState()

// 立即可用：消息处理器和标签跟踪
chrome.runtime.onMessage.addListener(handleMessage)
chrome.tabs.onRemoved.addListener(handleTabRemoved)

// 延迟直到水合完成
hydrationPromise.then(() => {
  initDriveSync()
  initAutoRefresh()
})
```

---

## CSS/样式组织

### 设计令牌系统

在 `src/shared/theme.css` 中定义完整的令牌系统：

```css
:root {
  /* 颜色 */
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f5f5f5;
  --color-text-primary: #1a1a1a;
  --color-text-secondary: #666666;
  --color-border: #e0e0e0;
  --color-accent: #4a90d9;
  --color-error: #e74c3c;
  --color-success: #2ecc71;
  --color-warning: #f39c12;

  /* 间距 */
  --space-0: 0px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-7: 32px;
  --space-8: 40px;
  --space-9: 48px;

  /* 排版 */
  --text-2xs: 0.625rem;
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;

  /* 效果 */
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;

  /* 过渡 */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
  --transition-smooth: 350ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

### 暗色主题

```css
[data-theme="dark"] {
  --color-bg-primary: #1a1a1a;
  --color-bg-secondary: #2d2d2d;
  --color-text-primary: #f0f0f0;
  --color-text-secondary: #a0a0a0;
  --color-border: #404040;
  /* ... */
}

/* 无显式主题时的媒体查询回退 */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --color-bg-primary: #1a1a1a;
    /* ... */
  }
}
```

### 无障碍特性

```css
/* 减少动画 */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

/* 高对比度模式 */
@media (prefers-contrast: more) {
  :root {
    --color-border: #000000;
    --color-text-primary: #000000;
  }
}

/* 焦点环 */
*:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

### Svelte 作用域样式

```svelte
<!-- 每个 .svelte 文件的 <style> 块自动作用域 -->
<style>
  .session-item {
    padding: var(--space-3);
    background: var(--color-bg-primary);
    border-radius: var(--radius-md);
  }
</style>

<!-- 动态样式通过 CSS 自定义属性 -->
<div
  class="session-item"
  style="--session-color: {session.color}"
>
  <!-- ... -->
</div>

<style>
  .session-item {
    border-left: 3px solid var(--session-color);
  }
</style>
```

---

## 测试编写习惯

### 测试框架配置

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
})
```

### Chrome API Mock

```typescript
// tests/setup.ts
function createChromeMock() {
  const storage = new Map<string, any>()

  return {
    storage: {
      local: {
        get: vi.fn((keys) => Promise.resolve(/* ... */)),
        set: vi.fn((items) => Promise.resolve()),
        // ...
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    runtime: {
      sendMessage: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      // ...
    },
    // ... 完整的 chrome API mock
  }
}

globalThis.chrome = createChromeMock()
```

### 测试结构

```typescript
// tests/background/session-manager.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { sessionManager } from '@background/session-manager'
import { resetChromeMocks } from '../setup'

describe('SessionManager', () => {
  beforeEach(() => {
    resetChromeMocks()
  })

  describe('createSession', () => {
    it('should create a new session with valid name', async () => {
      const session = await sessionManager.create('Test Session')
      expect(session).toMatchObject({
        name: 'Test Session',
        color: expect.any(String),
        id: expect.any(String),
      })
    })

    it('should throw when name is empty', async () => {
      await expect(sessionManager.create('')).rejects.toThrow('Name is required')
    })
  })

  describe('updateSession', () => {
    it('should update session name', async () => {
      const session = await sessionManager.create('Original')
      const updated = await sessionManager.update(session.id, { name: 'Updated' })
      expect(updated.name).toBe('Updated')
    })

    // 回归测试显式标记
    it('rejects empty name in updateSession (regression: name validation)', async () => {
      const session = await sessionManager.create('Valid')
      await expect(
        sessionManager.update(session.id, { name: '' })
      ).rejects.toThrow('Name cannot be empty')
    })
  })
})
```

### 测试模式

- `beforeEach` 调用 `resetChromeMocks()` 和水合函数
- 使用 `describe`/`it` 块，描述性名称
- API 测试 mock `chrome.runtime.sendMessage` 控制响应
- 后台测试使用 `sendTestMessage()` 直接调用消息处理器
- 覆盖正常路径和错误情况
- `fake-indexeddb` 用于 IndexedDB 依赖测试

### 测试覆盖范围

- 30 个测试文件覆盖 TypeScript 逻辑
- 无 Svelte 组件测试（可选但推荐）
- 测试目录完全镜像 `src/` 结构

---

## 关键设计模式

### 1. 模块初始化模式

每个 store 模块暴露 `init*()` 和 `reset*Init()` 函数：

```typescript
// theme-store.ts
let initialized = false

export function initTheme(): Promise<void> {
  if (initialized) return Promise.resolve()
  // 从 chrome.storage 加载主题偏好
  // 设置监听器
  initialized = true
  return Promise.resolve()
}

// 仅用于测试重置
export function resetThemeInit(): void {
  initialized = false
}
```

### 2. 延迟水合模式

后台模块使用 `ensureHydrated()` 懒加载守卫：

```typescript
let hydrated = false
let hydrationPromise: Promise<void> | null = null

async function ensureHydrated(): Promise<void> {
  if (hydrated) return
  if (!hydrationPromise) {
    hydrationPromise = doHydrate()
  }
  await hydrationPromise
}

async function doHydrate(): Promise<void> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.SESSIONS)
  // 解析并填充 Map
  hydrated = true
}
```

### 3. 判别联合消息

40+ 消息接口通过 `MessageType` 枚举区分：

```typescript
enum MessageType {
  CREATE_SESSION = 'CREATE_SESSION',
  SWITCH_SESSION = 'SWITCH_SESSION',
  GET_SESSION_STATS = 'GET_SESSION_STATS',
  // ...
}

type Message =
  | { type: MessageType.CREATE_SESSION; name: string }
  | { type: MessageType.SWITCH_SESSION; sessionId: string; tabId: number }
  | { type: MessageType.GET_SESSION_STATS; sessionId: string }
  | // ...

// 消息路由器
function handleMessage(message: Message, sender: chrome.runtime.MessageSender): Promise<MessageResponse<any>> {
  switch (message.type) {
    case MessageType.CREATE_SESSION:
      return handleCreateSession(message)
    case MessageType.SWITCH_SESSION:
      return handleSwitchSession(message)
    // ...
  }
}
```

### 4. 发布/订阅监听器

`on*Change()` 返回取消订阅函数：

```typescript
type Listener<T> = (value: T) => void

class Store<T> {
  private listeners = new Set<Listener<T>>()

  subscribe(callback: Listener<T>): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  protected notify(value: T): void {
    for (const listener of this.listeners) {
      listener(value)
    }
  }
}
```

### 5. 每标签互斥锁

`switchLocks` Map 序列化并发切换操作：

```typescript
const switchLocks = new Map<number, Promise<void>>()

export async function switchSession(tabId: number, sessionId: string): Promise<void> {
  const previous = switchLocks.get(tabId) ?? Promise.resolve()

  const current = previous
    .catch(() => {})
    .then(() => performSwitch(tabId, sessionId))

  switchLocks.set(tabId, current)
  await current
}
```

### 6. 环形缓冲区

恢复失败记录存储最近 200 条错误：

```typescript
class RingBuffer<T> {
  private buffer: T[] = []
  private maxSize: number

  constructor(maxSize: number) {
    this.maxSize = maxSize
  }

  push(item: T): void {
    this.buffer.push(item)
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift()
    }
  }

  getAll(): T[] {
    return [...this.buffer]
  }
}

const restoreFailures = new RingBuffer<RestoreFailureEntry>(200)
```

### 7. 超时包装器

内容脚本消息超时处理：

```typescript
function withTimeout<T>(promise: Promise<T>, ms: number = 5000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
    )
  ])
}

// 使用示例
const response = await withTimeout(
  chrome.tabs.sendMessage(tabId, message),
  5000
)
```

---

## 附录：快速参考

### 导入模板

```typescript
// 值导入
import { MessageType } from '@shared/types'
import { STORAGE_KEYS, MESSAGE_TIMEOUT_MS } from '@shared/constants'
import { logger } from '@shared/logger'

// 类型导入
import type {
  Message,
  SessionProfile,
  MessageResponse,
  ExtensionSettings
} from '@shared/types'
```

### 新文件模板

```typescript
// src/background/new-module.ts

// -- Types --
interface NewModuleState {
  // ...
}

// -- Constants --
const MODULE_KEY = 'new-module' as const

// -- State --
let state: NewModuleState = getDefaultState()
let hydrated = false

// -- Initialization --
async function ensureHydrated(): Promise<void> {
  if (hydrated) return
  // 水合逻辑
  hydrated = true
}

export async function initNewModule(): Promise<void> {
  await ensureHydrated()
  // 初始化逻辑
}

// -- Public API --
export async function getData(): Promise<NewModuleState> {
  await ensureHydrated()
  return { ...state }
}

export async function setData(data: Partial<NewModuleState>): Promise<void> {
  await ensureHydrated()
  state = { ...state, ...data }
  await persistState()
}

// -- Internal --
async function persistState(): Promise<void> {
  await chrome.storage.local.set({ [MODULE_KEY]: state })
}

// -- Test Helpers --
export function resetNewModuleInit(): void {
  hydrated = false
  state = getDefaultState()
}
```

### 测试文件模板

```typescript
// tests/background/new-module.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initNewModule, getData, setData, resetNewModuleInit } from '@background/new-module'
import { resetChromeMocks } from '../setup'

describe('NewModule', () => {
  beforeEach(async () => {
    resetChromeMocks()
    resetNewModuleInit()
    await initNewModule()
  })

  describe('getData', () => {
    it('should return default state when empty', async () => {
      const data = await getData()
      expect(data).toEqual(expect.objectContaining({
        // 默认状态
      }))
    })
  })

  describe('setData', () => {
    it('should update state', async () => {
      await setData({ key: 'value' })
      const data = await getData()
      expect(data.key).toBe('value')
    })

    it('should persist to storage', async () => {
      await setData({ key: 'value' })
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({ 'new-module': expect.any(Object) })
      )
    })
  })
})
```
