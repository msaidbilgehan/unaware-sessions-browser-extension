<script lang="ts">
  import type { IsolationMode } from '@shared/types';
  import Icon from '@shared/components/Icon.svelte';

  interface Props {
    currentOrigin: string;
    /** False on chrome://, extension and other non-http(s) pages. */
    supported?: boolean;
    currentSessionColor: string | undefined;
    currentSessionEmoji: string | undefined;
    currentSessionName: string | undefined;
    onrefresh: () => void;
    refreshing?: boolean;
    /** Global auto-save interval is active (> 0) */
    globalAutoRefreshOn?: boolean;
    /** Per-domain auto-save is enabled for this session:origin */
    domainAutoRefreshOn?: boolean;
    onautorefreshToggle?: () => void;
    isolationMode?: IsolationMode;
    onisolationToggle?: () => void;
    onopensettings?: () => void;
  }

  let {
    currentOrigin,
    supported = true,
    currentSessionColor,
    currentSessionEmoji,
    currentSessionName,
    onrefresh,
    refreshing = false,
    globalAutoRefreshOn = false,
    domainAutoRefreshOn = false,
    onautorefreshToggle,
    isolationMode = 'soft',
    onisolationToggle,
    onopensettings,
  }: Props = $props();

  const isStrict = $derived(isolationMode === 'strict');
  const hasSession = $derived(!!currentSessionName);

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

  const displayOrigin = $derived(currentOrigin ? currentOrigin.replace(/^https?:\/\//, '') : '');

  // The same button covers both jobs the panel can do, so its label has to say
  // which one it is about to do rather than naming the mechanism.
  const primaryLabel = $derived(hasSession ? 'Save now' : 'Detect');
  const primaryTitle = $derived(
    hasSession
      ? `Save this site's current cookies and storage into “${currentSessionName}”`
      : 'Check whether this site matches a saved session and attach it',
  );

  const autoSaveState = $derived(
    !globalAutoRefreshOn ? 'paused' : domainAutoRefreshOn ? 'on' : 'off',
  );
  const autoSaveTitle = $derived(
    autoSaveState === 'paused'
      ? 'Auto-save is switched off for every site in Settings'
      : autoSaveState === 'on'
        ? `Auto-save is on for ${displayOrigin} — click to turn off`
        : `Auto-save is off for ${displayOrigin} — click to turn on`,
  );
</script>

{#if !supported}
  <div class="panel unsupported">
    <div class="panel-body">
      <div class="site-info">
        <div class="favicon-wrapper">
          <div class="favicon-fallback">
            <Icon name="info" size={14} />
          </div>
        </div>
        <div class="site-text">
          <span class="origin-text">Sessions don’t apply here</span>
          <span class="session-label muted">
            Browser and extension pages have no cookies to separate. Open a website to use sessions.
          </span>
        </div>
      </div>
    </div>
  </div>
{:else}
  <div
    class="panel"
    style={currentSessionColor ? `--panel-accent: ${currentSessionColor}` : ''}
    class:has-session={hasSession}
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
              onerror={() => (faviconFailed = true)}
            />
          {:else}
            <div class="favicon-fallback" class:empty={!currentOrigin}>
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
            <span class="session-label muted">No session — using browser cookies</span>
          {/if}
        </div>
      </div>

      {#if currentOrigin}
        <button
          class="primary-btn"
          onclick={onrefresh}
          disabled={refreshing}
          title={primaryTitle}
          aria-label={primaryTitle}
        >
          <span class="primary-icon" class:spinning={refreshing}>
            <Icon name={refreshing ? 'refresh-cw' : hasSession ? 'save' : 'search'} size={12} />
          </span>
          {refreshing ? 'Saving…' : primaryLabel}
        </button>
      {/if}
    </div>

    {#if currentOrigin && (onisolationToggle || onautorefreshToggle)}
      <div class="controls">
        {#if onisolationToggle}
          <button
            class="control-chip"
            class:strict={isStrict}
            onclick={onisolationToggle}
            aria-pressed={isStrict}
            title={isStrict
              ? 'Strict: every switch clears this site’s cookies first, even when the target session has nothing saved. Click for Soft.'
              : 'Soft: switching leaves cookies alone on sites where the target session has nothing saved, so unrelated logins survive. Click for Strict.'}
          >
            <Icon name={isStrict ? 'lock' : 'shield'} size={12} />
            <span class="chip-label">{isStrict ? 'Strict' : 'Soft'} isolation</span>
          </button>
        {/if}

        {#if onautorefreshToggle}
          <button
            class="control-chip"
            class:on={autoSaveState === 'on'}
            class:paused={autoSaveState === 'paused'}
            onclick={autoSaveState === 'paused' ? onopensettings : onautorefreshToggle}
            aria-pressed={autoSaveState === 'on'}
            title={autoSaveTitle}
          >
            <Icon name="refresh-cw" size={12} />
            <span class="chip-label">
              {#if autoSaveState === 'paused'}
                Auto-save paused
              {:else if autoSaveState === 'on'}
                Auto-save on
              {:else}
                Auto-save off
              {/if}
            </span>
            {#if autoSaveState === 'on'}
              <span class="live-dot" aria-hidden="true"></span>
            {:else if autoSaveState === 'paused'}
              <Icon name="external-link" size={10} />
            {/if}
          </button>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .panel {
    position: relative;
    background: var(--color-bg-elevated);
    border-radius: var(--radius-xl);
    border: 1px solid var(--color-border-primary);
    overflow: hidden;
    transition: box-shadow var(--transition-smooth);
    box-shadow: var(--shadow-xs);
  }

  .panel:hover {
    box-shadow: var(--shadow-sm);
  }

  .panel.unsupported {
    background: var(--color-bg-secondary);
    border-style: dashed;
  }

  .panel.unsupported .session-label {
    white-space: normal;
    line-height: var(--leading-snug);
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
    padding: var(--space-5);
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  /* A named button instead of a bare download glyph: the action saves the live
     site state into the session, which no icon communicates on its own. */
  .primary-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
    height: var(--tap-target);
    padding: 0 var(--space-4);
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .primary-btn:hover:not(:disabled) {
    color: var(--color-accent);
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
  }

  .primary-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .primary-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .primary-icon {
    display: flex;
  }

  .primary-icon.spinning :global(svg) {
    animation: spin 1s linear infinite;
  }

  .controls {
    display: flex;
    gap: var(--space-2);
    padding: 0 var(--space-5) var(--space-5);
  }

  .control-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    font-size: var(--text-2xs);
    font-weight: var(--font-medium);
    color: var(--color-text-tertiary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .chip-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .control-chip :global(svg) {
    flex-shrink: 0;
  }

  .control-chip:hover {
    color: var(--color-text-secondary);
    background: var(--color-interactive-hover);
    border-color: var(--color-border-primary);
  }

  .control-chip:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .control-chip.strict {
    color: var(--color-accent);
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
  }

  .control-chip.on {
    color: var(--color-success);
    border-color: var(--color-success);
    background: var(--color-success-soft);
  }

  .control-chip.paused {
    opacity: 0.75;
  }

  .live-dot {
    width: 5px;
    height: 5px;
    border-radius: var(--radius-full);
    background: var(--color-success);
    animation: pulse 2s ease-in-out infinite;
    flex-shrink: 0;
    margin-left: auto;
  }
</style>
