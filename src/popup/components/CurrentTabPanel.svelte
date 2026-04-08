<script lang="ts">
  import Icon from '@shared/components/Icon.svelte';

  interface Props {
    currentOrigin: string;
    currentSessionColor: string | undefined;
    currentSessionEmoji: string | undefined;
    onrefresh: () => void;
    refreshing?: boolean;
    autoRefreshEnabled?: boolean;
    onautorefreshToggle?: () => void;
  }

  let {
    currentOrigin,
    currentSessionColor,
    currentSessionEmoji,
    onrefresh,
    refreshing = false,
    autoRefreshEnabled = false,
    onautorefreshToggle,
  }: Props = $props();

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
</script>

<div
  class="panel"
  style={currentSessionColor ? `--panel-accent: ${currentSessionColor}` : ''}
  class:has-session={!!currentSessionColor}
>
  <div class="origin-row">
    <div class="origin-info">
      {#if faviconUrl && !faviconFailed}
        <img
          class="favicon"
          src={faviconUrl}
          alt=""
          width="16"
          height="16"
          onerror={handleFaviconError}
        />
      {:else if currentOrigin}
        <Icon name="globe" size={16} />
      {/if}
      {#if currentSessionEmoji}
        <span class="session-emoji">{currentSessionEmoji}</span>
      {:else if currentSessionColor}
        <span class="dot" style="background-color: {currentSessionColor}"></span>
      {/if}
      <span class="origin-text">{currentOrigin || 'No active tab'}</span>
    </div>
    {#if currentOrigin}
      <div class="refresh-group">
        {#if onautorefreshToggle}
          <button
            class="auto-refresh-toggle"
            class:active={autoRefreshEnabled}
            onclick={onautorefreshToggle}
            aria-label={autoRefreshEnabled ? 'Disable auto-refresh' : 'Enable auto-refresh'}
            title={autoRefreshEnabled ? 'Disable auto-refresh' : 'Enable auto-refresh'}
          >
            <Icon name="refresh-cw" size={12} />
            Auto
          </button>
        {/if}
        <button
          class="refresh-btn"
          onclick={onrefresh}
          disabled={refreshing}
          aria-label="Refresh session data"
          title="Refresh session data"
        >
          <Icon name="refresh-cw" size={14} />
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .panel {
    padding: var(--space-4) var(--space-5);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border-secondary);
    transition: all var(--transition-fast);
  }

  .panel.has-session {
    border-left: 3px solid var(--panel-accent);
  }

  .origin-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .origin-info {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .favicon {
    flex-shrink: 0;
    border-radius: var(--radius-sm);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .session-emoji {
    font-size: 14px;
    line-height: 1;
    flex-shrink: 0;
  }

  .origin-text {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .refresh-group {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .auto-refresh-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-sm);
    color: var(--color-text-tertiary);
    cursor: pointer;
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    transition: all var(--transition-fast);
  }

  .auto-refresh-toggle:hover {
    color: var(--color-text-secondary);
    background: var(--color-interactive-hover);
  }

  .auto-refresh-toggle.active {
    color: var(--color-accent);
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
  }

  .refresh-btn {
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-sm);
    color: var(--color-text-tertiary);
    cursor: pointer;
    padding: var(--space-2);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all var(--transition-fast);
  }

  .refresh-btn:hover:not(:disabled) {
    color: var(--color-accent);
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
