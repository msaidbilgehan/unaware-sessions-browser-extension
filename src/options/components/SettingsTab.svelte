<script lang="ts">
  import { getTheme, toggleTheme, onThemeChange } from '@shared/theme-store';
  import type { ThemePreference } from '@shared/theme-store';
  import {
    getAutoRefreshInterval,
    getAutoRefreshDefaultEnabled,
    setAutoRefreshInterval,
    setAutoRefreshDefaultEnabled,
    onSettingsChange,
  } from '@shared/settings-store';
  import type { AutoRefreshInterval } from '@shared/types';

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

  // Auto-refresh interval
  let refreshInterval = $state<AutoRefreshInterval>(getAutoRefreshInterval());

  $effect(() => {
    const unsub = onSettingsChange((settings) => {
      refreshInterval = settings.autoRefreshInterval;
    });
    return unsub;
  });

  const intervalOptions: { value: AutoRefreshInterval; label: string }[] = [
    { value: 0, label: 'Disabled' },
    { value: 5, label: '5 seconds' },
    { value: 10, label: '10 seconds' },
    { value: 30, label: '30 seconds' },
    { value: 60, label: '60 seconds' },
  ];

  async function handleIntervalChange(value: AutoRefreshInterval) {
    await setAutoRefreshInterval(value);
  }

  // Auto-refresh default for new domains
  let defaultEnabled = $state<boolean>(getAutoRefreshDefaultEnabled());

  $effect(() => {
    const unsub = onSettingsChange((settings) => {
      defaultEnabled = settings.autoRefreshDefaultEnabled;
    });
    return unsub;
  });

  async function handleDefaultEnabledChange(enabled: boolean) {
    await setAutoRefreshDefaultEnabled(enabled);
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

<section>
  <h2>Data Refresh</h2>
  <p class="description">
    Automatically refresh session data at the selected interval. Only active while the popup or
    settings page is visible.
  </p>
  <div class="interval-options">
    {#each intervalOptions as opt (opt.value)}
      <label class="interval-option" class:active={refreshInterval === opt.value}>
        <input
          type="radio"
          name="refresh-interval"
          value={opt.value}
          checked={refreshInterval === opt.value}
          onchange={() => handleIntervalChange(opt.value)}
        />
        <span class="option-label">{opt.label}</span>
      </label>
    {/each}
  </div>

  <div class="default-toggle">
    <label class="toggle-label">
      <input
        type="checkbox"
        checked={defaultEnabled}
        onchange={(e: Event) => handleDefaultEnabledChange((e.target as HTMLInputElement).checked)}
      />
      <span class="option-label">Enable auto-refresh by default for new domains</span>
    </label>
    <p class="description toggle-description">
      When enabled, newly discovered domains in sessions will have auto-refresh turned on
      automatically.
    </p>
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

  .description {
    font-size: var(--text-sm);
    color: var(--color-text-tertiary);
    margin: 0 0 var(--space-5);
    line-height: var(--leading-relaxed);
  }

  .interval-options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  .interval-option {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .interval-option:hover {
    background: var(--color-interactive-hover);
  }

  .interval-option.active {
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
  }

  .interval-option input {
    accent-color: var(--color-accent);
  }

  .default-toggle {
    margin-top: var(--space-5);
    padding-top: var(--space-5);
    border-top: 1px solid var(--color-border-secondary);
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    cursor: pointer;
  }

  .toggle-label input {
    accent-color: var(--color-accent);
  }

  .toggle-description {
    margin-top: var(--space-2);
    margin-left: calc(var(--space-3) + 16px);
  }
</style>
