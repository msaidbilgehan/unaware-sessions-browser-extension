<script lang="ts">
  import { DEFAULT_SESSION_COLORS } from '@shared/constants';
  import ColorPicker from '@shared/components/ColorPicker.svelte';
  import EmojiPicker from '@shared/components/EmojiPicker.svelte';
  import Icon from '@shared/components/Icon.svelte';

  interface Props {
    oncreate: (name: string, color: string, emoji?: string) => void;
    oncancel: () => void;
  }

  let { oncreate, oncancel }: Props = $props();
  let name = $state('');
  let color = $state(DEFAULT_SESSION_COLORS[0]);
  let emoji = $state('');
  let error = $state('');

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) {
      error = 'Session name is required';
      return;
    }
    error = '';
    oncreate(trimmed, color, emoji || undefined);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      oncancel();
    }
  }
</script>

<div class="form">
  <div class="header">
    <button class="back-btn" onclick={oncancel} aria-label="Back">
      <Icon name="arrow-left" size={16} />
    </button>
    <span class="title">New Session</span>
  </div>

  <div class="field">
    <label for="session-name">Name</label>
    <input
      id="session-name"
      type="text"
      bind:value={name}
      onkeydown={handleKeydown}
      placeholder="e.g., work-gmail"
    />
    {#if error}
      <span class="error">{error}</span>
    {/if}
  </div>

  <div class="field">
    <span class="label-text">Color</span>
    <ColorPicker selected={color} onchange={(c) => (color = c)} />
  </div>

  <div class="field">
    <span class="label-text">Emoji (optional)</span>
    <EmojiPicker selected={emoji} onchange={(e) => (emoji = e)} />
  </div>

  <button class="create-btn" onclick={handleSubmit}>
    <Icon name="plus" size={14} />
    Create Session
  </button>
</div>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .header {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .back-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--space-2);
    color: var(--color-text-secondary);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    transition: all var(--transition-fast);
  }

  .back-btn:hover {
    background: var(--color-interactive-hover);
    color: var(--color-text-primary);
  }

  .title {
    font-weight: var(--font-semibold);
    font-size: var(--text-md);
    color: var(--color-text-primary);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  label,
  .label-text {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-secondary);
  }

  input[type='text'] {
    padding: var(--space-4) var(--space-5);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    font-size: var(--text-base);
    font-family: var(--font-sans);
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    outline: none;
    transition: border-color var(--transition-fast);
  }

  input[type='text']:focus {
    border-color: var(--color-accent);
  }

  input[type='text']::placeholder {
    color: var(--color-text-tertiary);
  }

  .error {
    font-size: var(--text-xs);
    color: var(--color-error);
  }

  .create-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6);
    background: var(--color-accent);
    color: var(--color-text-inverse);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .create-btn:hover {
    background: var(--color-accent-hover);
  }
</style>
