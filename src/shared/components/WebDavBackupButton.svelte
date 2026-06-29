<script lang="ts">
  import Icon from './Icon.svelte';
  import { getWebDavConfig, initWebDavStore, onWebDavConfigChange } from '@shared/webdav/webdav-store';
  import type { WebDavConfig } from '@shared/webdav/webdav-types';
  import { webDavBackupNow } from '@shared/api';
  import { _ } from 'svelte-i18n';

  let webDavCfg = $state<WebDavConfig>(getWebDavConfig());
  let backingUp = $state(false);

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
    if (backingUp) return;
    backingUp = true;
    try {
      const state = await webDavBackupNow();
      if (state.status === 'error') {
        onerror?.(state.progress || $_('options.settings.webdavBackupFailed'));
      } else {
        onsuccess?.();
      }
    } catch (err) {
      console.error('[WebDAV Backup] Error backing up:', err);
      onerror?.(err instanceof Error ? err.message : $_('options.settings.webdavBackupFailed'));
    } finally {
      backingUp = false;
    }
  }
</script>

{#if webDavCfg.enabled}
  <button
    class="webdav-backup-btn"
    onclick={handleClick}
    disabled={backingUp}
    aria-label={$_('popup.webdavBackupTooltip')}
    title={$_('popup.webdavBackupTooltip')}
  >
    {#if backingUp}
      <span class="spinner-sm"></span>
    {:else}
      <Icon name="upload" size={15} />
    {/if}
  </button>
{/if}

<style>
  .webdav-backup-btn {
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

  .webdav-backup-btn:hover {
    color: var(--color-text-secondary);
    background: var(--color-interactive-hover);
  }

  .webdav-backup-btn:disabled {
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
