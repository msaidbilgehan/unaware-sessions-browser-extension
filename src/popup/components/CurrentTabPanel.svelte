<script lang="ts">
  import type { IsolationMode } from '@shared/types';
  import Icon from '@shared/components/Icon.svelte';

  interface Props {
    currentOrigin: string;
    currentSessionColor: string | undefined;
    currentSessionEmoji: string | undefined;
    currentSessionName: string | undefined;
    onrefresh: () => void;
    refreshing?: boolean;
    autoRefreshEnabled?: boolean;
    onautorefreshToggle?: () => void;
    isolationMode?: IsolationMode;
    onisolationToggle?: () => void;
  }

  let {
    currentOrigin,
    currentSessionColor,
    currentSessionEmoji,
    currentSessionName,
    onrefresh,
    refreshing = false,
    autoRefreshEnabled = false,
    onautorefreshToggle,
    isolationMode = 'soft',
    onisolationToggle,
  }: Props = $props();

  const isStrict = $derived(isolationMode === 'strict');

  const faviconUrl = $derived(
    currentOrigin
      ? `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(currentOrigin)}&size=32`
      : '',
  );
  let faviconFailed = $state(false);

  $effect(() => {
    void currentOrigin;
    faviconFailed = false;
  });

  function handleFaviconError() {
    faviconFailed = true;
  }

  const displayOrigin = $derived(
    currentOrigin ? currentOrigin.replace(/^https?:\/\//, '') : '',
  );
</script>

<div
  class="panel"
  style={currentSessionColor ? `--panel-accent: ${currentSessionColor}` : ''}
  class:has-session={!!currentSessionColor}
>
  {#if currentSessionColor}
    <div class="accent-strip"></div>
  {/if}

  <div class="panel-body">
    <div class="site-info">
      <div class="favicon-wrapper">
        {#if faviconUrl && !faviconFailed}
          <img
            class="favicon"
            src={faviconUrl}
            alt=""
            width="20"
            height="20"
            onerror={handleFaviconError}
          />
        {:else if currentOrigin}
          <div class="favicon-fallback">
            <Icon name="globe" size={14} />
          </div>
        {:else}
          <div class="favicon-fallback empty">
            <Icon name="globe" size={14} />
          </div>
        {/if}
      </div>

      <div class="site-text">
        <span class="origin-text">{displayOrigin || 'No active tab'}</span>
        {#if currentSessionName}
          <span class="session-label">
            {#if currentSessionEmoji}
              <span class="session-emoji">{currentSessionEmoji}</span>
            {:else if currentSessionColor}
              <span class="dot" style="background-color: {currentSessionColor}"></span>
            {/if}
            {currentSessionName}
          </span>
        {:else if currentOrigin}
          <span class="session-label muted">No active session</span>
        {/if}
      </div>
    </div>

    {#if currentOrigin}
      <div class="actions">
        {#if onisolationToggle}
          <button
            class="action-btn"
            class:active={isStrict}
            onclick={onisolationToggle}
            aria-label={isStrict ? 'Switch to soft isolation' : 'Switch to strict isolation'}
            title={isStrict ? 'Strict isolation (clears all cookies)' : 'Soft isolation (preserves unmanaged cookies)'}
          >
            <Icon name={isStrict ? 'lock' : 'shield'} size={12} />
          </button>
        {/if}
        {#if onautorefreshToggle}
          <button
            class="action-btn"
            class:active={autoRefreshEnabled}
            onclick={onautorefreshToggle}
            aria-label={autoRefreshEnabled ? 'Disable auto-refresh' : 'Enable auto-refresh'}
            title={autoRefreshEnabled ? 'Auto-refresh on' : 'Auto-refresh off'}
          >
            <Icon name="refresh-cw" size={12} />
          </button>
        {/if}
        <button
          class="action-btn primary"
          onclick={onrefresh}
          disabled={refreshing}
          class:spinning={refreshing}
          aria-label="Session Load"
          title="Save & detect session data"
        >
          <Icon name="download" size={12} />
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .panel {
    position: relative;
    background: var(--color-bg-elevated);
    border-radius: var(--radius-xl);
    border: 1px solid var(--color-border-primary);
    overflow: hidden;
    transition: all var(--transition-smooth);
    box-shadow: var(--shadow-xs);
  }

  .panel:hover {
    box-shadow: var(--shadow-sm);
  }

  .accent-strip {
    height: 3px;
    background: var(--panel-accent);
    opacity: 0.8;
  }

  .panel-body {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-5);
  }

  .site-info {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    min-width: 0;
    flex: 1;
  }

  .favicon-wrapper {
    flex-shrink: 0;
  }

  .favicon {
    display: block;
    border-radius: var(--radius-sm);
  }

  .favicon-fallback {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-tertiary);
  }

  .favicon-fallback.empty {
    opacity: 0.5;
  }

  .site-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .origin-text {
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: var(--leading-tight);
  }

  .session-label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    line-height: var(--leading-tight);
  }

  .session-label.muted {
    color: var(--color-text-tertiary);
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .session-emoji {
    font-size: 11px;
    line-height: 1;
    flex-shrink: 0;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    color: var(--color-text-tertiary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .action-btn:hover:not(:disabled) {
    color: var(--color-text-secondary);
    background: var(--color-interactive-hover);
    border-color: var(--color-border-primary);
  }

  .action-btn.active {
    color: var(--color-accent);
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
  }

  .action-btn.primary:hover:not(:disabled) {
    color: var(--color-accent);
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .action-btn.spinning :global(svg) {
    animation: spin 1s linear infinite;
  }
</style>
