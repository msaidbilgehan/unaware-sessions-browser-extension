<script lang="ts">
  import Icon from '@shared/components/Icon.svelte';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  let dialogRef = $state<HTMLDivElement | undefined>(undefined);
  let openPopupShortcut = $state('');

  // Surface the user's actual browser-level shortcut rather than the manifest
  // default — it is remappable at chrome://extensions/shortcuts.
  $effect(() => {
    chrome.commands
      ?.getAll?.()
      .then((commands) => {
        openPopupShortcut = commands.find((c) => c.name === '_execute_action')?.shortcut ?? '';
      })
      .catch(() => {
        openPopupShortcut = '';
      });
  });

  $effect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef?.focus();
    return () => opener?.focus?.();
  });

  function handleKeydown(e: KeyboardEvent) {
    // Any key closes would swallow Tab and screen-reader navigation; only the
    // conventional dismiss keys do.
    if (e.key === 'Escape' || e.key === '?') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    }
  }

  const groups: { title: string; rows: { keys: string[]; description: string }[] }[] = [
    {
      title: 'Session list',
      rows: [
        { keys: ['1', '–', '9'], description: 'Switch this tab to that session' },
        { keys: ['N'], description: 'New session' },
        { keys: ['/'], description: 'Search sessions and sites' },
        { keys: ['?'], description: 'Show this help' },
        { keys: ['Esc'], description: 'Close search, dialog, or this panel' },
      ],
    },
    {
      title: 'On a focused session',
      rows: [
        { keys: ['Enter'], description: 'Switch to it' },
        { keys: ['F2'], description: 'Rename' },
        { keys: ['Del'], description: 'Delete (undoable for a few seconds)' },
        { keys: ['→', '←'], description: 'Show or hide its saved data' },
        { keys: ['Menu'], description: 'Open the actions menu (or right-click)' },
      ],
    },
  ];
</script>

<div class="backdrop" onclick={onclose} role="presentation">
  <div
    class="sheet"
    bind:this={dialogRef}
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby="shortcuts-title"
    onclick={(e) => e.stopPropagation()}
    onkeydown={handleKeydown}
  >
    <div class="sheet-head">
      <span class="head-icon"><Icon name="keyboard" size={15} /></span>
      <h3 id="shortcuts-title">Keyboard shortcuts</h3>
      <button class="close-btn" onclick={onclose} aria-label="Close shortcuts">
        <Icon name="x" size={13} />
      </button>
    </div>

    {#each groups as group (group.title)}
      <div class="group">
        <span class="group-title">{group.title}</span>
        {#each group.rows as row (row.description)}
          <div class="row">
            <span class="keys">
              {#each row.keys as key (key)}
                {#if key === '–'}
                  <span class="key-sep">–</span>
                {:else}
                  <kbd>{key}</kbd>
                {/if}
              {/each}
            </span>
            <span class="description">{row.description}</span>
          </div>
        {/each}
      </div>
    {/each}

    {#if openPopupShortcut}
      <div class="group">
        <span class="group-title">Anywhere in the browser</span>
        <div class="row">
          <span class="keys"><kbd>{openPopupShortcut}</kbd></span>
          <span class="description">Open this popup</span>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: var(--color-bg-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-5);
    z-index: var(--z-modal);
    backdrop-filter: blur(2px);
    animation: fadeIn var(--transition-fast) ease;
  }

  .sheet {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-xl);
    padding: var(--space-6);
    width: 100%;
    max-height: 100%;
    overflow-y: auto;
    box-shadow: var(--shadow-xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    animation: scaleIn var(--transition-fast) ease;
  }

  .sheet:focus {
    outline: none;
  }

  .sheet-head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .head-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: var(--radius-md);
    background: var(--color-accent-soft);
    color: var(--color-accent);
    flex-shrink: 0;
  }

  h3 {
    margin: 0;
    flex: 1;
    font-size: var(--text-md);
    font-weight: var(--font-semibold);
    color: var(--color-text-primary);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    display: flex;
    transition: all var(--transition-fast);
  }

  .close-btn:hover {
    color: var(--color-text-primary);
    background: var(--color-interactive-hover);
  }

  .close-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .group-title {
    font-size: var(--text-2xs);
    font-weight: var(--font-semibold);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: var(--space-1);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .keys {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    width: 84px;
    flex-shrink: 0;
  }

  .key-sep {
    font-size: var(--text-2xs);
    color: var(--color-text-tertiary);
  }

  kbd {
    font-family: var(--font-sans);
    font-size: var(--text-2xs);
    font-weight: var(--font-semibold);
    color: var(--color-text-secondary);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-primary);
    border-bottom-width: 2px;
    border-radius: var(--radius-sm);
    padding: 0 var(--space-3);
    line-height: 17px;
    white-space: nowrap;
  }

  .description {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    line-height: var(--leading-snug);
  }
</style>
