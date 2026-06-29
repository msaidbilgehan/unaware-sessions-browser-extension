<script lang="ts">
  import Icon from './Icon.svelte';
  import { getWebDavConfig, initWebDavStore, onWebDavConfigChange } from '@shared/webdav/webdav-store';
  import type { WebDavConfig } from '@shared/webdav/webdav-types';
  import { webDavListBackups, webDavRestore } from '@shared/api';
  import { _ } from 'svelte-i18n';

  let webDavCfg = $state<WebDavConfig>(getWebDavConfig());
  let restoring = $state(false);

  interface Props {
    onsuccess?: () => void;
    onerror?: (message: string) => void;
  }

  let { onsuccess, onerror }: Props = $props();

  $effect(() => {
    initWebDavStore().then(() => {
      webDavCfg = getWebDavConfig();
    });
    const unsub = onWebDavConfigChange((config) => {
      webDavCfg = config;
    });
    return unsub;
  });

  async function handleClick() {
    if (restoring) return;
    restoring = true;
    try {
      const backups = await webDavListBackups();
      if (backups.length === 0) {
        onerror?.($_('popup.webdavNoBackups'));
        return;
      }

      // Pick the most recent backup
      const latest = backups.sort((a, b) => b.lastModified - a.lastModified)[0];
      await webDavRestore(latest.fileName);
      onsuccess?.();
    } catch (err) {
      console.error('[WebDAV Restore] Error restoring:', err);
      onerror?.(err instanceof Error ? err.message : $_('options.settings.webdavRestoreFailed', { values: { error: '' } }));
    } finally {
      restoring = false;
    }
  }
</script>

{#if webDavCfg.enabled}
  <button
    class="webdav-restore-btn"
    onclick={handleClick}
    disabled={restoring}
    aria-label={$_('popup.webdavRestoreTooltip')}
    title={$_('popup.webdavRestoreTooltip')}
  >
    {#if restoring}
      <span class="spinner-sm"></span>
    {:else}
      <Icon name="download" size={15} />
    {/if}
  </button>
{/if}

<style>
  .webdav-restore-btn {
    background: none;
    border: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
    padding: var(--space-2);
    border-radius: var(--radius-md);
    line-height: 1;
    display: flex;
    align-items: center;
    transition: all var(--transition-fast);
  }

  .webdav-restore-btn:hover {
    color: var(--color-text-secondary);
    background: var(--color-interactive-hover);
  }

  .webdav-restore-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .spinner-sm {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: currentColor;
    animation: spin 0.8s linear infinite;
    display: inline-block;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
