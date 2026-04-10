<script lang="ts">
  import Icon from '@shared/components/Icon.svelte';

  interface Props {
    oncreate: () => void;
  }

  let { oncreate }: Props = $props();
</script>

<div class="onboarding">
  <div class="shield-icon">
    <Icon name="shield" size={28} />
  </div>

  <h3>Private Browsing Sessions</h3>
  <p class="subtitle">Keep your accounts separate in one browser.</p>

  <div class="steps">
    <div class="step">
      <span class="step-number">1</span>
      <span class="step-text">Create a session</span>
    </div>
    <div class="step-connector"></div>
    <div class="step">
      <span class="step-number">2</span>
      <span class="step-text">Visit a website</span>
    </div>
    <div class="step-connector"></div>
    <div class="step">
      <span class="step-number">3</span>
      <span class="step-text">Switch to keep data separate</span>
    </div>
  </div>

  <button class="create-btn" onclick={oncreate}>
    <Icon name="plus" size={14} />
    Create your first session
  </button>
</div>

<style>
  .onboarding {
    text-align: center;
    padding: var(--space-6) var(--space-4);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
  }

  .shield-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-xl);
    background: var(--color-accent-soft);
    color: var(--color-accent);
  }

  h3 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: var(--font-bold);
    color: var(--color-text-primary);
  }

  .subtitle {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-tertiary);
  }

  .steps {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
    margin: var(--space-3) 0;
    width: 100%;
    max-width: 240px;
  }

  .step {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    text-align: left;
    width: 100%;
  }

  .step-connector {
    width: 1px;
    height: 12px;
    background: var(--color-border-primary);
    margin-left: 11px;
  }

  .step-number {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-full);
    background: var(--color-accent-soft);
    color: var(--color-accent);
    font-size: var(--text-xs);
    font-weight: var(--font-bold);
    flex-shrink: 0;
  }

  .step-text {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    line-height: var(--leading-snug);
  }

  .create-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6);
    background: var(--color-accent);
    color: var(--color-text-inverse);
    border: none;
    border-radius: var(--radius-lg);
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    font-family: var(--font-sans);
    cursor: pointer;
    transition: all var(--transition-smooth);
    box-shadow: var(--shadow-sm);
    margin-top: var(--space-2);
  }

  .create-btn:hover {
    background: var(--color-accent-hover);
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
  }

  .create-btn:active {
    transform: translateY(0);
    box-shadow: var(--shadow-xs);
  }

  .create-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }
</style>
