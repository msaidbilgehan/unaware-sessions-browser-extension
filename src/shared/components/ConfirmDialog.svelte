<script lang="ts">
  interface Props {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onconfirm: () => void;
    oncancel: () => void;
  }

  let {
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    onconfirm,
    oncancel,
  }: Props = $props();

  let dialogRef = $state<HTMLDivElement | undefined>(undefined);

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      oncancel();
    }
    if (e.key === 'Tab' && dialogRef) {
      const focusable = dialogRef.querySelectorAll<HTMLElement>(
        'button, [tabindex]:not([tabindex="-1"])',
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
  }

  $effect(() => {
    if (dialogRef) {
      const btn = dialogRef.querySelector<HTMLElement>('.cancel-btn');
      btn?.focus();
    }
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onkeydown={handleKeydown} onclick={oncancel}>
  <div
    class="dialog"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="confirm-title"
    aria-describedby="confirm-message"
    bind:this={dialogRef}
    onclick={(e) => e.stopPropagation()}
  >
    <h3 id="confirm-title">{title}</h3>
    <p id="confirm-message">{message}</p>
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
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(2px);
  }

  .dialog {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    max-width: 320px;
    width: 90%;
    box-shadow: var(--shadow-lg);
  }

  h3 {
    margin: 0 0 var(--space-4);
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

  .confirm-btn {
    background: var(--color-accent);
    border: 1px solid var(--color-accent);
    color: var(--color-text-inverse);
  }

  .confirm-btn:hover {
    background: var(--color-accent-hover);
  }

  .confirm-btn.danger {
    background: var(--color-error);
    border-color: var(--color-error);
  }

  .confirm-btn.danger:hover {
    background: var(--color-error-hover);
  }
</style>
