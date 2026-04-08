<script lang="ts">
  import Icon from './Icon.svelte';
  import { getTheme, toggleTheme, onThemeChange } from '@shared/theme-store';
  import type { ThemePreference } from '@shared/theme-store';

  let theme = $state<ThemePreference>(getTheme());

  const iconMap: Record<ThemePreference, string> = {
    light: 'sun',
    dark: 'moon',
    system: 'monitor',
  };

  const labelMap: Record<ThemePreference, string> = {
    light: 'Switch to dark theme',
    dark: 'Switch to system theme',
    system: 'Switch to light theme',
  };

  $effect(() => {
    const unsub = onThemeChange((t) => {
      theme = t;
    });
    return unsub;
  });

  async function handleClick() {
    await toggleTheme();
  }
</script>

<button
  class="theme-toggle"
  onclick={handleClick}
  aria-label={labelMap[theme]}
  title={labelMap[theme]}
>
  <Icon name={iconMap[theme]} size={16} />
</button>

<style>
  .theme-toggle {
    background: none;
    border: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      color var(--transition-fast),
      background var(--transition-fast);
  }

  .theme-toggle:hover {
    color: var(--color-text-secondary);
    background: var(--color-interactive-hover);
  }
</style>
