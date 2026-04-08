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
  <Icon name="upload" size={24} />
  <p>Drag and drop a JSON file here</p>
  <p class="hint">or use the import button below</p>
</div>

<style>
  .drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-7);
    border: 2px dashed var(--color-border-primary);
    border-radius: var(--radius-lg);
    color: var(--color-text-tertiary);
    text-align: center;
    transition: all var(--transition-fast);
  }

  .drop-zone.dragging {
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
    color: var(--color-accent);
  }

  p {
    margin: 0;
    font-size: var(--text-sm);
  }

  .hint {
    font-size: var(--text-xs);
  }
</style>
