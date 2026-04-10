<script lang="ts">
  import { DEFAULT_SESSION_EMOJIS } from '@shared/constants';

  interface Props {
    selected: string;
    onchange: (emoji: string) => void;
  }

  let { selected, onchange }: Props = $props();
</script>

<div class="emoji-picker">
  <button
    class="emoji-btn"
    class:active={selected === ''}
    onclick={() => onchange('')}
    aria-label="No emoji"
  >
    <span class="none-label">--</span>
  </button>
  {#each DEFAULT_SESSION_EMOJIS as emoji}
    <button
      class="emoji-btn"
      class:active={selected === emoji}
      onclick={() => onchange(emoji)}
      aria-label="Select emoji {emoji}"
    >
      {emoji}
    </button>
  {/each}
</div>

<style>
  .emoji-picker {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .emoji-btn {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    border: 2px solid transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    padding: 0;
    background: var(--color-bg-tertiary);
    transition: all var(--transition-fast);
  }

  .emoji-btn:hover,
  .emoji-btn:focus-visible {
    border-color: var(--color-text-tertiary);
    background: var(--color-interactive-hover);
  }

  .emoji-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .emoji-btn.active {
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
  }

  .none-label {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    font-weight: var(--font-medium);
  }
</style>
