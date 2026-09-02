<script lang="ts">
  import Icon from '@shared/components/Icon.svelte';

  interface Props {
    onfiles: (files: FileList) => void;
    accept?: string;
    /** Name of the file currently staged, shown instead of the prompt. */
    selectedName?: string;
  }

  let { onfiles, accept = '.json,application/json', selectedName = '' }: Props = $props();

  let dragging = $state(false);
  let dragDepth = 0;
  let inputRef = $state<HTMLInputElement | undefined>(undefined);

  // dragenter/dragleave fire for every child element the pointer crosses, so a
  // plain boolean flickers. Counting entries and exits keeps the highlight
  // steady while the pointer moves across the icon and the labels.
  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    dragDepth++;
    dragging = true;
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dragging = false;
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragDepth = 0;
    dragging = false;
    if (e.dataTransfer?.files.length) {
      onfiles(e.dataTransfer.files);
    }
  }

  function handleChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    if (input.files?.length) onfiles(input.files);
    // Reset so re-picking the same file still fires a change event.
    input.value = '';
  }
</script>

<!-- The zone is the button. Previously it was inert and pointed at a separate
     "Choose File" control below it, which is an extra step for no reason. -->
<button
  type="button"
  class="drop-zone"
  class:dragging
  class:has-file={!!selectedName}
  onclick={() => inputRef?.click()}
  ondragenter={handleDragEnter}
  ondragover={(e) => e.preventDefault()}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <span class="drop-icon">
    <Icon name={selectedName ? 'file-text' : 'upload'} size={20} />
  </span>
  {#if selectedName}
    <span class="drop-text">{selectedName}</span>
    <span class="drop-hint">Click or drop another file to replace it</span>
  {:else}
    <span class="drop-text">Drop a session export here, or click to browse</span>
    <span class="drop-hint">JSON files exported by Unaware Sessions</span>
  {/if}
</button>

<input
  bind:this={inputRef}
  type="file"
  {accept}
  class="sr-only"
  tabindex="-1"
  aria-hidden="true"
  onchange={handleChange}
/>

<style>
  .drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-7);
    border: 2px dashed var(--color-border-primary);
    border-radius: var(--radius-xl);
    color: var(--color-text-tertiary);
    text-align: center;
    transition: all var(--transition-smooth);
    background: var(--color-bg-secondary);
    font-family: var(--font-sans);
    cursor: pointer;
  }

  .drop-zone:hover {
    border-color: var(--color-accent-muted);
    background: var(--color-bg-tertiary);
  }

  .drop-zone:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .drop-zone.dragging,
  .drop-zone.has-file {
    border-color: var(--color-accent);
    background: var(--color-accent-soft);
    color: var(--color-accent);
    border-style: solid;
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

  .drop-zone.dragging .drop-icon,
  .drop-zone.has-file .drop-icon {
    background: var(--color-bg-elevated);
    color: var(--color-accent);
  }

  .drop-text {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .drop-zone.dragging .drop-text,
  .drop-zone.has-file .drop-text {
    color: var(--color-accent);
  }

  .drop-hint {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }
</style>
