import { STORAGE_KEYS, DEFAULT_EXTENSION_SETTINGS } from '@shared/constants';
import type { ExtensionSettings, AutoRefreshInterval, IsolationMode } from '@shared/types';

let currentSettings: ExtensionSettings = { ...DEFAULT_EXTENSION_SETTINGS };
const settingsListeners: Array<(settings: ExtensionSettings) => void> = [];

// Per-domain auto-refresh state: key = "sessionId:origin", value = enabled
let domainRefreshMap: Record<string, boolean> = {};
const domainListeners: Array<(map: Record<string, boolean>) => void> = [];

// Per-domain isolation mode: key = domain (e.g., "google.com"), value = 'soft' | 'strict'
let domainIsolationMap: Record<string, IsolationMode> = {};
const isolationListeners: Array<(map: Record<string, IsolationMode>) => void> = [];

// ── Getters ─────────────────────────────────────────────────────

export function getSettings(): ExtensionSettings {
  return currentSettings;
}

export function getAutoRefreshInterval(): AutoRefreshInterval {
  return currentSettings.autoRefreshInterval;
}

export function getAutoRefreshDefaultEnabled(): boolean {
  return currentSettings.autoRefreshDefaultEnabled;
}

export function getDomainRefreshMap(): Record<string, boolean> {
  return domainRefreshMap;
}

export function isDomainAutoRefreshEnabled(sessionId: string, origin: string): boolean {
  const key = `${sessionId}:${origin}`;
  return domainRefreshMap[key] ?? currentSettings.autoRefreshDefaultEnabled;
}

export function getIsolationModeDefault(): IsolationMode {
  return currentSettings.isolationModeDefault;
}

export function getDomainIsolationMap(): Record<string, IsolationMode> {
  return domainIsolationMap;
}

export function getDomainIsolationMode(domain: string): IsolationMode {
  return domainIsolationMap[domain] ?? currentSettings.isolationModeDefault;
}

// ── Settings Listeners ──────────────────────────────────────────

export function onSettingsChange(listener: (settings: ExtensionSettings) => void): () => void {
  settingsListeners.push(listener);
  return () => {
    const index = settingsListeners.indexOf(listener);
    if (index >= 0) settingsListeners.splice(index, 1);
  };
}

function notifySettingsListeners(): void {
  for (const listener of settingsListeners) {
    listener(currentSettings);
  }
}

// ── Domain Listeners ────────────────────────────────────────────

export function onDomainRefreshChange(
  listener: (map: Record<string, boolean>) => void,
): () => void {
  domainListeners.push(listener);
  return () => {
    const index = domainListeners.indexOf(listener);
    if (index >= 0) domainListeners.splice(index, 1);
  };
}

function notifyDomainListeners(): void {
  for (const listener of domainListeners) {
    listener(domainRefreshMap);
  }
}

// ── Isolation Listeners ────────────────────────────────────────

export function onDomainIsolationChange(
  listener: (map: Record<string, IsolationMode>) => void,
): () => void {
  isolationListeners.push(listener);
  return () => {
    const index = isolationListeners.indexOf(listener);
    if (index >= 0) isolationListeners.splice(index, 1);
  };
}

function notifyIsolationListeners(): void {
  for (const listener of isolationListeners) {
    listener(domainIsolationMap);
  }
}

// ── Settings Setters ────────────────────────────────────────────

export async function setAutoRefreshInterval(interval: AutoRefreshInterval): Promise<void> {
  currentSettings = { ...currentSettings, autoRefreshInterval: interval };
  await chrome.storage.local.set({
    [STORAGE_KEYS.EXTENSION_SETTINGS]: currentSettings,
  });
  notifySettingsListeners();
}

export async function setAutoRefreshDefaultEnabled(enabled: boolean): Promise<void> {
  currentSettings = { ...currentSettings, autoRefreshDefaultEnabled: enabled };
  await chrome.storage.local.set({
    [STORAGE_KEYS.EXTENSION_SETTINGS]: currentSettings,
  });
  notifySettingsListeners();
}

