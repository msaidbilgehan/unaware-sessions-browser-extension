<script lang="ts">
  import type { FaviconSource } from '@shared/types';
  import { STORAGE_KEYS } from '@shared/constants';
  import { extractDomain } from '@shared/utils';
  import Icon from '@shared/components/Icon.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import type { ContextMenuItem } from './ContextMenu.svelte';
  import SiteEditDialog from './SiteEditDialog.svelte';
  import { _ } from 'svelte-i18n';
  import '@shared/i18n';
  import { locale } from '@shared/i18n';

  // Force re-render when locale changes
  $effect(() => { void $locale; });

  // ── Types ───────────────────────────────────────────────────────

  interface SiteConfig {
    name?: string;
    iconUrl?: string;
  }

  interface SiteEntry {
    origin: string;
    domain: string;
    defaultName: string;
    sessionCount: number;
  }

  interface Props {
    sessionOriginMap: Record<string, string[]>;
    faviconSource?: FaviconSource;
  }

  let { sessionOriginMap, faviconSource = 'direct_then_google' }: Props = $props();

  // ── Name extraction ────────────────────────────────────────────
  // "www.github.com" → "github"   "mail.google.com" → "google"
  function extractSiteName(domain: string): string {
    const d = domain.replace(/^(?:www|m|app|mobile)\./i, '');
    const parts = d.split('.');
    return parts.length >= 2 ? parts[parts.length - 2] : (parts[0] ?? d);
  }

  // ── Derive sorted unique site list ─────────────────────────────
  const allSites = $derived.by<SiteEntry[]>(() => {
    const seen = new Set<string>();
    // Build origin → session count map
    const countMap: Record<string, number> = {};
    for (const origins of Object.values(sessionOriginMap)) {
      for (const origin of origins) {
        countMap[origin] = (countMap[origin] ?? 0) + 1;
      }
    }
    const entries: SiteEntry[] = [];
    for (const origins of Object.values(sessionOriginMap)) {
      for (const origin of origins) {
        if (!seen.has(origin) && origin.startsWith('http')) {
          seen.add(origin);
          const domain = extractDomain(origin);
          entries.push({
            origin,
            domain,
            defaultName: extractSiteName(domain),
            sessionCount: countMap[origin] ?? 0,
          });
        }
      }
    }
    return entries.sort((a, b) => a.defaultName.localeCompare(b.defaultName));
  });

  // ── Collapse state ──────────────────────────────────────────────
  let collapsed = $state(false);

  // ── Persisted site configs ─────────────────────────────────────
  // origin → { name?, iconUrl? }  — only URL strings, no binaries
  let siteConfigs = $state<Record<string, SiteConfig>>({});

  $effect(() => {
    chrome.storage.local.get(STORAGE_KEYS.SITE_CONFIGS, (result) => {
      siteConfigs = (result[STORAGE_KEYS.SITE_CONFIGS] as Record<string, SiteConfig>) ?? {};
    });
  });

  function saveSiteConfig(origin: string, name: string, iconUrl: string) {
    const cfg: SiteConfig = {};
    if (name) cfg.name = name;
    if (iconUrl) cfg.iconUrl = iconUrl;
    siteConfigs = { ...siteConfigs, [origin]: cfg };
    chrome.storage.local.set({ [STORAGE_KEYS.SITE_CONFIGS]: siteConfigs });
  }

  function getDisplayName(site: SiteEntry): string {
    return siteConfigs[site.origin]?.name ?? site.defaultName;
  }

  // ── Favicon cascade ─────────────────────────────────────────────
  type FaviconState = 'init' | 'loaded' | 'google' | 'failed';
  let faviconStates = $state<Record<string, FaviconState>>({});
  // Track the URL that actually resolved successfully (for pre-filling edit dialog)
  let resolvedFaviconUrls = $state<Record<string, string>>({});

  function getInitialFaviconSrc(origin: string): string {
    // If user has set a custom iconUrl, use it directly
    const custom = siteConfigs[origin]?.iconUrl;
    if (custom) return custom;
    return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(origin)}&size=32`;
  }

  function handleFaviconError(origin: string) {
    faviconStates = { ...faviconStates, [origin]: 'failed' };
  }

  function handleFaviconLoad(origin: string, e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    if (img.naturalWidth === 0) { handleFaviconError(origin); return; }
    faviconStates = { ...faviconStates, [origin]: 'loaded' };
    // Record the resolved URL so the edit dialog can pre-fill it
    resolvedFaviconUrls = { ...resolvedFaviconUrls, [origin]: img.src };
  }

  // Returns the URL currently shown in the img element (resolved or initial)
  function getCurrentFaviconUrl(site: SiteEntry): string {
    return resolvedFaviconUrls[site.origin] ?? getInitialFaviconSrc(site.origin);
  }

  // ── Context menu ───────────────────────────────────────────────
  let contextMenu = $state<{ x: number; y: number; site: SiteEntry } | null>(null);
  let editDialog = $state<{ x: number; y: number; site: SiteEntry } | null>(null);

  function handleContextMenu(e: MouseEvent, site: SiteEntry) {
    e.preventDefault();
    e.stopPropagation();
    editDialog = null;
    contextMenu = { x: e.clientX, y: e.clientY, site };
  }

  const contextMenuItems = $derived<ContextMenuItem[]>(
    contextMenu
      ? [
          {
            label: $_('popup.list.editSite'),
            icon: 'pencil',
            onclick: () => {
              if (!contextMenu) return;
              editDialog = { x: contextMenu.x, y: contextMenu.y, site: contextMenu.site };
            },
          },
          {
            label: $_('popup.list.openSite', { values: { domain: contextMenu.site.domain } }),
            icon: 'external-link',
            onclick: () => contextMenu && chrome.tabs.create({ url: contextMenu.site.origin }),
          },
        ]
      : [],
  );
</script>

{#if allSites.length > 0}
  <div class="site-list-section">
    <!-- Section header -->
    <button
      class="group-toggle"
      onclick={() => (collapsed = !collapsed)}
      aria-expanded={!collapsed}
    >
      <div class="group-header">
        <span class="group-label">{$_('popup.list.sites')}</span>
        <span class="group-count">{allSites.length}</span>
        <span class="group-line"></span>
      </div>
      <span class="toggle-icon" class:open={!collapsed}>
        <Icon name="chevron-down" size={12} />
      </span>
    </button>

    {#if !collapsed}
      <div class="sites-grid">
        {#each allSites as site (site.origin)}
          {@const isFailed = faviconStates[site.origin] === 'failed'}
          <button
            class="site-cell"
            onclick={() => chrome.tabs.create({ url: site.origin })}
            oncontextmenu={(e) => handleContextMenu(e, site)}
            title={site.origin}
            aria-label={$_('popup.list.openSite', { values: { domain: site.domain } })}
          >
            <div class="favicon-container">
              {#if !isFailed}
                <img
                  class="favicon"
                  src={getInitialFaviconSrc(site.origin)}
                  alt=""
                  onerror={() => handleFaviconError(site.origin)}
                  onload={(e) => handleFaviconLoad(site.origin, e)}
                />
              {:else}
                <Icon name="globe" size={16} />
              {/if}
              {#if site.sessionCount > 0}
                <span class="session-badge">{site.sessionCount}</span>
              {/if}
            </div>
            <span class="site-name">{getDisplayName(site)}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<!-- Right-click context menu -->
{#if contextMenu}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={contextMenuItems}
    onclose={() => (contextMenu = null)}
  />
{/if}

<!-- Site edit dialog -->
{#if editDialog}
  {@const site = editDialog.site}
  <SiteEditDialog
    origin={site.origin}
    initialName={getDisplayName(site)}
    initialIconUrl={getCurrentFaviconUrl(site)}
    x={editDialog.x}
    y={editDialog.y}
    onsave={(name, iconUrl) => saveSiteConfig(site.origin, name, iconUrl)}
    onclose={() => (editDialog = null)}
  />
{/if}

<style>
  .site-list-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  /* ── Header ──────────────────────────────────────────────────── */
  .group-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    background: none;
    border: none;
    padding: var(--space-2) 0;
    cursor: pointer;
    width: 100%;
    font-family: var(--font-sans);
  }

  .group-toggle:hover .group-label { color: var(--color-text-secondary); }

  .group-toggle:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
    border-radius: var(--radius-md);
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex: 1;
  }

  .group-label {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }

  .group-count {
    font-size: var(--text-2xs);
    color: var(--color-text-tertiary);
    background: var(--color-bg-tertiary);
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    font-weight: var(--font-semibold);
    min-width: 16px;
    height: 16px;
    line-height: 16px;
    text-align: center;
    flex-shrink: 0;
  }

  .group-line {
    flex: 1;
    height: 1px;
    background: var(--color-border-secondary);
  }

  .toggle-icon {
    color: var(--color-text-tertiary);
    transition: transform var(--transition-fast);
    display: flex;
    flex-shrink: 0;
  }

  .toggle-icon.open { transform: rotate(180deg); }

  /* ── Auto-fill icon grid ─────────────────────────────────────── */
  .sites-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
    gap: var(--space-2);
  }

  .site-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--space-2) var(--space-1);
    border-radius: var(--radius-lg);
    font-family: var(--font-sans);
    transition: background var(--transition-fast);
    min-width: 0;
  }

  .site-cell:hover { background: var(--color-interactive-hover); }

  .site-cell:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .favicon-container {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: visible;       /* allow badge to overflow */
    position: relative;
    flex-shrink: 0;
    color: var(--color-text-tertiary);
    transition: border-color var(--transition-fast);
  }

  .site-cell:hover .favicon-container { border-color: var(--color-border-primary); }

  .favicon {
    width: 20px;
    height: 20px;
    object-fit: contain;
    display: block;
    border-radius: 2px;
    overflow: hidden;
  }

  /* Session count badge — bottom-right corner of the favicon box */
  .session-badge {
    position: absolute;
    bottom: -4px;
    right: -4px;
    min-width: 14px;
    height: 14px;
    line-height: 14px;
    padding: 0 3px;
    border-radius: 999px;
    background: var(--color-accent);
    color: #fff;
    font-size: 9px;
    font-weight: var(--font-semibold);
    text-align: center;
    box-shadow: 0 0 0 1.5px var(--color-bg-elevated);
    pointer-events: none;
    font-family: var(--font-sans);
  }

  .site-name {
    font-size: 10px;
    font-weight: var(--font-medium);
    color: var(--color-text-secondary);
    text-align: center;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.2;
  }

  .site-cell:hover .site-name { color: var(--color-text-primary); }
</style>
