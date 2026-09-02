<script lang="ts">
  import { untrack } from 'svelte';
  interface Props {
    value: string;
    onsave: (newValue: string) => void;
    oncancel: () => void;
  }

  const { value, onsave, oncancel }: Props = $props();
  // Seeded once on purpose: a background rename landing mid-edit must not
  // overwrite what the user is typing.
  let inputValue = $state(untrack(() => value));
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
