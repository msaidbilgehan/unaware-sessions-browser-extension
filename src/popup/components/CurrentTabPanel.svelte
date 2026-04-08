<script lang="ts">
  import type { SessionProfile } from '@shared/types';
  import Icon from '@shared/components/Icon.svelte';

  interface Props {
    currentOrigin: string;
    currentSessionName: string | undefined;
    currentSessionColor: string | undefined;
    currentSessionEmoji: string | undefined;
    sessions: SessionProfile[];
    onswitch: (sessionId: string) => void;
    onunassign: () => void;
    onrefresh: () => void;
    refreshing?: boolean;
  }

  let {
    currentOrigin,
    currentSessionName,
    currentSessionColor,
    currentSessionEmoji,
    sessions,
    onswitch,
    onunassign,
    onrefresh,
    refreshing = false,
  }: Props = $props();

  const faviconUrl = $derived(
    currentOrigin
      ? `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(currentOrigin)}&size=32`
      : '',
  );
  let faviconFailed = $state(false);

  $effect(() => {
    // Reset failure state when origin changes
    void currentOrigin;
    faviconFailed = false;
  });

  function handleFaviconError() {
    faviconFailed = true;
  }

  function handleChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    const value = target.value;
    if (value === '__none__') {
      onunassign();
    } else {
      onswitch(value);
    }
  }
</script>

<div
  class="panel"
  style={currentSessionColor ? `--panel-accent: ${currentSessionColor}` : ''}
  class:has-session={!!currentSessionColor}
>
  <div class="origin">
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
    <div class="switcher">
      <label for="session-switch">Session:</label>
      <select id="session-switch" onchange={handleChange}>
        <option value="__none__" selected={!currentSessionName}> None (default) </option>
        {#each sessions as session (session.id)}
          <option value={session.id} selected={session.name === currentSessionName}>
            {session.emoji ?? ''}
            {session.name}
          </option>
        {/each}
      </select>
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

  .origin {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
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
    font-size: var(--text-md);
    font-weight: var(--font-medium);
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .switcher {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  select {
    flex: 1;
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    outline: none;
    transition: border-color var(--transition-fast);
  }

  select:focus {
    border-color: var(--color-accent);
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
