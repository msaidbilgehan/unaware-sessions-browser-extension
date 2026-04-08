<script lang="ts">
  import Icon from '@shared/components/Icon.svelte';

  interface Props {
    oncreate: () => void;
  }

  let { oncreate }: Props = $props();
</script>

<div class="onboarding">
  <div class="steps">
    <div class="step">
      <span class="step-number">1</span>
      <span class="step-text">Create a session</span>
    </div>
    <div class="step">
      <span class="step-number">2</span>
      <span class="step-text">Visit a website</span>
    </div>
    <div class="step">
      <span class="step-number">3</span>
      <span class="step-text">Switch sessions to keep data separate</span>
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
  }

  .steps {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }

  .step {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    text-align: left;
  }

  .step-number {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-full);
    background: var(--color-accent-soft);
    color: var(--color-accent);
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    flex-shrink: 0;
  }

  .step-text {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .create-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6);
    background: var(--color-accent);
    color: var(--color-text-inverse);
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .create-btn:hover {
    background: var(--color-accent-hover);
  }
</style>
