<script lang="ts">
  interface Props {
    value: string;
    onsave: (newValue: string) => void;
    oncancel: () => void;
  }

  const { value, onsave, oncancel }: Props = $props();
  let inputValue = $state(value);
  let inputRef = $state<HTMLInputElement | undefined>(undefined);

  $effect(() => {
    inputRef?.focus();
    inputRef?.select();
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      oncancel();
    }
  }

  function submit() {
    const trimmed = inputValue.trim();
    if (trimmed && trimmed !== value) {
      onsave(trimmed);
    } else {
      oncancel();
    }
  }
</script>

<input
  class="inline-edit"
  type="text"
  bind:value={inputValue}
  bind:this={inputRef}
  onkeydown={handleKeydown}
  onblur={submit}
  aria-label="Edit name"
/>

<style>
  .inline-edit {
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    font-family: var(--font-sans);
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-sm);
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    width: 100%;
    outline: none;
  }
</style>
