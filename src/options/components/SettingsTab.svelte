<script lang="ts">
  import { getTheme, toggleTheme, onThemeChange } from '@shared/theme-store';
  import type { ThemePreference } from '@shared/theme-store';
  import {
    getAutoRefreshInterval,
    getAutoRefreshDefaultEnabled,
    getIsolationModeDefault,
    setAutoRefreshInterval,
    setAutoRefreshDefaultEnabled,
    setIsolationModeDefault,
    onSettingsChange,
  } from '@shared/settings-store';
  import type { AutoRefreshInterval, IsolationMode } from '@shared/types';
  import Icon from '@shared/components/Icon.svelte';

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
    { value: 0, label: 'Off' },
    { value: 60, label: '1m' },
    { value: 120, label: '2m' },
    { value: 300, label: '5m' },
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

  const themeOptions: { value: ThemePreference; label: string; icon: string }[] = [
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
    { value: 'system', label: 'System', icon: 'monitor' },
  ];

  // Isolation mode default
  let isolationDefault = $state<IsolationMode>(getIsolationModeDefault());

  $effect(() => {
    const unsub = onSettingsChange((settings) => {
      isolationDefault = settings.isolationModeDefault;
    });
    return unsub;
  });

  const isolationOptions: { value: IsolationMode; label: string; icon: string }[] = [
    { value: 'soft', label: 'Soft', icon: 'shield' },
    { value: 'strict', label: 'Strict', icon: 'lock' },
  ];

  async function handleIsolationDefaultChange(mode: IsolationMode) {
    await setIsolationModeDefault(mode);
  }
</script>

