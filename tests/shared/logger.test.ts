import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createLogger,
  setLogLevel,
  getLogLevel,
  getLogs,
  clearLogs,
} from '@shared/logger';

beforeEach(() => {
  clearLogs();
  setLogLevel('off');
});

describe('logger', () => {
  describe('setLogLevel / getLogLevel', () => {
    it('defaults to off', () => {
      expect(getLogLevel()).toBe('off');
    });

    it('sets and returns the new level', () => {
      setLogLevel('debug');
      expect(getLogLevel()).toBe('debug');
    });
  });

  describe('createLogger', () => {
    it('creates a logger with error, warn, info, debug methods', () => {
      const log = createLogger('test');
      expect(typeof log.error).toBe('function');
      expect(typeof log.warn).toBe('function');
      expect(typeof log.info).toBe('function');
      expect(typeof log.debug).toBe('function');
    });
  });

  describe('level filtering', () => {
    it('does not log when level is off', () => {
      setLogLevel('off');
      const log = createLogger('test');
      log.error('should not appear');
      expect(getLogs()).toHaveLength(0);
    });

    it('logs error when level is error', () => {
      setLogLevel('error');
      const log = createLogger('test');
      log.error('err msg');
      log.warn('warn msg');
      log.info('info msg');
      log.debug('debug msg');

      const logs = getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].level).toBe('error');
    });

    it('logs error and warn when level is warn', () => {
      setLogLevel('warn');
      const log = createLogger('test');
      log.error('err');
      log.warn('wrn');
      log.info('inf');
      log.debug('dbg');

      const logs = getLogs();
      expect(logs).toHaveLength(2);
      expect(logs.map((l) => l.level)).toEqual(['error', 'warn']);
    });

    it('logs error, warn, info when level is info', () => {
      setLogLevel('info');
      const log = createLogger('test');
      log.error('e');
      log.warn('w');
      log.info('i');
      log.debug('d');

      const logs = getLogs();
      expect(logs).toHaveLength(3);
      expect(logs.map((l) => l.level)).toEqual(['error', 'warn', 'info']);
    });

    it('logs all levels when level is debug', () => {
      setLogLevel('debug');
      const log = createLogger('test');
      log.error('e');
      log.warn('w');
      log.info('i');
      log.debug('d');

      expect(getLogs()).toHaveLength(4);
    });
  });

  describe('log entry structure', () => {
    it('records timestamp, level, source, and message', () => {
      setLogLevel('debug');
      const log = createLogger('my-module');
      const before = Date.now();
      log.info('hello');
      const after = Date.now();

      const entry = getLogs()[0];
      expect(entry.level).toBe('info');
      expect(entry.source).toBe('my-module');
      expect(entry.message).toBe('hello');
      expect(entry.timestamp).toBeGreaterThanOrEqual(before);
      expect(entry.timestamp).toBeLessThanOrEqual(after);
      expect(entry.data).toBeUndefined();
    });

    it('includes data when provided', () => {
      setLogLevel('debug');
      const log = createLogger('test');
      log.debug('with data', { key: 'value' });

      expect(getLogs()[0].data).toEqual({ key: 'value' });
    });

    it('serializes Error objects into plain objects', () => {
      setLogLevel('error');
      const log = createLogger('test');
      const err = new Error('test error');
      log.error('failed', err);

      const data = getLogs()[0].data as Record<string, unknown>;
      expect(data.name).toBe('Error');
      expect(data.message).toBe('test error');
      expect(typeof data.stack).toBe('string');
    });

    it('serializes Error without stack gracefully', () => {
      setLogLevel('error');
      const log = createLogger('test');
      const err = new Error('no stack');
      delete err.stack;
      log.error('failed', err);

      const data = getLogs()[0].data as Record<string, unknown>;
      expect(data.name).toBe('Error');
      expect(data.message).toBe('no stack');
      expect(data.stack).toBeUndefined();
    });
  });

  describe('buffer management', () => {
    it('getLogs returns a copy of the buffer', () => {
      setLogLevel('debug');
      const log = createLogger('test');
      log.debug('a');

      const logs1 = getLogs();
      const logs2 = getLogs();
      expect(logs1).not.toBe(logs2);
      expect(logs1).toEqual(logs2);
    });

    it('clearLogs empties the buffer', () => {
      setLogLevel('debug');
      const log = createLogger('test');
      log.debug('a');
      log.debug('b');
      expect(getLogs()).toHaveLength(2);

      clearLogs();
      expect(getLogs()).toHaveLength(0);
    });

    it('trims buffer when exceeding max size', () => {
      setLogLevel('debug');
      const log = createLogger('test');
      // LOG_BUFFER_MAX_SIZE is 2000 — write 2005 entries
      for (let i = 0; i < 2005; i++) {
        log.debug(`msg-${i}`);
      }

      const logs = getLogs();
      expect(logs.length).toBeLessThanOrEqual(2000);
      // Oldest entries should be trimmed, newest kept
      expect(logs[logs.length - 1].message).toBe('msg-2004');
    });
  });

  describe('console mirroring', () => {
    it('mirrors error to console.error', () => {
      setLogLevel('error');
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const log = createLogger('test');
      log.error('boom');
      expect(spy).toHaveBeenCalledWith('[Unaware Sessions][test]', 'boom');
      spy.mockRestore();
    });

    it('mirrors warn to console.warn', () => {
      setLogLevel('warn');
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const log = createLogger('test');
      log.warn('caution');
      expect(spy).toHaveBeenCalledWith('[Unaware Sessions][test]', 'caution');
      spy.mockRestore();
    });

    it('mirrors info to console.info', () => {
      setLogLevel('info');
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const log = createLogger('test');
      log.info('note');
      expect(spy).toHaveBeenCalledWith('[Unaware Sessions][test]', 'note');
      spy.mockRestore();
    });

    it('mirrors debug to console.debug', () => {
      setLogLevel('debug');
      const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const log = createLogger('test');
      log.debug('trace');
      expect(spy).toHaveBeenCalledWith('[Unaware Sessions][test]', 'trace');
      spy.mockRestore();
    });

    it('passes data to console when provided', () => {
      setLogLevel('error');
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const log = createLogger('test');
      const extra = { code: 42 };
      log.error('failed', extra);
      expect(spy).toHaveBeenCalledWith('[Unaware Sessions][test]', 'failed', extra);
      spy.mockRestore();
    });
  });
});
