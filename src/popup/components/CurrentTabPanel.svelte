<script lang="ts">
  import type { IsolationMode } from '@shared/types';
  import Icon from '@shared/components/Icon.svelte';
  import { _ } from 'svelte-i18n';
  import '@shared/i18n';
  import { locale } from '@shared/i18n';

  // Force re-render when locale changes
  $effect(() => { void $locale; });

  interface Props {
    currentOrigin: string;
    currentSessionColor: string | undefined;
    currentSessionEmoji: string | undefined;
    currentSessionName: string | undefined;
    onrefresh: () => void;
    refreshing?: boolean;
    /** Global auto-refresh interval is active (> 0) */
    globalAutoRefreshOn?: boolean;
    /** Per-domain auto-refresh is enabled for this session:origin */
    domainAutoRefreshOn?: boolean;
    /** Effective state: global ON and domain ON */
    autoRefreshEffective?: boolean;
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
    globalAutoRefreshOn = false,
    domainAutoRefreshOn = false,
    autoRefreshEffective = false,
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
        <span class="origin-text">{displayOrigin || $_('popup.noActiveTab')}</span>
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
          <span class="session-label muted">{$_('popup.noActiveSession')}</span>
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
            aria-label={isStrict ? $_('popup.switchToSoft') : $_('popup.switchToStrict')}
            title={isStrict ? $_('popup.strictIsolationTooltip') : $_('popup.softIsolationTooltip')}
          >
            <Icon name={isStrict ? 'lock' : 'shield'} size={12} />
          </button>
        {/if}
        {#if onautorefreshToggle}
          <button
            class="action-btn auto-refresh-toggle"
            class:active={autoRefreshEffective}
            class:domain-on={domainAutoRefreshOn && !globalAutoRefreshOn}
            onclick={onautorefreshToggle}
            disabled={!globalAutoRefreshOn}
            aria-label={!globalAutoRefreshOn
              ? $_('popup.autoRefreshDisabledGlobal')
              : domainAutoRefreshOn
                ? $_('popup.autoRefreshDisableDomain')
                : $_('popup.autoRefreshEnableDomain')}
            title={!globalAutoRefreshOn
              ? $_('popup.autoRefreshOffGlobal')
              : domainAutoRefreshOn
                ? $_('popup.autoRefreshActiveDomain')
                : $_('popup.autoRefreshOffDomain')}
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
          title={$_('popup.saveDetectSession')}
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

  /* Effective: global ON + domain ON — green pulse */
  .action-btn.auto-refresh-toggle.active {
    color: var(--color-success);
    border-color: var(--color-success);
    background: var(--color-success-soft);
    position: relative;
  }

  .action-btn.auto-refresh-toggle.active::after {
    content: '';
    position: absolute;
    top: 3px;
    right: 3px;
    width: 5px;
    height: 5px;
    border-radius: var(--radius-full);
    background: var(--color-success);
    animation: pulse 2s ease-in-out infinite;
  }

  /* Domain ON but global OFF — dimmed, shows state is preserved but dormant */
  .action-btn.auto-refresh-toggle.domain-on {
    color: var(--color-text-tertiary);
    border-color: var(--color-border-primary);
    background: var(--color-bg-tertiary);
    opacity: 0.55;
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
