<script lang="ts">
  import type { SessionProfile, SessionDetails } from '@shared/types';
  import {
    updateSession,
    deleteSession as deleteSessionApi,
    getSessionDetails,
    deleteSessionOriginData,
  } from '@shared/api';
  import Icon from '@shared/components/Icon.svelte';
  import InlineEdit from '@shared/components/InlineEdit.svelte';
  import ColorPicker from '@shared/components/ColorPicker.svelte';
  import ConfirmDialog from '@shared/components/ConfirmDialog.svelte';

  interface Props {
    sessions: SessionProfile[];
    onupdate: () => void;
  }

  let { sessions, onupdate }: Props = $props();
  let searchQuery = $state('');
  let expandedSessionId = $state<string | null>(null);
  let sessionDetails = $state<SessionDetails | null>(null);
  let detailsLoading = $state(false);
  let editingId = $state<string | null>(null);
  let colorEditId = $state<string | null>(null);
  let confirmData = $state<{ session: SessionProfile } | null>(null);
  let originConfirm = $state<{ sessionId: string; origin: string } | null>(null);

  const filteredSessions = $derived(
    searchQuery
      ? sessions.filter(
          (s) =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (sessionDetails?.origins ?? []).some((o) =>
              o.origin.toLowerCase().includes(searchQuery.toLowerCase()),
            ),
        )
      : sessions,
  );

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
      if (expandedSessionId === sessionId) {
        expandedSessionId = null;
        sessionDetails = null;
      }
      onupdate();
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  }

  async function toggleDetails(sessionId: string) {
    if (expandedSessionId === sessionId) {
      expandedSessionId = null;
      sessionDetails = null;
      return;
    }
    expandedSessionId = sessionId;
    detailsLoading = true;
    try {
      sessionDetails = await getSessionDetails(sessionId);
    } catch (err) {
      console.error('Failed to load details:', err);
      sessionDetails = null;
    } finally {
      detailsLoading = false;
    }
  }

  async function handleDeleteOriginData(sessionId: string, origin: string) {
    originConfirm = null;
    try {
      await deleteSessionOriginData(sessionId, origin);
      // Reload details
      sessionDetails = await getSessionDetails(sessionId);
    } catch (err) {
      console.error('Failed to delete origin data:', err);
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleString();
  }
</script>

<section>
  <div class="section-header">
    <h2>Sessions ({sessions.length})</h2>
    <div class="search-box">
      <Icon name="search" size={14} />
      <input
        type="text"
        placeholder="Search sessions or domains..."
        bind:value={searchQuery}
        aria-label="Search sessions"
      />
    </div>
  </div>

  {#if filteredSessions.length === 0}
    <p class="empty">
      {searchQuery ? `No results for "${searchQuery}"` : 'No sessions created yet.'}
    </p>
  {:else}
    {#each filteredSessions as session (session.id)}
      <div class="session-card" style="--card-color: {session.color}">
        <div class="session-row">
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
              onclick={() => toggleDetails(session.id)}
              aria-label={expandedSessionId === session.id ? 'Collapse details' : 'Expand details'}
              title="View details"
            >
              <Icon
                name={expandedSessionId === session.id ? 'chevron-down' : 'chevron-right'}
                size={14}
              />
            </button>
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

        {#if expandedSessionId === session.id}
          <div class="details-panel">
            {#if detailsLoading}
              <p class="loading-text">Loading details...</p>
            {:else if sessionDetails && sessionDetails.origins.length > 0}
              <div class="details-summary">
                <span>{sessionDetails.origins.length} origin(s)</span>
                <span>{sessionDetails.totalCookies} cookies</span>
                <span>{formatBytes(sessionDetails.totalStorageBytes)} total</span>
              </div>

              {#each sessionDetails.origins as detail (detail.origin)}
                <div class="origin-card">
                  <div class="origin-header">
                    <Icon name="globe" size={12} />
                    <span class="origin-name">{detail.origin.replace(/^https?:\/\//, '')}</span>
                    <span class="origin-stats">
                      {detail.cookieCount} cookies &middot; {formatBytes(
                        detail.cookieBytes + detail.storageBytes,
                      )}
                    </span>
                    <button
                      class="icon-btn danger small"
                      onclick={() =>
                        (originConfirm = { sessionId: session.id, origin: detail.origin })}
                      aria-label="Delete data for {detail.origin}"
                      title="Delete origin data"
                    >
                      <Icon name="trash-2" size={12} />
                    </button>
                  </div>

                  <div class="origin-details">
                    {#if detail.cookieTimestamp}
                      <span class="detail-row"
                        >Cookies saved: {formatDate(detail.cookieTimestamp)}</span
                      >
                    {/if}
                    {#if detail.storageTimestamp}
                      <span class="detail-row"
                        >Storage saved: {formatDate(detail.storageTimestamp)}</span
                      >
                    {/if}
                    {#if detail.storageEntries > 0}
                      <span class="detail-row"
                        >{detail.storageEntries} storage entries &middot; {detail.idbDatabases} IDB database(s)</span
                      >
                    {/if}
                  </div>

                  {#if detail.cookies.length > 0}
                    <details class="cookie-list">
                      <summary>Cookies ({detail.cookies.length})</summary>
                      <table class="cookie-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Domain</th>
                            <th>Secure</th>
                            <th>HttpOnly</th>
                          </tr>
                        </thead>
                        <tbody>
                          {#each detail.cookies as cookie}
                            <tr>
                              <td class="cookie-name" title={cookie.name}>{cookie.name}</td>
                              <td class="cookie-domain">{cookie.domain}</td>
                              <td>{cookie.secure ? 'Yes' : 'No'}</td>
                              <td>{cookie.httpOnly ? 'Yes' : 'No'}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </details>
                  {/if}
                </div>
              {/each}
            {:else}
              <p class="empty-details">No saved data for this session.</p>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  {/if}
</section>

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

{#if originConfirm}
  <ConfirmDialog
    title="Delete Origin Data"
    message={'Delete all saved cookies and storage for ' + originConfirm.origin + '?'}
    confirmLabel="Delete"
    danger={true}
    onconfirm={() =>
      originConfirm && handleDeleteOriginData(originConfirm.sessionId, originConfirm.origin)}
    oncancel={() => (originConfirm = null)}
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

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-5);
  }

  h2 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: 0;
    color: var(--color-text-primary);
    white-space: nowrap;
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    flex: 1;
    max-width: 280px;
  }

  .search-box:focus-within {
    border-color: var(--color-accent);
  }

  .search-box input {
    flex: 1;
    border: none;
    outline: none;
    font-size: var(--text-sm);
    font-family: var(--font-sans);
    background: transparent;
    color: var(--color-text-primary);
  }

  .search-box input::placeholder {
    color: var(--color-text-tertiary);
  }

  .empty {
    color: var(--color-text-tertiary);
    font-size: var(--text-base);
    text-align: center;
    padding: var(--space-6);
  }

  .session-card {
    border: 1px solid var(--color-border-secondary);
    border-left: 3px solid var(--card-color);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-3);
    overflow: hidden;
  }

  .session-row {
    display: grid;
    grid-template-columns: 40px 1fr 90px 100px;
    align-items: center;
    padding: var(--space-4) var(--space-5);
    gap: var(--space-3);
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
    gap: var(--space-1);
    justify-content: flex-end;
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

  .icon-btn.small {
    padding: var(--space-1);
  }

  /* Details panel */
  .details-panel {
    border-top: 1px solid var(--color-border-secondary);
    padding: var(--space-4) var(--space-5);
    background: var(--color-bg-secondary);
  }

  .loading-text {
    color: var(--color-text-tertiary);
    font-size: var(--text-sm);
    margin: 0;
  }

  .details-summary {
    display: flex;
    gap: var(--space-5);
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    margin-bottom: var(--space-4);
  }

  .empty-details {
    color: var(--color-text-tertiary);
    font-size: var(--text-sm);
    margin: 0;
  }

  .origin-card {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    margin-bottom: var(--space-3);
  }

  .origin-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .origin-name {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-primary);
    flex: 1;
  }

  .origin-stats {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  .origin-details {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-top: var(--space-3);
    padding-left: var(--space-7);
  }

  .detail-row {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  /* Cookie list */
  .cookie-list {
    margin-top: var(--space-3);
    padding-left: var(--space-7);
  }

  .cookie-list summary {
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    color: var(--color-text-secondary);
    cursor: pointer;
  }

  .cookie-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: var(--space-2);
    font-size: var(--text-xs);
  }

  .cookie-table th {
    text-align: left;
    font-weight: var(--font-semibold);
    color: var(--color-text-tertiary);
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--color-border-secondary);
  }

  .cookie-table td {
    padding: var(--space-1) var(--space-3);
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-border-secondary);
  }

  .cookie-name {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cookie-domain {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
