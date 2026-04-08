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

<section>
  <h2>Data Management</h2>
  <button
    class="btn danger"
    onclick={() => (showClearConfirm = true)}
    disabled={sessions.length === 0}
  >
    <Icon name="alert-triangle" size={14} />
    Clear All Data
  </button>
  <p class="hint">This removes all session profiles, saved cookies, and storage snapshots.</p>
</section>

<section>
  <h2>About</h2>
  <p>Unaware Sessions v0.1.0</p>
  <p class="hint">Privacy-first multi-session browser manager. Open-source, entirely local.</p>

  <div class="about-links">
    <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" class="link-btn">
      <Icon name="github" size={16} />
      GitHub Repository
      <Icon name="external-link" size={12} />
    </a>
  </div>
</section>

<section>
  <h2>Support the Project</h2>
  <p class="hint">
    If you find Unaware Sessions useful, consider supporting its development on Open Collective.
  </p>

  <div class="about-links">
    <a
      href="{OPENCOLLECTIVE_URL}/donate"
      target="_blank"
      rel="noopener noreferrer"
      class="link-btn sponsor"
    >
      <Icon name="heart" size={16} />
      Donate on Open Collective
      <Icon name="external-link" size={12} />
    </a>
    <a href={OPENCOLLECTIVE_URL} target="_blank" rel="noopener noreferrer" class="link-btn">
      <Icon name="globe" size={16} />
      View Sponsors &amp; Backers
      <Icon name="external-link" size={12} />
    </a>
  </div>
</section>

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
  section {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    box-shadow: var(--shadow-sm);
    margin-bottom: var(--space-6);
  }

  h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: 0 0 var(--space-5);
    color: var(--color-text-primary);
  }

  p {
    margin: var(--space-2) 0;
    font-size: var(--text-base);
    color: var(--color-text-primary);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    font-size: var(--text-base);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn.danger {
    color: var(--color-error);
    border-color: var(--color-error-border);
  }

  .btn.danger:hover:not(:disabled) {
    background: var(--color-error-soft);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .hint {
    font-size: var(--text-sm);
    color: var(--color-text-tertiary);
    margin: var(--space-4) 0 0;
  }

  .about-links {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-top: var(--space-5);
  }

  .link-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-5);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    color: var(--color-text-primary);
    text-decoration: none;
    cursor: pointer;
    transition: all var(--transition-fast);
    width: fit-content;
  }

  .link-btn:hover {
    background: var(--color-interactive-hover);
    border-color: var(--color-text-tertiary);
  }

  .link-btn.sponsor {
    color: #ef4444;
    border-color: #ef4444;
  }

  .link-btn.sponsor:hover {
    background: var(--color-error-soft);
  }
</style>
