<script lang="ts">
  import Icon from '@shared/components/Icon.svelte';
  import {
    GITHUB_URL,
    OPENCOLLECTIVE_URL,
    PRIVACY_POLICY_URL,
    ISSUES_URL,
    CHANGELOG_URL,
  } from '@shared/constants';

  const extensionVersion = chrome.runtime.getManifest().version;

  const shortcuts: { key: string; description: string }[] = [
    { key: '1 – 9', description: 'Switch to that session' },
    { key: 'N', description: 'New session' },
    { key: '/', description: 'Search sessions and sites' },
    { key: '?', description: 'Show shortcuts' },
    { key: 'F2', description: 'Rename the focused session' },
    { key: 'Del', description: 'Delete the focused session' },
    { key: '→ / ←', description: 'Show or hide saved data' },
    { key: 'Esc', description: 'Close or go back' },
  ];
</script>

<div class="about-layout">
  <!-- About card -->
  <section class="card">
    <div class="card-header">
      <div class="card-icon">
        <Icon name="shield" size={16} />
      </div>
      <div>
        <h2>Unaware Sessions</h2>
        <div class="badges">
          <span class="badge version">v{extensionVersion}</span>
          <span class="badge privacy">
            <Icon name="lock" size={9} />
            100% Local
          </span>
        </div>
      </div>
    </div>

    <p class="about-text">
      Keep several signed-in identities apart in one browser window. Everything stays on this
      device: no analytics, no telemetry, and no network calls at all unless you switch on Google
      Drive sync yourself.
    </p>

    <div class="link-cards">
      <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" class="link-card">
        <div class="link-icon github">
          <Icon name="github" size={16} />
        </div>
        <div class="link-info">
          <span class="link-title">Source code</span>
          <span class="link-desc">Read exactly what the extension does, on GitHub</span>
        </div>
        <Icon name="external-link" size={12} />
      </a>

      <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer" class="link-card">
        <div class="link-icon">
          <Icon name="lock" size={16} />
        </div>
        <div class="link-info">
          <span class="link-title">Privacy policy</span>
          <span class="link-desc">What is stored, where it stays, and what never leaves</span>
        </div>
        <Icon name="external-link" size={12} />
      </a>

      <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer" class="link-card">
        <div class="link-icon">
          <Icon name="alert-circle" size={16} />
        </div>
        <div class="link-info">
          <span class="link-title">Report a problem</span>
          <span class="link-desc">Bugs, missing features and questions</span>
        </div>
        <Icon name="external-link" size={12} />
      </a>

      <a href={CHANGELOG_URL} target="_blank" rel="noopener noreferrer" class="link-card">
        <div class="link-icon">
          <Icon name="file-text" size={16} />
        </div>
        <div class="link-info">
          <span class="link-title">What's new in v{extensionVersion}</span>
          <span class="link-desc">Full changelog</span>
        </div>
        <Icon name="external-link" size={12} />
      </a>
    </div>
  </section>

  <!-- Keyboard shortcuts -->
  <section class="card">
    <div class="card-header">
      <div class="card-icon">
        <Icon name="keyboard" size={16} />
      </div>
      <div>
        <h2>Keyboard shortcuts</h2>
        <p class="description">
          Available in the popup. Press <kbd>?</kbd> there to see this list in place.
        </p>
      </div>
    </div>

    <div class="shortcut-grid">
      {#each shortcuts as row (row.description)}
        <div class="shortcut-row">
          <kbd>{row.key}</kbd>
          <span class="shortcut-desc">{row.description}</span>
        </div>
      {/each}
    </div>

    <p class="hint">
      The browser-level shortcut that opens the popup can be changed at
      <code>chrome://extensions/shortcuts</code>.
    </p>
  </section>

  <!-- Support card -->
  <section class="card">
    <div class="card-header">
      <div class="card-icon sponsor">
        <Icon name="heart" size={16} />
      </div>
      <div>
        <h2>Support the Project</h2>
        <p class="description">
          If you find Unaware Sessions useful, consider supporting its development.
        </p>
      </div>
    </div>

    <div class="link-cards">
      <a
        href="{OPENCOLLECTIVE_URL}/donate"
        target="_blank"
        rel="noopener noreferrer"
        class="link-card sponsor"
      >
        <div class="link-icon sponsor">
          <Icon name="heart" size={16} />
        </div>
        <div class="link-info">
          <span class="link-title">Donate on Open Collective</span>
          <span class="link-desc">Help fund development and hosting</span>
        </div>
        <Icon name="external-link" size={12} />
      </a>

      <a href={OPENCOLLECTIVE_URL} target="_blank" rel="noopener noreferrer" class="link-card">
        <div class="link-icon">
          <Icon name="globe" size={16} />
        </div>
        <div class="link-info">
          <span class="link-title">View Sponsors &amp; Backers</span>
          <span class="link-desc">See who supports this project</span>
        </div>
        <Icon name="external-link" size={12} />
      </a>
    </div>
  </section>
</div>

<style>
  .about-layout {
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
    gap: var(--space-5);
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

  .card-icon.sponsor {
    background: var(--color-error-soft);
    color: var(--color-error);
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

  .badges {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-2xs);
    font-weight: var(--font-semibold);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
    line-height: 14px;
  }

  .badge.version {
    background: var(--color-accent-soft);
    color: var(--color-accent);
  }

  .badge.privacy {
    background: var(--color-success-soft);
    color: var(--color-success);
  }

  .about-text {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin: 0;
    line-height: var(--leading-relaxed);
  }

  /* Link cards */
  .link-cards {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .link-card {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-xl);
    text-decoration: none;
    color: var(--color-text-secondary);
    transition: all var(--transition-smooth);
  }

  .link-card:hover {
    background: var(--color-interactive-hover);
    border-color: var(--color-border-primary);
    box-shadow: var(--shadow-xs);
  }

  .link-card.sponsor:hover {
    border-color: var(--color-error-border);
    background: var(--color-error-soft);
  }

  .link-icon {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    background: var(--color-bg-tertiary);
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }

  .link-icon.github {
    background: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }

  .link-icon.sponsor {
    background: var(--color-error-soft);
    color: var(--color-error);
  }

  .link-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .link-title {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-primary);
  }

  .link-desc {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  .link-card > :global(svg:last-child) {
    color: var(--color-text-tertiary);
    flex-shrink: 0;
  }

  .shortcut-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--space-3) var(--space-6);
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .shortcut-desc {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  kbd {
    font-family: var(--font-sans);
    font-size: var(--text-2xs);
    font-weight: var(--font-semibold);
    color: var(--color-text-secondary);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-primary);
    border-bottom-width: 2px;
    border-radius: var(--radius-sm);
    padding: 0 var(--space-3);
    line-height: 17px;
    white-space: nowrap;
    min-width: 52px;
    text-align: center;
    flex-shrink: 0;
  }

  .hint {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    line-height: var(--leading-relaxed);
  }

  code {
    font-size: var(--text-xs);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-sm);
    padding: 1px var(--space-2);
  }
</style>
