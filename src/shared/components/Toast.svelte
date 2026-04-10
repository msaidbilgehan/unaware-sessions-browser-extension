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

  $effect(() => {
    const timer = setTimeout(ondismiss, duration);
    return () => clearTimeout(timer);
  });
</script>

<div
  class="toast {type}"
  transition:fly={{ y: 40, duration: 200 }}
  role="status"
  aria-live="polite"
>
  <span class="toast-message">{message}</span>
  {#if action}
    <button class="toast-action" onclick={action.onclick}>{action.label}</button>
  {/if}
  <button class="toast-close" onclick={ondismiss} aria-label="Dismiss">
    <Icon name="x" size={12} />
  </button>
</div>

<style>
  .toast {
    position: fixed;
    bottom: var(--space-5);
    left: var(--space-5);
    right: var(--space-5);
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    z-index: 999;
    box-shadow: var(--shadow-lg);
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

  .toast-message {
    flex: 1;
  }

  .toast-action {
    background: none;
    border: none;
    color: inherit;
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    cursor: pointer;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    text-decoration: underline;
  }

  .toast-action:hover {
    opacity: 0.8;
  }

  .toast-close {
    background: none;
    border: none;
    color: inherit;
    font-size: var(--text-md);
    cursor: pointer;
    padding: 0 var(--space-1);
    opacity: 0.6;
    line-height: 1;
  }

  .toast-close:hover {
    opacity: 1;
  }

  .toast-close:focus-visible,
  .toast-action:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
    border-radius: var(--radius-sm);
  }
</style>