// ── Domain Setters ──────────────────────────────────────────────

export async function setDomainAutoRefresh(
  sessionId: string,
  origin: string,
  enabled: boolean,
): Promise<void> {
  const key = `${sessionId}:${origin}`;
  domainRefreshMap = { ...domainRefreshMap, [key]: enabled };
  await chrome.storage.local.set({
    [STORAGE_KEYS.AUTO_REFRESH_DOMAINS]: domainRefreshMap,
  });
  notifyDomainListeners();
}

// ── Isolation Setters ───────────────────────────────────────────

export async function setIsolationModeDefault(mode: IsolationMode): Promise<void> {
  currentSettings = { ...currentSettings, isolationModeDefault: mode };
  await chrome.storage.local.set({
    [STORAGE_KEYS.EXTENSION_SETTINGS]: currentSettings,
  });
  notifySettingsListeners();
}

export async function setDomainIsolationMode(
  domain: string,
  mode: IsolationMode,
): Promise<void> {
  domainIsolationMap = { ...domainIsolationMap, [domain]: mode };
  await chrome.storage.local.set({
    [STORAGE_KEYS.DOMAIN_ISOLATION_MODES]: domainIsolationMap,
  });
  notifyIsolationListeners();
}

let settingsInitialized = false;

/** Reset init guard — for tests only. */
export function resetSettingsInit(): void {
  settingsInitialized = false;
  currentSettings = { ...DEFAULT_EXTENSION_SETTINGS };
  domainRefreshMap = {};
  domainIsolationMap = {};
}

// ── Initialization ──────────────────────────────────────────────

export async function initSettings(): Promise<void> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.EXTENSION_SETTINGS,
    STORAGE_KEYS.AUTO_REFRESH_DOMAINS,
    STORAGE_KEYS.DOMAIN_ISOLATION_MODES,
  ]);

  const storedSettings = result[STORAGE_KEYS.EXTENSION_SETTINGS] as ExtensionSettings | undefined;
  currentSettings = storedSettings
    ? { ...DEFAULT_EXTENSION_SETTINGS, ...storedSettings }
    : { ...DEFAULT_EXTENSION_SETTINGS };

  const storedDomains = result[STORAGE_KEYS.AUTO_REFRESH_DOMAINS] as
    | Record<string, boolean>
    | undefined;
  domainRefreshMap = storedDomains ?? {};

  const storedIsolation = result[STORAGE_KEYS.DOMAIN_ISOLATION_MODES] as
    | Record<string, IsolationMode>
    | undefined;
  domainIsolationMap = storedIsolation ?? {};

  notifySettingsListeners();
  notifyDomainListeners();
  notifyIsolationListeners();

  // Register storage sync listener only once
  if (settingsInitialized) return;
  settingsInitialized = true;

  // Keep in-memory state in sync when other contexts (popup, options) write to storage
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (STORAGE_KEYS.EXTENSION_SETTINGS in changes) {
      const updated = changes[STORAGE_KEYS.EXTENSION_SETTINGS].newValue as
        | ExtensionSettings
        | undefined;
      if (updated) {
        currentSettings = { ...DEFAULT_EXTENSION_SETTINGS, ...updated };
        notifySettingsListeners();
      }
    }

    if (STORAGE_KEYS.AUTO_REFRESH_DOMAINS in changes) {
      const updated = changes[STORAGE_KEYS.AUTO_REFRESH_DOMAINS].newValue as
        | Record<string, boolean>
        | undefined;
      domainRefreshMap = updated ?? {};
      notifyDomainListeners();
    }

    if (STORAGE_KEYS.DOMAIN_ISOLATION_MODES in changes) {
      const updated = changes[STORAGE_KEYS.DOMAIN_ISOLATION_MODES].newValue as
        | Record<string, IsolationMode>
        | undefined;
      domainIsolationMap = updated ?? {};
      notifyIsolationListeners();
    }
  });
}
