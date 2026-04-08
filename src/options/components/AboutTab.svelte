<script lang="ts">
  import type { SessionProfile } from '@shared/types';
  import ConfirmDialog from '@shared/components/ConfirmDialog.svelte';
  import { deleteSession as deleteSessionApi } from '@shared/api';
  import Icon from '@shared/components/Icon.svelte';
  import { GITHUB_URL, OPENCOLLECTIVE_URL } from '@shared/constants';

  interface Props {
    sessions: SessionProfile[];
    onupdate: () => void;
  }

  let { sessions, onupdate }: Props = $props();
  let showClearConfirm = $state(false);

  async function handleClearAll() {
    showClearConfirm = false;
    try {
      for (const session of sessions) {
        await deleteSessionApi(session.id);
      }
      onupdate();
    } catch (err) {
      console.error('[Unaware Sessions] Failed to clear all sessions:', err);
    }
  }
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
          <span class="badge version">v0.1.0</span>
          <span class="badge privacy">
            <Icon name="lock" size={9} />
            100% Local
          </span>
        </div>
      </div>
    </div>

    <p class="about-text">
      Privacy-first multi-session browser manager. Open-source, entirely local. Zero network calls, zero analytics, zero telemetry.
    </p>

    <div class="link-cards">
      <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" class="link-card">
        <div class="link-icon github">
          <Icon name="github" size={16} />
        </div>
        <div class="link-info">
          <span class="link-title">GitHub Repository</span>
          <span class="link-desc">Source code, issues, and contributions</span>
        </div>
        <Icon name="external-link" size={12} />
      </a>
    </div>
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

  <!-- Data Management card -->
  <section class="card danger-zone">
    <div class="card-header">
      <div class="card-icon danger">
        <Icon name="alert-triangle" size={16} />
      </div>
      <div>
        <h2>Data Management</h2>
        <p class="description">
          Remove all session profiles, saved cookies, and storage snapshots.
        </p>
      </div>
    </div>

    <button
      class="btn danger"
      onclick={() => (showClearConfirm = true)}
      disabled={sessions.length === 0}
    >
      <Icon name="trash-2" size={14} />
      Clear All Data
      {#if sessions.length > 0}
        <span class="count">({sessions.length} session{sessions.length === 1 ? '' : 's'})</span>
      {/if}
    </button>
  </section>
</div>

{#if showClearConfirm}
  <ConfirmDialog
    title="Clear All Data"
    message="Delete ALL sessions and their data? This cannot be undone. All session profiles, cookies, and storage snapshots will be permanently removed."
    confirmLabel="Clear All"
    danger={true}
    onconfirm={handleClearAll}
    oncancel={() => (showClearConfirm = false)}
  />
{/if}

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

  .card.danger-zone {
    border-color: var(--color-error-border);
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

  .card-icon.danger {
    background: var(--color-warning-soft);
    color: var(--color-warning);
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
    font-size: 10px;
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

  /* Danger button */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6);
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-lg);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
    width: fit-content;
  }

  .btn.danger {
    color: var(--color-error);
    border-color: var(--color-error-border);
  }

  .btn.danger:hover:not(:disabled) {
    background: var(--color-error-soft);
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .count {
    font-weight: var(--font-normal);
    opacity: 0.7;
  }
</style>
