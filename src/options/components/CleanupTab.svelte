<script lang="ts">
  import type {
    StorageCleanupCategory,
    StorageCleanupItem,
    StorageCleanupResult,
  } from '@shared/types';
  import { cleanStorageItems, scanLargeStorage } from '@shared/api';
  import { checkAuth } from '@shared/auth-check';
  import AuthGate from '@shared/components/AuthGate.svelte';
  import ConfirmDialog from '@shared/components/ConfirmDialog.svelte';
  import Icon from '@shared/components/Icon.svelte';
  import CleanupScopePicker from './CleanupScopePicker.svelte';
  import CleanupResults from './CleanupResults.svelte';

  let categories = $state<StorageCleanupCategory[]>([
    'localStorage',
    'sessionStorage',
    'indexedDB',
  ]);
  let thresholdKb = $state(30);
  let result = $state<StorageCleanupResult | null>(null);
  let selectedIds = $state<string[]>([]);
  let scanning = $state(false);
  let cleaning = $state(false);
  let showConfirm = $state(false);
  let authGateData = $state<{ onauth: () => void } | null>(null);
  let notice = $state<{ kind: 'success' | 'error'; message: string } | null>(null);

  const selectedItems = $derived(
    result?.items.filter((item) => selectedIds.includes(item.id)) ?? [],
  );

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function scan() {
    scanning = true;
    selectedIds = [];
    notice = null;
    try {
      result = await scanLargeStorage({
        categories,
        minBytes: thresholdKb * 1024,
      });
    } catch (error) {
      notice = {
        kind: 'error',
        message: `扫描失败：${error instanceof Error ? error.message : String(error)}`,
      };
    } finally {
      scanning = false;
    }
  }

  async function withAuth(action: () => void | Promise<void>) {
    const authResult = await checkAuth();
    if (authResult !== 'auth-required') {
      await action();
      return;
    }
    authGateData = {
      onauth: () => {
        authGateData = null;
        void action();
      },
    };
  }

  async function cleanSelected() {
    const targets = selectedItems.map(({ sessionId, origin, category, key }) => ({
      sessionId,
      origin,
      category,
      key,
    }));
    if (targets.length === 0) return;

    showConfirm = false;
    await withAuth(async () => {
      cleaning = true;
      notice = null;
      try {
        const cleaned = await cleanStorageItems(targets);
        result = await scanLargeStorage({
          categories,
          minBytes: thresholdKb * 1024,
        });
        selectedIds = [];
        notice = {
          kind: 'success',
          message: `已清理 ${cleaned.removed} 项，释放 ${formatBytes(cleaned.reclaimedBytes)}。`,
        };
      } catch (error) {
        notice = {
          kind: 'error',
          message: `清理失败：${error instanceof Error ? error.message : String(error)}`,
        };
      } finally {
        cleaning = false;
      }
    });
  }

  function requestClean() {
    if (selectedItems.length > 0) showConfirm = true;
  }
</script>

<div class="cleanup-layout">
  <div class="snapshot-note">
    <Icon name="info" size={16} />
    <div>
      <strong>仅清理扩展保存的数据</strong>
      <span>不会操作网站当前正在使用的实时数据；清理后，对应会话下次恢复时将不再包含所选数据项。</span>
    </div>
  </div>

  <CleanupScopePicker
    {categories}
    {thresholdKb}
    {scanning}
    oncategorieschange={(value) => (categories = value)}
    onthresholdchange={(value) => (thresholdKb = value)}
    onscan={scan}
  />

  {#if notice}
    <div class="notice" class:success={notice.kind === 'success'} class:error={notice.kind === 'error'}>
      <Icon name={notice.kind === 'success' ? 'check' : 'alert-triangle'} size={15} />
      <span>{notice.message}</span>
    </div>
  {/if}

  {#if result}
    <CleanupResults
      items={result.items}
      {selectedIds}
      scannedSnapshots={result.scannedSnapshots}
      totalBytes={result.totalBytes}
      {cleaning}
      onselectionchange={(value) => (selectedIds = value)}
      onclean={requestClean}
    />
  {/if}
</div>

{#if showConfirm}
  <ConfirmDialog
    title="确认清理所选数据"
    message={`将从扩展保存的站点快照中删除 ${selectedItems.length} 项数据，预计释放 ${formatBytes(selectedItems.reduce((sum, item) => sum + item.sizeBytes, 0))}。此操作无法撤销。`}
    confirmLabel="确认清理"
    danger={true}
    onconfirm={cleanSelected}
    oncancel={() => (showConfirm = false)}
  />
{/if}

{#if authGateData}
  <AuthGate onauth={authGateData.onauth} oncancel={() => (authGateData = null)} />
{/if}

<style>
  .cleanup-layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .snapshot-note,
  .notice {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-xl);
    background: var(--color-bg-secondary);
    color: var(--color-text-tertiary);
  }

  .snapshot-note > :global(svg),
  .notice > :global(svg) {
    flex-shrink: 0;
    margin-top: 1px;
  }

  .snapshot-note div {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .snapshot-note strong {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
  }

  .snapshot-note span,
  .notice span {
    font-size: var(--text-xs);
    line-height: var(--leading-normal);
  }

  .notice.success {
    border-color: var(--color-success);
    background: var(--color-success-soft);
    color: var(--color-success);
  }

  .notice.error {
    border-color: var(--color-error-border);
    background: var(--color-error-soft);
    color: var(--color-error);
  }
</style>
