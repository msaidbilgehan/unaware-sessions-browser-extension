<script lang="ts">
  import { fly } from 'svelte/transition';
  import Icon from './Icon.svelte';

  interface Props {
    message: string;
    type?: 'error' | 'success' | 'info';
    action?: { label: string; onclick: () => void };
    duration?: number;
    ondismiss: () => void;
  }

  let { message, type = 'info', action, duration = 5000, ondismiss }: Props = $props();

  const ICONS = { error: 'alert-triangle', success: 'check-circle', info: 'info' } as const;
  const iconName = $derived(ICONS[type]);

  // A toast carrying an action is a deadline the user has to beat. Reaching for
  // "Undo" must not race the auto-dismiss timer, so hovering or focusing the
  // toast holds it open until the pointer leaves again.
  let held = $state(false);

  $effect(() => {
    if (held) return;
    const timer = setTimeout(ondismiss, duration);
    return () => clearTimeout(timer);
  });
</script>

<div class="toast-anchor">
  <div
    class="toast {type}"
    transition:fly={{ y: 16, duration: 200 }}
    role={type === 'error' ? 'alert' : 'status'}
    aria-live={type === 'error' ? 'assertive' : 'polite'}
    onmouseenter={() => (held = true)}
    onmouseleave={() => (held = false)}
    onfocusin={() => (held = true)}
    onfocusout={() => (held = false)}
  >
    <span class="toast-icon"><Icon name={iconName} size={14} /></span>
    <span class="toast-message">{message}</span>
    {#if action}
      <button class="toast-action" onclick={action.onclick}>{action.label}</button>
    {/if}
    <button class="toast-close" onclick={ondismiss} aria-label="Dismiss notification">
      <Icon name="x" size={12} />
    </button>
  </div>
</div>

<style>
  /* The anchor owns the positioning so the fly transition is free to write
     `transform` on the toast without fighting a centering translate. */
  .toast-anchor {
    position: fixed;
    bottom: var(--space-5);
    left: 50%;
    transform: translateX(-50%);
    width: max-content;
    max-width: min(440px, calc(100vw - 2 * var(--space-5)));
    z-index: var(--z-toast);
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    line-height: var(--leading-snug);
    box-shadow: var(--shadow-lg);
    pointer-events: auto;
  }

  .toast-icon {
    display: flex;
    flex-shrink: 0;
  }

  .toast.error {
    background: var(--color-error-soft);
    color: var(--color-error);
    border: 1px solid var(--color-error-border);
  }

  .toast.success {
    background: var(--color-success-soft);
    color: var(--color-success);
    border: 1px solid var(--color-success);
  }

  .toast.info {
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border-primary);
  }

  .toast.info .toast-icon {
    color: var(--color-text-tertiary);
  }

  .toast-message {
    flex: 1;
    min-width: 0;
  }

  .toast-action {
    background: none;
    border: 1px solid currentColor;
    color: inherit;
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    cursor: pointer;
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    flex-shrink: 0;
    transition: background var(--transition-fast);
  }

  .toast-action:hover {
    background: var(--color-interactive-hover);
  }

  .toast-close {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: var(--space-1);
    display: flex;
    border-radius: var(--radius-sm);
    opacity: 0.6;
    flex-shrink: 0;
    transition: opacity var(--transition-fast);
  }

  .toast-close:hover {
    opacity: 1;
  }

  .toast-close:focus-visible,
  .toast-action:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
    border-radius: var(--radius-md);
  }
</style>
