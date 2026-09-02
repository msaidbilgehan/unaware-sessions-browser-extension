<script lang="ts" generics="T extends string | number">
  import Icon from './Icon.svelte';

  interface Option {
    value: T;
    label: string;
    icon?: string;
    /** Longer explanation surfaced as a tooltip. */
    hint?: string;
  }

  interface Props {
    options: readonly Option[];
    value: T;
    onchange: (value: T) => void;
    /** Accessible name for the whole group. */
    label: string;
    disabled?: boolean;
    /** Fill the available width instead of hugging the options. */
    stretch?: boolean;
    size?: 'sm' | 'md';
  }

  let {
    options,
    value,
    onchange,
    label,
    disabled = false,
    stretch = false,
    size = 'sm',
  }: Props = $props();

  let groupRef = $state<HTMLDivElement | undefined>(undefined);

  // Roving tabindex: only the checked option is tabbable, arrows move between
  // options. This is the WAI-ARIA radiogroup pattern — Tab should skip past the
  // whole group rather than stopping on every segment.
  function handleKeydown(e: KeyboardEvent) {
    if (disabled) return;
    const current = options.findIndex((o) => o.value === value);
    if (current < 0) return;

    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (current + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (current - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    if (next === null) return;

    e.preventDefault();
    onchange(options[next].value);
    groupRef?.querySelectorAll<HTMLElement>('.segment')[next]?.focus();
  }
</script>

<div
  class="segmented"
  class:stretch
  class:disabled
  class:md={size === 'md'}
  role="radiogroup"
  tabindex="-1"
  aria-label={label}
  bind:this={groupRef}
  onkeydown={handleKeydown}
>
  {#each options as opt (opt.value)}
    <button
      type="button"
      class="segment"
      class:active={value === opt.value}
      role="radio"
      aria-checked={value === opt.value}
      tabindex={value === opt.value ? 0 : -1}
      title={opt.hint}
      {disabled}
      onclick={() => onchange(opt.value)}
    >
      {#if opt.icon}
        <Icon name={opt.icon} size={size === 'md' ? 14 : 12} />
      {/if}
      <span>{opt.label}</span>
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: inline-flex;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border-secondary);
    flex-shrink: 0;
  }

  .segmented.stretch {
    display: flex;
    width: 100%;
  }

  .segmented.disabled {
    opacity: 0.5;
  }

  .segment {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background: none;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    font-weight: var(--font-medium);
    color: var(--color-text-tertiary);
    cursor: pointer;
    transition: all var(--transition-fast);
    white-space: nowrap;
  }

  .segmented.md .segment {
    padding: var(--space-3) var(--space-5);
    font-size: var(--text-sm);
  }

  .segmented.stretch .segment {
    flex: 1;
  }

  .segment:hover:not(.active):not(:disabled) {
    color: var(--color-text-secondary);
    background: var(--color-interactive-hover);
  }

  .segment:disabled {
    cursor: not-allowed;
  }

  .segment:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .segment.active {
    color: var(--color-text-primary);
    background: var(--color-bg-elevated);
    box-shadow: var(--shadow-xs);
  }

  .segment.active :global(svg) {
    color: var(--color-accent);
  }
</style>
