<script lang="ts">
  import type { StorageCleanupCategory } from '@shared/types';
  import Icon from '@shared/components/Icon.svelte';

  interface Props {
    categories: StorageCleanupCategory[];
    thresholdKb: number;
    scanning: boolean;
    oncategorieschange: (categories: StorageCleanupCategory[]) => void;
    onthresholdchange: (thresholdKb: number) => void;
    onscan: () => void;
  }

  let {
    categories,
    thresholdKb,
    scanning,
    oncategorieschange,
    onthresholdchange,
    onscan,
  }: Props = $props();

  const options: Array<{ value: StorageCleanupCategory; label: string; detail: string }> = [
    {
      value: 'localStorage',
      label: 'LocalStorage',
      detail: '按键扫描已保存的本地数据',
    },
    {
      value: 'sessionStorage',
      label: 'SessionStorage',
      detail: '按键扫描已保存的临时数据',
    },
    {
      value: 'indexedDB',
      label: 'IndexedDB',
      detail: '按数据库扫描已保存的结构化数据',
    },
  ];

  function toggleCategory(category: StorageCleanupCategory) {
    if (categories.includes(category)) {
      oncategorieschange(categories.filter((entry) => entry !== category));
    } else {
      oncategorieschange([...categories, category]);
    }
  }

  function handleThreshold(event: Event) {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    onthresholdchange(Number.isFinite(value) ? Math.max(1, Math.round(value)) : 30);
  }
</script>

<section class="scanner-card">
  <div class="scanner-hero">
    <div class="scanner-orbit" class:active={scanning}>
      <div class="scanner-core">
        <Icon name="shield" size={28} />
      </div>
    </div>
    <div class="hero-copy">
      <span class="eyebrow">站点数据清理</span>
      <h2>扫描大数据项</h2>
      <p>像安全软件清理垃圾一样，扫描扩展中占用较大的站点快照，扫描不会自动删除。</p>
    </div>
  </div>

  <div class="scope-grid">
    {#each options as option}
      <label class="scope-option" class:selected={categories.includes(option.value)}>
        <input
          type="checkbox"
          checked={categories.includes(option.value)}
          onchange={() => toggleCategory(option.value)}
        />
        <span class="check-mark"><Icon name="check" size={11} /></span>
        <span class="scope-copy">
          <strong>{option.label}</strong>
          <small>{option.detail}</small>
        </span>
      </label>
    {/each}
  </div>

  <div class="scan-controls">
    <label class="threshold-field">
      <span>最小数据项大小</span>
      <span class="input-shell">
        <input
          type="number"
          min="1"
          max="1048576"
          value={thresholdKb}
          oninput={handleThreshold}
        />
        <span>KB</span>
      </span>
    </label>
    <button class="scan-button" onclick={onscan} disabled={scanning || categories.length === 0}>
      {#if scanning}
        <span class="spinner"></span>
        正在扫描...
      {:else}
        <Icon name="search" size={15} />
        一键扫描
      {/if}
    </button>
  </div>
</section>

<style>
  .scanner-card {
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    padding: var(--space-7);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-2xl);
    background:
      linear-gradient(135deg, var(--color-accent-soft), transparent 42%),
      var(--color-bg-elevated);
    box-shadow: var(--shadow-xs);
  }

  .scanner-card::after {
    content: '';
    position: absolute;
    width: 180px;
    height: 180px;
    right: -90px;
    top: -100px;
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-full);
    opacity: 0.65;
    pointer-events: none;
  }

  .scanner-hero {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    position: relative;
    z-index: 1;
  }

  .scanner-orbit {
    width: 72px;
    height: 72px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-full);
    border: 1px dashed var(--color-accent);
    background: var(--color-bg-elevated);
    flex-shrink: 0;
  }

  .scanner-orbit.active {
    animation: orbit 1.6s linear infinite;
  }

  .scanner-core {
    width: 50px;
    height: 50px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-full);
    background: var(--color-accent);
    color: var(--color-text-inverse);
    box-shadow: var(--shadow-glow);
  }

  .scanner-orbit.active .scanner-core {
    animation: counter-orbit 1.6s linear infinite;
  }

  .hero-copy {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .eyebrow {
    font-size: var(--text-2xs);
    font-weight: var(--font-bold);
    color: var(--color-accent);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    font-size: var(--text-xl);
    color: var(--color-text-primary);
  }

  p {
    margin: 0;
    font-size: var(--text-sm);
    line-height: var(--leading-relaxed);
    color: var(--color-text-tertiary);
  }

  .scope-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-3);
  }

  .scope-option {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-4);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-xl);
    background: var(--color-bg-primary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .scope-option:hover {
    border-color: var(--color-border-primary);
    transform: translateY(-1px);
  }

  .scope-option.selected {
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
  }

  .scope-option input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .check-mark {
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-sm);
    color: transparent;
    background: var(--color-bg-elevated);
    flex-shrink: 0;
  }

  .selected .check-mark {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-text-inverse);
  }

  .scope-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: var(--space-1);
  }

  .scope-copy strong {
    font-size: var(--text-xs);
    color: var(--color-text-primary);
  }

  .scope-copy small {
    font-size: var(--text-2xs);
    line-height: var(--leading-snug);
    color: var(--color-text-tertiary);
  }

  .scan-controls {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-5);
    padding-top: var(--space-5);
    border-top: 1px solid var(--color-border-secondary);
  }

  .threshold-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    color: var(--color-text-secondary);
  }

  .input-shell {
    display: flex;
    align-items: center;
    overflow: hidden;
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-lg);
    background: var(--color-bg-primary);
  }

  .input-shell:focus-within {
    border-color: var(--color-accent);
    box-shadow: var(--shadow-focus);
  }

  .input-shell input {
    width: 90px;
    padding: var(--space-3) var(--space-4);
    border: none;
    outline: none;
    background: transparent;
    color: var(--color-text-primary);
    font: inherit;
  }

  .input-shell > span {
    padding: var(--space-3) var(--space-4);
    border-left: 1px solid var(--color-border-secondary);
    color: var(--color-text-tertiary);
    background: var(--color-bg-secondary);
  }

  .scan-button {
    min-width: 150px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-7);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-lg);
    background: var(--color-accent);
    color: var(--color-text-inverse);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    transition: all var(--transition-fast);
  }

  .scan-button:hover:not(:disabled) {
    background: var(--color-accent-hover);
    transform: translateY(-1px);
  }

  .scan-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: var(--radius-full);
    animation: spin 0.7s linear infinite;
  }

  @keyframes orbit {
    to { transform: rotate(360deg); }
  }

  @keyframes counter-orbit {
    to { transform: rotate(-360deg); }
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