<div class="settings-layout">
  <!-- Appearance -->
  <section class="card">
    <div class="card-header">
      <div class="card-icon">
        <Icon name="sun" size={16} />
      </div>
      <div>
        <h2>Appearance</h2>
        <p class="description">Choose how Unaware Sessions looks to you.</p>
      </div>
    </div>

    <div class="theme-options">
      {#each themeOptions as opt}
        <button
          class="theme-option"
          class:active={theme === opt.value}
          onclick={() => setTheme(opt.value)}
          aria-pressed={theme === opt.value}
        >
          <Icon name={opt.icon} size={16} />
          <span>{opt.label}</span>
        </button>
      {/each}
    </div>
  </section>

  <!-- Cookie Isolation -->
  <section class="card">
    <div class="card-header">
      <div class="card-icon">
        <Icon name="shield" size={16} />
      </div>
      <div>
        <h2>Cookie Isolation</h2>
        <p class="description">
          Controls how cookies are handled when switching sessions on domains without saved data.
        </p>
      </div>
    </div>

    <div class="setting-row">
      <span class="setting-label">Default mode</span>
      <div class="interval-options">
        {#each isolationOptions as opt (opt.value)}
          <button
            class="interval-pill"
            class:active={isolationDefault === opt.value}
            onclick={() => handleIsolationDefaultChange(opt.value)}
            aria-pressed={isolationDefault === opt.value}
          >
            <Icon name={opt.icon} size={12} />
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="isolation-explainer">
      <div class="explainer-row">
        <Icon name="shield" size={14} />
        <div>
          <strong>Soft</strong> — Preserves cookies on domains where the target session has no saved data. Prevents breaking unrelated services (e.g., Google) when switching between domain-specific sessions.
        </div>
      </div>
      <div class="explainer-row">
        <Icon name="lock" size={14} />
        <div>
          <strong>Strict</strong> — Always clears cookies on switch, even when nothing will be restored. Use for domains that require full isolation between sessions.
        </div>
      </div>
    </div>
  </section>

  <!-- Data Refresh -->
  <section class="card">
    <div class="card-header">
      <div class="card-icon">
        <Icon name="refresh-cw" size={16} />
      </div>
      <div>
        <h2>Auto-Refresh</h2>
        <p class="description">
          Automatically refresh session data at the selected interval while the popup or settings page is visible.
        </p>
      </div>
    </div>

    <div class="setting-row">
      <span class="setting-label">Refresh interval</span>
      <div class="interval-options">
        {#each intervalOptions as opt (opt.value)}
          <button
            class="interval-pill"
            class:active={refreshInterval === opt.value}
            onclick={() => handleIntervalChange(opt.value)}
            aria-pressed={refreshInterval === opt.value}
          >
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="divider"></div>

    <label class="toggle-row">
      <div class="toggle-info">
        <span class="toggle-label">Auto-refresh for new domains</span>
        <span class="toggle-description">
          Newly discovered domains in sessions will have auto-refresh turned on automatically.
        </span>
      </div>
      <button
        class="toggle-switch"
        class:on={defaultEnabled}
        onclick={() => handleDefaultEnabledChange(!defaultEnabled)}
        role="switch"
        aria-checked={defaultEnabled}
        aria-label="Toggle auto-refresh for new domains"
      >
        <span class="toggle-thumb"></span>
      </button>
    </label>
  </section>
</div>

<style>
  .settings-layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .card {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-2xl);
    padding: var(--space-7);
    box-shadow: var(--shadow-xs);
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .card-header {
    display: flex;
    gap: var(--space-4);
    align-items: flex-start;
  }

  .card-icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-lg);
    background: var(--color-accent-soft);
    color: var(--color-accent);
    flex-shrink: 0;
  }

  h2 {
    font-size: var(--text-md);
    font-weight: var(--font-semibold);
    margin: 0;
    color: var(--color-text-primary);
    line-height: var(--leading-tight);
  }

  .description {
    font-size: var(--text-sm);
    color: var(--color-text-tertiary);
    margin: var(--space-1) 0 0;
    line-height: var(--leading-relaxed);
  }

  /* Theme options */
  .theme-options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .theme-option {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-lg);
    background: var(--color-bg-primary);
    cursor: pointer;
    transition: all var(--transition-smooth);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    font-family: var(--font-sans);
    color: var(--color-text-secondary);
    flex: 1;
    justify-content: center;
  }

  .theme-option:hover:not(.active) {
    background: var(--color-interactive-hover);
    border-color: var(--color-border-primary);
  }

  .theme-option.active {
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
    color: var(--color-accent);
    box-shadow: var(--shadow-glow);
  }

  /* Interval */
  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .setting-label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-secondary);
  }

  .interval-options {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border-secondary);
  }

  .interval-pill {
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

  .interval-pill:hover:not(.active) {
    color: var(--color-text-secondary);
    background: var(--color-interactive-hover);
  }

  .interval-pill.active {
    color: var(--color-text-primary);
    background: var(--color-bg-elevated);
    box-shadow: var(--shadow-xs);
  }

  .divider {
    height: 1px;
    background: var(--color-border-secondary);
    margin: 0;
  }

  /* Toggle row */
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
    cursor: pointer;
  }

  .toggle-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .toggle-label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-primary);
  }

  .toggle-description {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    line-height: var(--leading-relaxed);
  }

  /* Toggle switch */
  .toggle-switch {
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

  .toggle-switch.on {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }

  .toggle-switch:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    background: white;
    border-radius: var(--radius-full);
    box-shadow: var(--shadow-sm);
    transition: transform var(--transition-spring);
  }

  .toggle-switch.on .toggle-thumb {
    transform: translateX(18px);
  }

  /* Isolation explainer */
  .isolation-explainer {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    line-height: var(--leading-relaxed);
  }

  .explainer-row {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
  }

  .explainer-row :global(svg) {
    flex-shrink: 0;
    margin-top: 1px;
    color: var(--color-text-tertiary);
  }

  .explainer-row strong {
    color: var(--color-text-primary);
  }

  .interval-pill :global(svg) {
    vertical-align: -1px;
  }
</style>
