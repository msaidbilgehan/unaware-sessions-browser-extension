<script lang="ts">
  import { DEFAULT_SESSION_COLORS } from '@shared/constants';
  import ColorPicker from './ColorPicker.svelte';
  import EmojiPicker from './EmojiPicker.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    oncreate: (name: string, color: string, emoji?: string) => void | Promise<void>;
    oncancel: () => void;
    /** Domain of the tab the session will adopt, e.g. "mail.google.com". */
    captureDomain?: string;
    existingNames?: string[];
    /** 'back' for the popup's slide-in view, 'close' inside a dialog. */
    dismissStyle?: 'back' | 'close';
  }

  let {
    oncreate,
    oncancel,
    captureDomain = '',
    existingNames = [],
    dismissStyle = 'back',
  }: Props = $props();

  let name = $state('');
  let color = $state<string>(DEFAULT_SESSION_COLORS[0]);
  let emoji = $state('');
  let submitAttempted = $state(false);
  let submitting = $state(false);
  let nameRef = $state<HTMLInputElement | undefined>(undefined);

  // Land the caret in the only required field — the previous form opened with
  // focus on <body>, so every creation started with a click or a Tab.
  $effect(() => {
    nameRef?.focus();
  });

  const trimmed = $derived(name.trim());
  const duplicate = $derived(
    trimmed.length > 0 && existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase()),
  );
  const error = $derived(
    duplicate
      ? 'A session with this name already exists'
      : submitAttempted && !trimmed
        ? 'Session name is required'
        : '',
  );
  const canSubmit = $derived(trimmed.length > 0 && !duplicate && !submitting);

  const suggestion = $derived(
    captureDomain && !existingNames.some((n) => n.toLowerCase() === captureDomain.toLowerCase())
      ? captureDomain
      : '',
  );

  async function handleSubmit() {
    submitAttempted = true;
    if (!canSubmit) return;
    submitting = true;
    try {
      await oncreate(trimmed, color, emoji || undefined);
    } finally {
      submitting = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!e.repeat) void handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      oncancel();
    }
  }
</script>

<div class="form">
  <div class="header">
    {#if dismissStyle === 'back'}
      <button class="back-btn" onclick={oncancel} aria-label="Back to session list">
        <Icon name="arrow-left" size={16} />
      </button>
    {/if}
    <h2 class="title">New session</h2>
    {#if dismissStyle === 'close'}
      <button class="back-btn close" onclick={oncancel} aria-label="Close">
        <Icon name="x" size={16} />
      </button>
    {/if}
  </div>

  <!-- Live preview -->
  <div class="preview" style="--preview-color: {color}">
    <span class="preview-indicator">
      {#if emoji}
        <span class="preview-emoji">{emoji}</span>
      {:else}
        <span class="preview-dot" style="background-color: {color}"></span>
      {/if}
    </span>
    <span class="preview-name" class:placeholder={!trimmed}>{trimmed || 'Session name'}</span>
  </div>

  <div class="field">
    <label for="session-name">Name</label>
    <input
      id="session-name"
      type="text"
      bind:value={name}
      bind:this={nameRef}
      onkeydown={handleKeydown}
      placeholder={captureDomain || 'e.g. work-gmail'}
      class:has-error={!!error}
      aria-invalid={!!error}
      aria-describedby={error ? 'session-name-error' : undefined}
      autocomplete="off"
      spellcheck="false"
    />
    {#if error}
      <span class="error" id="session-name-error" role="alert">{error}</span>
    {:else if suggestion}
      <button class="suggestion" onclick={() => (name = suggestion)}>
        <Icon name="plus" size={10} />
        Use “{suggestion}”
      </button>
    {/if}
  </div>

  <div class="field">
    <span class="label-text">Colour</span>
    <ColorPicker selected={color} onchange={(c) => (color = c)} />
  </div>

  <div class="field">
    <span class="label-text">Emoji <span class="optional">(optional)</span></span>
    <EmojiPicker selected={emoji} onchange={(e) => (emoji = e)} />
  </div>

  {#if captureDomain}
    <p class="capture-note">
      <Icon name="info" size={12} />
      <span>
        The new session immediately adopts <strong>{captureDomain}</strong>'s current cookies and
        storage, so you stay signed in here.
      </span>
    </p>
  {/if}

  <button class="create-btn" onclick={handleSubmit} disabled={!canSubmit}>
    <Icon name="plus" size={14} />
    {submitting ? 'Creating…' : 'Create session'}
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

  .back-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .back-btn.close {
    margin-left: auto;
  }

  .title {
    margin: 0;
    font-weight: var(--font-semibold);
    font-size: var(--text-md);
    color: var(--color-text-primary);
  }

  /* Live preview card */
  .preview {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border-secondary);
    background: var(--color-bg-elevated);
    border-left: 3px solid var(--preview-color);
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preview-name.placeholder {
    color: var(--color-text-tertiary);
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

  .suggestion {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    background: var(--color-accent-soft);
    border: none;
    border-radius: var(--radius-full);
    font-family: var(--font-sans);
    font-size: var(--text-2xs);
    font-weight: var(--font-medium);
    color: var(--color-accent);
    cursor: pointer;
  }

  .suggestion:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .capture-note {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
    margin: 0;
    padding: var(--space-4);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    line-height: var(--leading-relaxed);
  }

  .capture-note :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--color-text-tertiary);
  }

  .capture-note strong {
    color: var(--color-text-primary);
  }

  .create-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6);
    background: var(--color-accent);
    color: var(--color-on-accent);
    border: none;
    border-radius: var(--radius-lg);
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all var(--transition-smooth);
    box-shadow: var(--shadow-sm);
  }

  .create-btn:hover:not(:disabled) {
    background: var(--color-accent-hover);
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
  }

  .create-btn:active:not(:disabled) {
    transform: translateY(0);
    box-shadow: var(--shadow-xs);
  }

  .create-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .create-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    box-shadow: var(--shadow-sm);
  }
</style>
