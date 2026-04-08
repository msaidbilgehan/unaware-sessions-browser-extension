<script lang="ts">
  import type { SessionProfile } from '@shared/types';

  interface Props {
    sessions: SessionProfile[];
    onswitch: (sessionId: string) => void;
    onclose: () => void;
  }

  let { sessions, onswitch, onclose }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    const num = parseInt(e.key, 10);
    if (num >= 1 && num <= 9 && num <= sessions.length) {
      onswitch(sessions[num - 1].id);
      onclose();
      return;
    }
    onclose();
  }

  $effect(() => {
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay-backdrop" onclick={onclose}>
  <div class="overlay" onclick={(e) => e.stopPropagation()}>
    <h3>Quick Switch</h3>
    <p class="hint">Press a number to switch</p>
    <div class="session-list">
      {#each sessions.slice(0, 9) as session, i}
        <div class="session-row">
          <span class="key-badge">{i + 1}</span>
          <span class="dot" style="background-color: {session.color}"></span>
          <span class="name">{session.emoji ?? ''} {session.name}</span>
        </div>
      {/each}
    </div>
    <p class="dismiss-hint">Press any key to close</p>
  </div>
</div>

<style>
  .overlay-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 950;
    backdrop-filter: blur(2px);
  }

  .overlay {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    min-width: 240px;
    box-shadow: var(--shadow-lg);
  }

  h3 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-md);
    font-weight: var(--font-semibold);
    color: var(--color-text-primary);
  }

  .hint {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    margin: 0 0 var(--space-4);
  }

  .session-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .session-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
  }

  .key-badge {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-primary);
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--color-text-secondary);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .name {
    font-size: var(--text-sm);
    color: var(--color-text-primary);
  }

  .dismiss-hint {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    text-align: center;
    margin: var(--space-4) 0 0;
  }
</style>
