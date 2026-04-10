<script lang="ts">
  import { DEFAULT_SESSION_COLORS } from '@shared/constants';

  interface Props {
    selected: string;
    onchange: (color: string) => void;
  }

  let { selected, onchange }: Props = $props();

  const colorNames: Record<string, string> = {
    '#3B82F6': 'Blue',
    '#EF4444': 'Red',
    '#10B981': 'Green',
    '#F59E0B': 'Amber',
    '#8B5CF6': 'Violet',
    '#EC4899': 'Pink',
    '#06B6D4': 'Cyan',
    '#F97316': 'Orange',
  };

  function handlePresetClick(color: string) {
    onchange(color);
  }

  function handleCustomInput(e: Event) {
    const target = e.target as HTMLInputElement;
    onchange(target.value);
  }
</script>

<div class="color-picker">
  <div class="presets">
    {#each DEFAULT_SESSION_COLORS as color}
      <button
        class="swatch"
        class:active={selected === color}
        style="background-color: {color}"
        onclick={() => handlePresetClick(color)}
        aria-label="Select {colorNames[color] ?? color}"
      ></button>
    {/each}
  </div>
  <div class="custom">
    <input type="color" value={selected} oninput={handleCustomInput} aria-label="Custom color" />
  </div>
</div>

<style>
  .color-picker {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .presets {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .swatch {
    width: 24px;
    height: 24px;
    border-radius: var(--radius-full);
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
    transition: border-color var(--transition-fast);
  }

  .swatch:hover {
    border-color: var(--color-text-tertiary);
  }

  .swatch:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .swatch.active {
    border-color: var(--color-text-primary);
    box-shadow:
      0 0 0 1px var(--color-bg-primary),
      0 0 0 3px var(--color-text-primary);
  }

  .custom input {
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
</style>
