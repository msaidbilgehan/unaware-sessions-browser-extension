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
  let color = $state<string>(DEFAULT_SESSION_COLORS[0]);
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

  <!-- Live preview -->
  <div class="preview" style="--preview-color: {color}">
    <div class="preview-strip"></div>
    <div class="preview-body">
      <span class="preview-indicator">
        {#if emoji}
          <span class="preview-emoji">{emoji}</span>
        {:else}
          <span class="preview-dot" style="background-color: {color}"></span>
        {/if}
      </span>
      <span class="preview-name">{name || 'Session name'}</span>
    </div>
  </div>

  <div class="field">
    <label for="session-name">Name</label>
    <input
      id="session-name"
      type="text"
      bind:value={name}
      onkeydown={handleKeydown}
      placeholder="e.g., work-gmail"
      class:has-error={!!error}
    />
    {#if error}
      <span class="error" role="alert">{error}</span>
    {/if}
  </div>

  <div class="field">
    <span class="label-text">Color</span>
    <ColorPicker selected={color} onchange={(c) => (color = c)} />
  </div>

  <div class="field">
    <span class="label-text">Emoji <span class="optional">(optional)</span></span>
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
    border-radius: var(--radius-md);
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

  /* Live preview card */
  .preview {
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border-secondary);
    background: var(--color-bg-elevated);
    overflow: hidden;
    border-left: 3px solid var(--preview-color);
  }

  .preview-strip {
    height: 0;
  }

  .preview-body {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-4);
  }

  .preview-indicator {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .preview-dot {
    width: 10px;
    height: 10px;
    border-radius: var(--radius-full);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--preview-color) 15%, transparent);
  }

  .preview-emoji {
    font-size: var(--text-lg);
    line-height: 1;
  }

  .preview-name {
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    color: var(--color-text-primary);
    opacity: 0.6;
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

  .optional {
    font-weight: var(--font-normal);
    color: var(--color-text-tertiary);
  }

  input[type='text'] {
    padding: var(--space-4) var(--space-5);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-lg);
    font-size: var(--text-base);
    font-family: var(--font-sans);
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    outline: none;
    transition: all var(--transition-fast);
  }

  input[type='text']:focus {
    border-color: var(--color-accent);
    box-shadow: var(--shadow-glow);
  }

  input[type='text'].has-error {
    border-color: var(--color-error);
    box-shadow: 0 0 0 3px var(--color-error-soft);
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
    border-radius: var(--radius-lg);
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all var(--transition-smooth);
    box-shadow: var(--shadow-sm);
  }

  .create-btn:hover {
    background: var(--color-accent-hover);
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
  }

  .create-btn:active {
    transform: translateY(0);
    box-shadow: var(--shadow-xs);
  }

  .create-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }
</style>
