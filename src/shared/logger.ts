import type { LogEntry, LogLevel } from '@shared/types';
import {
  LOG_BUFFER_MAX_SIZE,
  LOG_PERSIST_DEBOUNCE_MS,
  LOG_PERSIST_MAX_SIZE,
  STORAGE_KEYS,
} from '@shared/constants';

const LOG_PREFIX = '[Unaware Sessions]';

/**
 * Numeric priority for each log level.
 * Higher value = more verbose. A message is recorded when its priority
 * is <= the current setting's priority.
 */
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  off: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

// ── State ────────────────────────────────────────────────────────

let currentLevel: LogLevel = 'off';
const buffer: LogEntry[] = [];

// ── Level management ─────────────────────────────────────────────

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

/**
 * Errors are recorded regardless of the configured level.
 *
 * The level exists to control log *volume*, but the events worth keeping —
 * a failed snapshot write, an evicted database, a destructive replace — are
 * exactly the ones that happen while nobody is watching. With the default
 * 'off' level, dropping them left no trace of how a data loss occurred.
 * Console mirroring still respects the level, so 'off' stays quiet.
 */
function shouldLog(level: LogEntry['level']): boolean {
  return level === 'error' || LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[currentLevel];
}

function shouldMirrorToConsole(level: LogEntry['level']): boolean {
  return LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[currentLevel];
}

// ── Serialization ────────────────────────────────────────────────

/**
 * Make `data` safe for JSON round-trips.
 * Error objects have non-enumerable properties (`message`, `stack`),
 * so `JSON.stringify(new Error("x"))` produces `"{}"`. Extract them
 * into a plain object so they survive serialization to the log buffer
 * and export files.
 */
function serializeData(data: unknown): unknown {
  if (data instanceof Error) {
    return {
      name: data.name,
      message: data.message,
      ...(data.stack ? { stack: data.stack } : {}),
    };
  }
  return data;
}

// ── Persistence ──────────────────────────────────────────────────
//
// Only the service worker enables persistence: it is the single writer, so a
// content script or page cannot clobber the shared buffer with its own view.

let persistenceEnabled = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Load the persisted tail into the in-memory buffer and mirror future writes
 * back to it. Called once per service worker start.
 */
export async function enableLogPersistence(): Promise<void> {
  persistenceEnabled = true;
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.LOG_BUFFER);
    const stored = result[STORAGE_KEYS.LOG_BUFFER] as LogEntry[] | undefined;
    if (stored?.length) {
      // Prepend: entries written while this load was in flight are newer.
      buffer.unshift(...stored);
      trimBuffer();
    }
  } catch (err) {
    // Never route this through write() — a failing storage area would recurse.
    console.warn(`${LOG_PREFIX}[logger] Failed to load persisted logs`, err);
  }
}

function trimBuffer(): void {
  if (buffer.length > LOG_BUFFER_MAX_SIZE) {
    buffer.splice(0, buffer.length - LOG_BUFFER_MAX_SIZE);
  }
}

async function flush(): Promise<void> {
  flushTimer = null;
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.LOG_BUFFER]: buffer.slice(-LOG_PERSIST_MAX_SIZE),
    });
  } catch (err) {
    console.warn(`${LOG_PREFIX}[logger] Failed to persist logs`, err);
  }
}

/**
 * Errors flush immediately — the service worker may be seconds from being
 * torn down, and an error is precisely what must survive that. Everything
 * else is debounced so ordinary debug traffic costs one write per burst.
 */
function schedulePersist(level: LogEntry['level']): void {
  if (!persistenceEnabled) return;

  if (level === 'error') {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    void flush();
    return;
  }

  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    void flush();
  }, LOG_PERSIST_DEBOUNCE_MS);
}

// ── Core write ───────────────────────────────────────────────────

function write(level: LogEntry['level'], source: string, message: string, data?: unknown): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: Date.now(),
    level,
    source,
    message,
    ...(data !== undefined ? { data: serializeData(data) } : {}),
  };

  buffer.push(entry);
  trimBuffer();
  schedulePersist(level);

  if (!shouldMirrorToConsole(level)) return;

  // Mirror to devtools console for live debugging
  const tag = `${LOG_PREFIX}[${source}]`;
  switch (level) {
    case 'error':
      if (data !== undefined) console.error(tag, message, data);
      else console.error(tag, message);
      break;
    case 'warn':
      if (data !== undefined) console.warn(tag, message, data);
      else console.warn(tag, message);
      break;
    case 'info':
      if (data !== undefined) console.info(tag, message, data);
      else console.info(tag, message);
      break;
    case 'debug':
      if (data !== undefined) console.debug(tag, message, data);
      else console.debug(tag, message);
      break;
  }
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Create a scoped logger for a specific module.
 * Usage: `const log = createLogger('cookie-engine');`
 */
export function createLogger(source: string) {
  return {
    error: (message: string, data?: unknown) => write('error', source, message, data),
    warn: (message: string, data?: unknown) => write('warn', source, message, data),
    info: (message: string, data?: unknown) => write('info', source, message, data),
    debug: (message: string, data?: unknown) => write('debug', source, message, data),
  };
}

// ── Buffer access ────────────────────────────────────────────────

export function getLogs(): LogEntry[] {
  return [...buffer];
}

export function clearLogs(): void {
  buffer.length = 0;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (persistenceEnabled) {
    void flush();
  }
}

/** Reset persistence state — for tests only. */
export function resetLogPersistence(): void {
  persistenceEnabled = false;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}
