import { STORAGE_KEYS, DEFAULT_EXTENSION_SETTINGS } from '@shared/constants';
import type { ExtensionSettings, AutoRefreshInterval } from '@shared/types';

let currentSettings: ExtensionSettings = { ...DEFAULT_EXTENSION_SETTINGS };
const settingsListeners: Array<(settings: ExtensionSettings) => void> = [];

// Per-domain auto-refresh state: key = "sessionId:origin", value = enabled
let domainRefreshMap: Record<string, boolean> = {};
const domainListeners: Array<(map: Record<string, boolean>) => void> = [];

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

// ── Initialization ──────────────────────────────────────────────

export async function initSettings(): Promise<void> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.EXTENSION_SETTINGS,
    STORAGE_KEYS.AUTO_REFRESH_DOMAINS,
  ]);

  const storedSettings = result[STORAGE_KEYS.EXTENSION_SETTINGS] as ExtensionSettings | undefined;
  currentSettings = storedSettings
    ? { ...DEFAULT_EXTENSION_SETTINGS, ...storedSettings }
    : { ...DEFAULT_EXTENSION_SETTINGS };

  const storedDomains = result[STORAGE_KEYS.AUTO_REFRESH_DOMAINS] as
    | Record<string, boolean>
    | undefined;
  domainRefreshMap = storedDomains ?? {};

  notifySettingsListeners();
  notifyDomainListeners();
}
