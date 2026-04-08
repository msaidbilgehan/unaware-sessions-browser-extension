<script lang="ts">
  import { getTheme, toggleTheme, onThemeChange } from '@shared/theme-store';
  import type { ThemePreference } from '@shared/theme-store';

  let theme = $state<ThemePreference>(getTheme());

  $effect(() => {
    const unsub = onThemeChange((t) => {
      theme = t;
    });
    return unsub;
  });

  async function setTheme(preference: ThemePreference) {
    while (getTheme() !== preference) {
      await toggleTheme();
    }
    theme = preference;
  }
</script>

<section>
  <h2>Appearance</h2>
  <div class="theme-options">
    <label class="theme-option" class:active={theme === 'light'}>
      <input
        type="radio"
        name="theme"
        value="light"
        checked={theme === 'light'}
        onchange={() => setTheme('light')}
      />
      <span class="option-label">Light</span>
    </label>
    <label class="theme-option" class:active={theme === 'dark'}>
      <input
        type="radio"
        name="theme"
        value="dark"
        checked={theme === 'dark'}
        onchange={() => setTheme('dark')}
      />
      <span class="option-label">Dark</span>
    </label>
    <label class="theme-option" class:active={theme === 'system'}>
      <input
        type="radio"
        name="theme"
        value="system"
        checked={theme === 'system'}
        onchange={() => setTheme('system')}
      />
      <span class="option-label">System</span>
    </label>
  </div>
</section>

<style>
  section {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    box-shadow: var(--shadow-sm);
  }

  h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: 0 0 var(--space-5);
    color: var(--color-text-primary);
  }

  .theme-options {
    display: flex;
    gap: var(--space-4);
  }

  .theme-option {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .theme-option:hover {
    background: var(--color-interactive-hover);
  }

  .theme-option.active {
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
  }

  .theme-option input {
    accent-color: var(--color-accent);
  }

  .option-label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-primary);
  }
</style>
