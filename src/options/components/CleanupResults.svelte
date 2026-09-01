<script lang="ts">
  import type { StorageCleanupItem } from '@shared/types';
  import Icon from '@shared/components/Icon.svelte';

  interface Props {
    items: StorageCleanupItem[];
    selectedIds: string[];
    scannedSnapshots: number;
    totalBytes: number;
    cleaning: boolean;
    onselectionchange: (ids: string[]) => void;
    onclean: () => void;
  }

  let {
    items,
    selectedIds,
    scannedSnapshots,
    totalBytes,
    cleaning,
    onselectionchange,
    onclean,
  }: Props = $props();

  const selectedSet = $derived(new Set(selectedIds));
  const selectedItems = $derived(items.filter((item) => selectedSet.has(item.id)));
  const selectedBytes = $derived(
    selectedItems.reduce((sum, item) => sum + item.sizeBytes, 0),
  );

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function categoryLabel(item: StorageCleanupItem): string {
    if (item.category === 'indexedDB') return 'IndexedDB';
    return item.category === 'localStorage' ? 'LocalStorage' : 'SessionStorage';
  }

  function toggle(id: string) {
    if (selectedSet.has(id)) onselectionchange(selectedIds.filter((entry) => entry !== id));
    else onselectionchange([...selectedIds, id]);
  }

  function toggleAll() {
    onselectionchange(selectedIds.length === items.length ? [] : items.map((item) => item.id));
  }
</script>

<section class="results-card">
  <div class="results-header">
    <div>
      <span class="eyebrow">扫描报告</span>
      <h2>发现 {items.length} 个大数据项</h2>
    </div>
    <div class="summary-chips">
      <span>已扫描 {scannedSnapshots} 个站点快照</span>
      <span class="size-chip">{formatBytes(totalBytes)}</span>
    </div>
  </div>

  {#if items.length === 0}
    <div class="clean-state">
      <span class="clean-icon"><Icon name="check" size={22} /></span>
      <strong>暂未发现大数据项</strong>
      <p>当前扫描范围内没有超过阈值的数据，无需清理。</p>
    </div>
  {:else}
    <div class="selection-bar">
      <button class="select-all" onclick={toggleAll}>
        {selectedIds.length === items.length ? '取消全选' : '全选'}
      </button>
      <span>
        已选择 {selectedItems.length} 项，共 {formatBytes(selectedBytes)}
      </span>
    </div>

    <div class="result-list">
      {#each items as item (item.id)}
        <label class="result-row" class:selected={selectedSet.has(item.id)}>
          <input
            type="checkbox"
            checked={selectedSet.has(item.id)}
            onchange={() => toggle(item.id)}
          />
          <span class="row-check"><Icon name="check" size={10} /></span>
          <span class="item-main">
            <span class="item-topline">
              <strong title={item.key}>{item.key}</strong>
              <span class="type-badge">{categoryLabel(item)}</span>
            </span>
            <span class="item-meta">
              <span>{item.sessionName}</span>
              <span class="dot">•</span>
              <span title={item.origin}>{item.origin.replace(/^https?:\/\//, '')}</span>
            </span>
          </span>
          <span class="item-size">{formatBytes(item.sizeBytes)}</span>
        </label>
      {/each}
    </div>

    <div class="clean-action-bar">
      <div class="selection-total">
        <small>预计可清理</small>
        <strong>{formatBytes(selectedBytes)}</strong>
      </div>
      <button class="clean-button" onclick={onclean} disabled={cleaning || selectedIds.length === 0}>
        {#if cleaning}
          <span class="spinner"></span>
          正在清理...
        {:else}
          <Icon name="trash-2" size={14} />
          立即清理
        {/if}
      </button>
    </div>
  {/if}
</section>

<style>
  .results-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding: var(--space-7);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-2xl);
    background: var(--color-bg-elevated);
    box-shadow: var(--shadow-xs);
  }

  .results-header,
  .selection-bar,
  .clean-action-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-5);
  }

  .eyebrow {
    display: block;
    margin-bottom: var(--space-1);
    font-size: var(--text-2xs);
    font-weight: var(--font-bold);
    color: var(--color-accent);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    font-size: var(--text-lg);
    color: var(--color-text-primary);
  }

  .summary-chips {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  .summary-chips span {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-full);
    background: var(--color-bg-tertiary);
  }

  .summary-chips .size-chip {
    color: var(--color-warning);
    background: var(--color-warning-soft);
    font-weight: var(--font-semibold);
  }

  .selection-bar {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    background: var(--color-bg-secondary);
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  .select-all {
    padding: 0;
    border: none;
    background: none;
    color: var(--color-accent);
    font: inherit;
    font-weight: var(--font-semibold);
    cursor: pointer;
  }

  .result-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-height: 390px;
    overflow-y: auto;
  }

  .result-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-xl);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .result-row:hover {
    border-color: var(--color-border-primary);
    background: var(--color-interactive-hover);
  }

  .result-row.selected {
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
  }

  .result-row input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .row-check {
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-sm);
    background: var(--color-bg-primary);
    color: transparent;
    flex-shrink: 0;
  }

  .selected .row-check {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-text-inverse);
  }

  .item-main {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: var(--space-1);
  }

  .item-topline,
  .item-meta {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: var(--space-2);
  }

  .item-topline strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-sm);
    color: var(--color-text-primary);
  }

  .type-badge {
    padding: 1px var(--space-2);
    border-radius: var(--radius-full);
    background: var(--color-bg-tertiary);
    color: var(--color-text-tertiary);
    font-size: var(--text-2xs);
    flex-shrink: 0;
  }

  .item-meta {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  .item-meta span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dot { opacity: 0.5; }

  .item-size {
    font-size: var(--text-sm);
    font-weight: var(--font-bold);
    color: var(--color-warning);
    flex-shrink: 0;
  }

  .clean-action-bar {
    padding-top: var(--space-5);
    border-top: 1px solid var(--color-border-secondary);
  }

  .selection-total {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .selection-total small { color: var(--color-text-tertiary); }
  .selection-total strong { color: var(--color-text-primary); font-size: var(--text-lg); }

  .clean-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    min-width: 150px;
    padding: var(--space-4) var(--space-6);
    border: 1px solid var(--color-error-border);
    border-radius: var(--radius-lg);
    background: var(--color-error-soft);
    color: var(--color-error);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .clean-button:hover:not(:disabled) {
    border-color: var(--color-error);
    transform: translateY(-1px);
  }

  .clean-button:disabled { opacity: 0.45; cursor: not-allowed; }

  .clean-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-8);
    text-align: center;
  }

  .clean-icon {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-full);
    background: var(--color-success-soft);
    color: var(--color-success);
  }

  .clean-state strong { color: var(--color-text-primary); }
  .clean-state p { margin: 0; color: var(--color-text-tertiary); font-size: var(--text-sm); }

  .spinner {
    width: 13px;
    height: 13px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: var(--radius-full);
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
</style>
