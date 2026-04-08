<script lang="ts">
  import type { SessionProfile } from '@shared/types';
  import { updateSession, deleteSession as deleteSessionApi } from '@shared/api';
  import Icon from '@shared/components/Icon.svelte';
  import InlineEdit from '@shared/components/InlineEdit.svelte';
  import ColorPicker from '@shared/components/ColorPicker.svelte';
  import ConfirmDialog from '@shared/components/ConfirmDialog.svelte';
  import StorageDashboard from './StorageDashboard.svelte';

  interface Props {
    sessions: SessionProfile[];
    onupdate: () => void;
  }

  let { sessions, onupdate }: Props = $props();
  let editingId = $state<string | null>(null);
  let colorEditId = $state<string | null>(null);
  let confirmData = $state<{ session: SessionProfile } | null>(null);

  async function handleRename(sessionId: string, newName: string) {
    try {
      await updateSession(sessionId, { name: newName });
      editingId = null;
      onupdate();
    } catch (err) {
      console.error('Failed to rename session:', err);
    }
  }

  async function handleColorChange(sessionId: string, color: string) {
    try {
      await updateSession(sessionId, { color });
      onupdate();
    } catch (err) {
      console.error('Failed to update color:', err);
    }
  }

  async function handlePinToggle(sessionId: string, currentPinned: boolean) {
    try {
      await updateSession(sessionId, { pinned: !currentPinned });
      onupdate();
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  }

  async function executeDelete(sessionId: string) {
    confirmData = null;
    try {
      await deleteSessionApi(sessionId);
      onupdate();
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  }
</script>

<section>
  <h2>Sessions ({sessions.length})</h2>
  {#if sessions.length === 0}
    <p class="empty">No sessions created yet.</p>
  {:else}
    <div class="session-table">
      <div class="table-header">
        <span>Color</span>
        <span>Name</span>
        <span>Created</span>
        <span>Actions</span>
      </div>
      {#each sessions as session (session.id)}
        <div class="table-row" style="--row-color: {session.color}">
          <span class="color-cell">
            {#if colorEditId === session.id}
              <div
                class="color-edit-popover"
                onclick={(e) => e.stopPropagation()}
                onkeydown={(e) => e.stopPropagation()}
                role="presentation"
              >
                <ColorPicker
                  selected={session.color}
                  onchange={(c) => handleColorChange(session.id, c)}
                />
                <button class="close-color" onclick={() => (colorEditId = null)}>
                  <Icon name="check" size={12} />
                </button>
              </div>
            {:else}
              <button
                class="dot"
                style="background-color: {session.color}"
                onclick={() => (colorEditId = session.id)}
                aria-label="Change color for {session.name}"
              ></button>
            {/if}
          </span>
          <span class="name-cell">
            {#if editingId === session.id}
              <InlineEdit
                value={session.name}
                onsave={(v) => handleRename(session.id, v)}
                oncancel={() => (editingId = null)}
              />
            {:else}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <span class="name" ondblclick={() => (editingId = session.id)} title={session.name}>
                {session.emoji ?? ''}
                {session.name}
              </span>
            {/if}
          </span>
          <span class="date">{new Date(session.createdAt).toLocaleDateString()}</span>
          <span class="actions-cell">
            <button
              class="icon-btn"
              onclick={() => handlePinToggle(session.id, !!session.pinned)}
              aria-label={session.pinned ? 'Unpin' : 'Pin'}
              title={session.pinned ? 'Unpin' : 'Pin'}
            >
              <Icon name="pin" size={14} />
            </button>
            <button
              class="icon-btn danger"
              onclick={() => (confirmData = { session })}
              aria-label="Delete session {session.name}"
            >
              <Icon name="trash-2" size={14} />
            </button>
          </span>
        </div>
      {/each}
    </div>
  {/if}
</section>

<StorageDashboard {sessions} />

{#if confirmData}
  <ConfirmDialog
    title="Delete Session"
    message={'Delete "' + confirmData.session.name + '"? All data will be permanently removed.'}
    confirmLabel="Delete"
    danger={true}
    onconfirm={() => confirmData && executeDelete(confirmData.session.id)}
    oncancel={() => (confirmData = null)}
  />
{/if}

<style>
  section {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    box-shadow: var(--shadow-sm);
  }

  h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: 0 0 var(--space-5);
    color: var(--color-text-primary);
  }

  .empty {
    color: var(--color-text-tertiary);
    font-size: var(--text-base);
  }

  .session-table {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--color-border-secondary);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .table-header,
  .table-row {
    display: grid;
    grid-template-columns: 40px 1fr 100px 80px;
    align-items: center;
    padding: var(--space-4) var(--space-5);
    background: var(--color-bg-elevated);
    gap: var(--space-4);
  }

  .table-row {
    border-left: 3px solid var(--row-color);
  }

  .table-header {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .color-cell {
    position: relative;
  }

  .dot {
    width: 14px;
    height: 14px;
    border-radius: var(--radius-full);
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .color-edit-popover {
    position: absolute;
    top: -8px;
    left: 24px;
    z-index: 10;
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-lg);
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .close-color {
    background: none;
    border: none;
    color: var(--color-success);
    cursor: pointer;
    padding: var(--space-1);
  }

  .name-cell {
    min-width: 0;
  }

  .name {
    font-size: var(--text-base);
    font-weight: var(--font-medium);
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
    cursor: default;
  }

  .date {
    font-size: var(--text-sm);
    color: var(--color-text-tertiary);
  }

  .actions-cell {
    display: flex;
    gap: var(--space-2);
  }

  .icon-btn {
    background: none;
    border: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    display: flex;
    transition: all var(--transition-fast);
  }

  .icon-btn:hover {
    color: var(--color-text-secondary);
    background: var(--color-interactive-hover);
  }

  .icon-btn.danger:hover {
    color: var(--color-error);
    background: var(--color-error-soft);
  }
</style>
