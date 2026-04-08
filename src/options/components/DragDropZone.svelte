<script lang="ts">
  import Icon from '@shared/components/Icon.svelte';

  interface Props {
    onfiles: (files: FileList) => void;
    accept?: string;
  }

  let { onfiles, accept: _accept = '.json' }: Props = $props();
  let dragging = $state(false);

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragging = true;
  }

  function handleDragLeave() {
    dragging = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    if (e.dataTransfer?.files.length) {
      onfiles(e.dataTransfer.files);
    }
  }
</script>

<div
  class="drop-zone"
  class:dragging
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  role="region"
  aria-label="Drop files here"
>
  <div class="drop-icon">
    <Icon name="upload" size={20} />
  </div>
  <p class="drop-text">Drag and drop a JSON file here</p>
  <p class="drop-hint">or use the button below</p>
</div>

<style>
  .drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-7);
    border: 2px dashed var(--color-border-primary);
    border-radius: var(--radius-xl);
    color: var(--color-text-tertiary);
    text-align: center;
    transition: all var(--transition-smooth);
    background: var(--color-bg-secondary);
  }

  .drop-zone:hover {
    border-color: var(--color-text-tertiary);
    background: var(--color-bg-tertiary);
  }

  .drop-zone.dragging {
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
    color: var(--color-accent);
  }

  .drop-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-lg);
    background: var(--color-bg-tertiary);
    transition: all var(--transition-fast);
  }

  .drop-zone.dragging .drop-icon {
    background: var(--color-accent-soft);
    color: var(--color-accent);
  }

  .drop-text {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-secondary);
  }

  .drop-zone.dragging .drop-text {
    color: var(--color-accent);
  }

  .drop-hint {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }
</style>
