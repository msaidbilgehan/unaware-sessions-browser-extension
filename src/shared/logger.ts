import type { LogEntry, LogLevel } from '@shared/types';
import { LOG_BUFFER_MAX_SIZE } from '@shared/constants';

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

function shouldLog(level: LogEntry['level']): boolean {
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
  if (buffer.length > LOG_BUFFER_MAX_SIZE) {
    buffer.splice(0, buffer.length - LOG_BUFFER_MAX_SIZE);
  }

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
}
