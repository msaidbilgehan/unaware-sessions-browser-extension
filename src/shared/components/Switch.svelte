<script lang="ts">
  interface Props {
    checked: boolean;
    onchange: (checked: boolean) => void;
    /** Accessible name. Required — the control renders no visible text itself. */
    label: string;
    disabled?: boolean;
    /** id of the element describing this control, wired to aria-describedby. */
    describedby?: string;
  }

  let { checked, onchange, label, disabled = false, describedby }: Props = $props();
</script>

<button
  type="button"
  class="switch"
  class:on={checked}
  role="switch"
  aria-checked={checked}
  aria-label={label}
  aria-describedby={describedby}
  {disabled}
  onclick={() => onchange(!checked)}
>
  <span class="thumb"></span>
</button>

<style>
  .switch {
    position: relative;
    width: 40px;
    height: 22px;
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-full);
    cursor: pointer;
    transition: all var(--transition-smooth);
    flex-shrink: 0;
    padding: 0;
  }

  .switch.on {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }

  .switch:hover:not(:disabled):not(.on) {
    border-color: var(--color-text-tertiary);
  }

  .switch:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .switch:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: var(--color-interactive-thumb);
    border-radius: var(--radius-full);
    box-shadow: var(--shadow-sm);
    transition: transform var(--transition-spring);
  }

  .switch.on .thumb {
    transform: translateX(18px);
  }
</style>
