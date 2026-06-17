<script lang="ts">
  import Icon from '@shared/components/Icon.svelte';
  import { _ } from 'svelte-i18n';
  import '@shared/i18n';

  interface Props {
    origin: string;
    initialName: string;
    initialIconUrl: string;
    x: number;
    y: number;
    onsave: (name: string, iconUrl: string) => void;
    onclose: () => void;
  }

  let { origin, initialName, initialIconUrl, x, y, onsave, onclose }: Props = $props();

  let nameValue = $state(initialName);
  let iconUrlValue = $state(initialIconUrl);
  let previewError = $state(false);

  // Clamp position to stay within popup viewport
  const clampedX = $derived(Math.min(x, window.innerWidth - 220));
  const clampedY = $derived(Math.min(y, window.innerHeight - 160));

  let dialogRef = $state<HTMLDivElement | undefined>(undefined);

  // Close on outside click or Escape
  $effect(() => {
    function handleClick(e: MouseEvent) {
      if (dialogRef && !dialogRef.contains(e.target as Node)) onclose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onclose();
    }
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKey);
    // Auto-focus name input
    setTimeout(() => dialogRef?.querySelector<HTMLInputElement>('input')?.focus(), 0);
    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('keydown', handleKey);
    };
  });

  function handleSave() {
    onsave(nameValue.trim() || initialName, iconUrlValue.trim());
    onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
    e.stopPropagation();
  }

  function resetIcon() {
    iconUrlValue = initialIconUrl;
    previewError = false;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="site-edit-dialog"
  style="left: {clampedX}px; top: {clampedY}px"
  bind:this={dialogRef}
  onkeydown={handleKeydown}
  role="dialog"
  aria-label={$_('popup.list.editSite')}
>
  <!-- Header -->
  <div class="dialog-header">
    <span class="dialog-title">{$_('popup.list.editSite')}</span>
    <button class="close-btn" onclick={onclose} aria-label="Close">
      <Icon name="x" size={12} />
    </button>
  </div>

  <!-- Icon preview + URL -->
  <div class="icon-row">
    <div class="icon-preview">
      {#if !previewError && iconUrlValue}
        <img
          src={iconUrlValue}
          alt=""
          width="24"
          height="24"
          onerror={() => (previewError = true)}
          onload={() => (previewError = false)}
        />
      {:else}
        <Icon name="globe" size={18} />
      {/if}
    </div>
    <div class="icon-url-wrap">
      <input
        class="field-input"
        type="text"
        placeholder="https://..."
        bind:value={iconUrlValue}
        oninput={() => (previewError = false)}
      />
    </div>
    <button class="reset-btn" onclick={resetIcon} title={$_('popup.list.resetIcon')} aria-label={$_('popup.list.resetIcon')}>
      <Icon name="rotate-ccw" size={11} />
    </button>
  </div>

  <!-- Name -->
  <div class="field-row">
    <input
      class="field-input"
      type="text"
      placeholder={$_('popup.list.siteNamePlaceholder')}
      bind:value={nameValue}
    />
  </div>

  <!-- Actions -->
  <div class="dialog-actions">
    <button class="btn-cancel" onclick={onclose}>{$_('common.cancel')}</button>
    <button class="btn-save" onclick={handleSave}>{$_('common.save')}</button>
  </div>
</div>

<style>
  .site-edit-dialog {
    position: fixed;
    z-index: 950;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-xl);
    padding: var(--space-4);
    width: 210px;
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    animation: slideUp 0.12s ease-out;
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .dialog-title {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-tertiary);
    padding: 2px;
    border-radius: var(--radius-sm);
    display: flex;
    transition: color var(--transition-fast);
  }

  .close-btn:hover { color: var(--color-text-primary); }

  /* Icon row */
  .icon-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .icon-preview {
    width: 32px;
    height: 32px;
    border-radius: var(--radius-md);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
    color: var(--color-text-tertiary);
  }

  .icon-preview img {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }

  .icon-url-wrap {
    flex: 1;
    min-width: 0;
  }

  .reset-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-tertiary);
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    display: flex;
    flex-shrink: 0;
    transition: color var(--transition-fast), background var(--transition-fast);
  }

  .reset-btn:hover {
    color: var(--color-text-primary);
    background: var(--color-interactive-hover);
  }

  /* Inputs */
  .field-row { display: flex; }

  .field-input {
    width: 100%;
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    color: var(--color-text-primary);
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    outline: none;
    box-sizing: border-box;
    transition: border-color var(--transition-fast);
  }

  .field-input:focus {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px var(--color-accent-soft);
  }

  /* Action buttons */
  .dialog-actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }

  .btn-cancel,
  .btn-save {
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    font-weight: var(--font-medium);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-4);
    cursor: pointer;
    border: none;
    transition: all var(--transition-fast);
  }

  .btn-cancel {
    background: none;
    color: var(--color-text-secondary);
  }

  .btn-cancel:hover {
    background: var(--color-interactive-hover);
    color: var(--color-text-primary);
  }

  .btn-save {
    background: var(--color-accent);
    color: #fff;
  }

  .btn-save:hover {
    filter: brightness(1.1);
  }
</style>
