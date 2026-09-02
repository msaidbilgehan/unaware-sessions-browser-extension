<script lang="ts">
  import Icon from './Icon.svelte';

  interface Props {
    title: string;
    message: string;
    /** Secondary line for consequences the title and message should not carry. */
    detail?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onconfirm: () => void;
    oncancel: () => void;
  }

  let {
    title,
    message,
    detail,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    onconfirm,
    oncancel,
  }: Props = $props();

  let dialogRef = $state<HTMLDivElement | undefined>(undefined);

  // Escape and the focus trap live on the dialog, not the backdrop: the dialog
  // stops click propagation, and a keydown handler on the backdrop would never
  // see events raised by the focused button inside.
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      oncancel();
      return;
    }
    if (e.key !== 'Tab' || !dialogRef) return;

    const focusable = dialogRef.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // Park focus on Cancel (never on the destructive action) and hand it back to
  // whatever opened the dialog, so a keyboard user does not land on <body>.
  $effect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef?.querySelector<HTMLElement>('.cancel-btn')?.focus();
    return () => opener?.focus?.();
  });
</script>

<div class="backdrop" onclick={oncancel} role="presentation">
  <div
    class="dialog"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="confirm-title"
    aria-describedby="confirm-message"
    bind:this={dialogRef}
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={handleKeydown}
  >
    <div class="dialog-head">
      <span class="dialog-icon" class:danger>
        <Icon name={danger ? 'alert-triangle' : 'help-circle'} size={16} />
      </span>
      <h3 id="confirm-title">{title}</h3>
    </div>
    <p id="confirm-message">{message}</p>
    {#if detail}
      <p class="detail">{detail}</p>
    {/if}
    <div class="actions">
      <button class="cancel-btn" onclick={oncancel}>{cancelLabel}</button>
      <button class="confirm-btn" class:danger onclick={onconfirm}>{confirmLabel}</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: var(--color-bg-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-6);
    z-index: var(--z-modal);
    backdrop-filter: blur(2px);
    animation: fadeIn var(--transition-fast) ease;
  }

  .dialog {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-xl);
    padding: var(--space-6);
    max-width: 340px;
    width: 100%;
    box-shadow: var(--shadow-xl);
    animation: scaleIn var(--transition-fast) ease;
  }

  .dialog-head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
  }

  .dialog-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    background: var(--color-accent-soft);
    color: var(--color-accent);
    flex-shrink: 0;
  }

  .dialog-icon.danger {
    background: var(--color-error-soft);
    color: var(--color-error);
  }

  h3 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: var(--font-semibold);
    color: var(--color-text-primary);
  }

  p {
    margin: 0 0 var(--space-6);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    line-height: var(--leading-normal);
  }

  .detail {
    margin-top: calc(-1 * var(--space-4));
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  .actions {
    display: flex;
    gap: var(--space-4);
    justify-content: flex-end;
  }

  .cancel-btn,
  .confirm-btn {
    padding: var(--space-3) var(--space-5);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .cancel-btn {
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-primary);
    color: var(--color-text-secondary);
  }

  .cancel-btn:hover {
    background: var(--color-interactive-hover);
  }

  .cancel-btn:focus-visible,
  .confirm-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .confirm-btn {
    background: var(--color-accent);
    border: 1px solid var(--color-accent);
    color: var(--color-on-accent);
  }

  .confirm-btn:hover {
    background: var(--color-accent-hover);
  }

  .confirm-btn.danger {
    background: var(--color-error);
    border-color: var(--color-error);
    color: var(--color-on-error);
  }

  .confirm-btn.danger:hover {
    background: var(--color-error-hover);
  }
</style>
