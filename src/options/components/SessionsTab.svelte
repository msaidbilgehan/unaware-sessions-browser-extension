<script lang="ts">
  import { SvelteMap, SvelteSet } from 'svelte/reactivity';
  import type { SessionProfile, SessionDetails } from '@shared/types';
  import {
    updateSession,
    deleteSession as deleteSessionApi,
    getSessionDetails,
    deleteSessionOriginData,
    updateSessionCookie,
    deleteSessionCookie,
    updateSessionStorageEntry,
    deleteSessionStorageEntry,
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
  let detailsMap = new SvelteMap<string, SessionDetails>();
  let detailsLoading = $state(false);
  let editingId = $state<string | null>(null);
  let colorEditId = $state<string | null>(null);
  let confirmData = $state<{ session: SessionProfile } | null>(null);
  let originConfirm = $state<{ sessionId: string; origin: string } | null>(null);

  // Domain folder state
  let collapsedDomains = new SvelteSet<string>();

  // Inline editing state
  let editingCookie = $state<{
    sessionId: string;
    origin: string;
    name: string;
    domain: string;
    value: string;
  } | null>(null);
  let editingStorage = $state<{
    sessionId: string;
    origin: string;
    type: 'localStorage' | 'sessionStorage';
    key: string;
    value: string;
  } | null>(null);

  // Group sessions by primary domain
  interface DomainGroup {
    domain: string;
    sessions: Array<{ session: SessionProfile; details: SessionDetails | null }>;
  }

  const filteredSessions = $derived(
    searchQuery
      ? sessions.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : sessions,
  );

  // Build domain groups from loaded details
  const domainGroups = $derived(() => {
    const groups: Record<string, DomainGroup> = {};
    const ungrouped: Array<{ session: SessionProfile; details: SessionDetails | null }> = [];

    for (const session of filteredSessions) {
      const details = detailsMap.get(session.id) ?? null;
      if (details && details.origins.length > 0) {
        const primaryOrigin = details.origins[0].origin;
        const domain = primaryOrigin.replace(/^https?:\/\//, '');
        if (groups[domain]) {
          groups[domain].sessions.push({ session, details });
        } else {
          groups[domain] = { domain, sessions: [{ session, details }] };
        }
      } else {
        ungrouped.push({ session, details });
      }
    }

    const result: DomainGroup[] = Object.values(groups);
    if (ungrouped.length > 0) {
      result.push({ domain: 'Ungrouped', sessions: ungrouped });
    }
    return result;
  });

  // Load all session details on mount
  async function loadAllDetails() {
    detailsLoading = true;
    detailsMap.clear();
    for (const session of sessions) {
      try {
        const d = await getSessionDetails(session.id);
        detailsMap.set(session.id, d);
      } catch {
        // Skip
      }
    }
    detailsLoading = false;
  }

  $effect(() => {
    if (sessions.length > 0) {
      loadAllDetails();
    }
  });

  async function handleRename(sessionId: string, newName: string) {
    editingId = null;
    try {
      await updateSession(sessionId, { name: newName });
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

  async function executeDelete(sessionId: string) {
    confirmData = null;
    try {
      await deleteSessionApi(sessionId);
      detailsMap.delete(sessionId);
      if (expandedSessionId === sessionId) expandedSessionId = null;
      onupdate();
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  }

  async function handleDeleteOrigin(sessionId: string, origin: string) {
    originConfirm = null;
    try {
      await deleteSessionOriginData(sessionId, origin);
      const d = await getSessionDetails(sessionId);
      detailsMap.set(sessionId, d);

    } catch (err) {
      console.error('Failed to delete origin data:', err);
    }
  }

  async function handleSaveCookie() {
    if (!editingCookie) return;
    const { sessionId, origin, name, domain, value } = editingCookie;
    try {
      await updateSessionCookie(sessionId, origin, name, domain, value);
      const d = await getSessionDetails(sessionId);
      detailsMap.set(sessionId, d);

    } catch (err) {
      console.error('Failed to update cookie:', err);
    }
    editingCookie = null;
  }

  async function handleDeleteCookie(
    sessionId: string,
    origin: string,
    name: string,
    domain: string,
  ) {
    try {
      await deleteSessionCookie(sessionId, origin, name, domain);
      const d = await getSessionDetails(sessionId);
      detailsMap.set(sessionId, d);

    } catch (err) {
      console.error('Failed to delete cookie:', err);
    }
  }

  async function handleSaveStorage() {
    if (!editingStorage) return;
    const { sessionId, origin, type, key, value } = editingStorage;
    try {
      await updateSessionStorageEntry(sessionId, origin, type, key, value);
      const d = await getSessionDetails(sessionId);
      detailsMap.set(sessionId, d);

    } catch (err) {
      console.error('Failed to update storage:', err);
    }
    editingStorage = null;
  }

  async function handleDeleteStorage(
    sessionId: string,
    origin: string,
    type: 'localStorage' | 'sessionStorage',
    key: string,
  ) {
    try {
      await deleteSessionStorageEntry(sessionId, origin, type, key);
      const d = await getSessionDetails(sessionId);
      detailsMap.set(sessionId, d);

    } catch (err) {
      console.error('Failed to delete storage entry:', err);
    }
  }

  function toggleDomain(domain: string) {
    if (collapsedDomains.has(domain)) {
      collapsedDomains.delete(domain);
    } else {
      collapsedDomains.add(domain);
    }
    // SvelteSet auto-triggers reactivity on add/delete
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

  {#if detailsLoading && detailsMap.size === 0}
    <p class="empty">Loading session data...</p>
  {:else if filteredSessions.length === 0}
    <p class="empty">
      {searchQuery ? `No results for "${searchQuery}"` : 'No sessions created yet.'}
    </p>
  {:else}
    {#each domainGroups() as group (group.domain)}
      <div class="domain-folder">
        <button class="domain-header" onclick={() => toggleDomain(group.domain)}>
          <Icon
            name={collapsedDomains.has(group.domain) ? 'chevron-right' : 'chevron-down'}
            size={14}
          />
          <Icon name="globe" size={14} />
          <span class="domain-name">{group.domain}</span>
          <span class="domain-count">{group.sessions.length} session(s)</span>
        </button>

        {#if !collapsedDomains.has(group.domain)}
          <div class="domain-sessions">
            {#each group.sessions as { session, details } (session.id)}
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
                        <button class="close-color" onclick={() => (colorEditId = null)}
                          ><Icon name="check" size={12} /></button
                        >
                      </div>
                    {:else}
                      <button
                        class="dot"
                        style="background-color: {session.color}"
                        onclick={() => (colorEditId = session.id)}
                        aria-label="Change color"
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
                      <span
                        class="name"
                        ondblclick={() => (editingId = session.id)}
                        title={session.name}>{session.emoji ?? ''} {session.name}</span
                      >
                    {/if}
                  </span>
                  <span class="meta">{new Date(session.createdAt).toLocaleDateString()}</span>
                  <span class="actions-cell">
                    <button
                      class="icon-btn"
                      onclick={() =>
                        (expandedSessionId = expandedSessionId === session.id ? null : session.id)}
                      title="View details"
                    >
                      <Icon
                        name={expandedSessionId === session.id ? 'chevron-down' : 'chevron-right'}
                        size={14}
                      />
                    </button>
                    <button
                      class="icon-btn danger"
                      onclick={() => (confirmData = { session })}
                      aria-label="Delete session"
                    >
                      <Icon name="trash-2" size={14} />
                    </button>
                  </span>
                </div>

                {#if expandedSessionId === session.id && details}
                  <div class="details-panel">
                    {#if details.origins.length === 0}
                      <p class="empty-small">No saved data.</p>
                    {:else}
                      <div class="details-summary">
                        <span>{details.origins.length} origin(s)</span>
                        <span>{details.totalCookies} cookies</span>
                        <span>{formatBytes(details.totalStorageBytes)}</span>
                      </div>

                      {#each details.origins as detail (detail.origin)}
                        <div class="origin-card">
                          <div class="origin-header">
                            <Icon name="globe" size={12} />
                            <span class="origin-name"
                              >{detail.origin.replace(/^https?:\/\//, '')}</span
                            >
                            <span class="origin-stats"
                              >{detail.cookieCount} cookies &middot; {formatBytes(
                                detail.cookieBytes + detail.storageBytes,
                              )}</span
                            >
                            <button
                              class="icon-btn danger small"
                              onclick={() =>
                                (originConfirm = { sessionId: session.id, origin: detail.origin })}
                              title="Delete origin data"
                            >
                              <Icon name="trash-2" size={12} />
                            </button>
                          </div>

                          <div class="origin-meta">
                            {#if detail.cookieTimestamp}<span
                                >Cookies: {formatDate(detail.cookieTimestamp)}</span
                              >{/if}
                            {#if detail.storageTimestamp}<span
                                >Storage: {formatDate(detail.storageTimestamp)}</span
                              >{/if}
                          </div>

                          <!-- Cookies -->
                          {#if detail.cookies.length > 0}
                            <details class="data-section">
                              <summary>Cookies ({detail.cookies.length})</summary>
                              <table class="data-table">
                                <thead
                                  ><tr><th>Name</th><th>Value</th><th>Domain</th><th></th></tr
                                  ></thead
                                >
                                <tbody>
                                  {#each detail.cookies as cookie}
                                    <tr>
                                      <td class="cell-name" title={cookie.name}>{cookie.name}</td>
                                      <td class="cell-value">
                                        {#if editingCookie?.name === cookie.name && editingCookie?.domain === cookie.domain && editingCookie?.origin === detail.origin}
                                          <input
                                            class="edit-input"
                                            type="text"
                                            bind:value={editingCookie.value}
                                            onkeydown={(e) =>
                                              e.key === 'Enter' && handleSaveCookie()}
                                          />
                                          <button class="save-btn" onclick={handleSaveCookie}
                                            ><Icon name="check" size={10} /></button
                                          >
                                          <button
                                            class="cancel-btn"
                                            onclick={() => (editingCookie = null)}
                                            ><Icon name="x" size={10} /></button
                                          >
                                        {:else}
                                          <!-- svelte-ignore a11y_no_static_element_interactions -->
                                          <span
                                            class="editable"
                                            ondblclick={() =>
                                              (editingCookie = {
                                                sessionId: session.id,
                                                origin: detail.origin,
                                                name: cookie.name,
                                                domain: cookie.domain,
                                                value: cookie.value,
                                              })}
                                            title="Double-click to edit"
                                          >
                                            {cookie.value.length > 40
                                              ? cookie.value.slice(0, 40) + '...'
                                              : cookie.value}
                                          </span>
                                        {/if}
                                      </td>
                                      <td class="cell-domain">{cookie.domain}</td>
                                      <td>
                                        <button
                                          class="icon-btn danger tiny"
                                          onclick={() =>
                                            handleDeleteCookie(
                                              session.id,
                                              detail.origin,
                                              cookie.name,
                                              cookie.domain,
                                            )}
                                          title="Delete cookie"
                                        >
                                          <Icon name="x" size={10} />
                                        </button>
                                      </td>
                                    </tr>
                                  {/each}
                                </tbody>
                              </table>
                            </details>
                          {/if}

                          <!-- localStorage -->
                          {#if Object.keys(detail.localStorage).length > 0}
                            <details class="data-section">
                              <summary
                                >localStorage ({Object.keys(detail.localStorage).length})</summary
                              >
                              <table class="data-table">
                                <thead><tr><th>Key</th><th>Value</th><th></th></tr></thead>
                                <tbody>
                                  {#each Object.entries(detail.localStorage) as [key, value]}
                                    <tr>
                                      <td class="cell-name" title={key}>{key}</td>
                                      <td class="cell-value">
                                        {#if editingStorage?.key === key && editingStorage?.type === 'localStorage' && editingStorage?.origin === detail.origin}
                                          <input
                                            class="edit-input"
                                            type="text"
                                            bind:value={editingStorage.value}
                                            onkeydown={(e) =>
                                              e.key === 'Enter' && handleSaveStorage()}
                                          />
                                          <button class="save-btn" onclick={handleSaveStorage}
                                            ><Icon name="check" size={10} /></button
                                          >
                                          <button
                                            class="cancel-btn"
                                            onclick={() => (editingStorage = null)}
                                            ><Icon name="x" size={10} /></button
                                          >
                                        {:else}
                                          <!-- svelte-ignore a11y_no_static_element_interactions -->
                                          <span
                                            class="editable"
                                            ondblclick={() =>
                                              (editingStorage = {
                                                sessionId: session.id,
                                                origin: detail.origin,
                                                type: 'localStorage',
                                                key,
                                                value,
                                              })}
                                            title="Double-click to edit"
                                          >
                                            {value.length > 40 ? value.slice(0, 40) + '...' : value}
                                          </span>
                                        {/if}
                                      </td>
                                      <td>
                                        <button
                                          class="icon-btn danger tiny"
                                          onclick={() =>
                                            handleDeleteStorage(
                                              session.id,
                                              detail.origin,
                                              'localStorage',
                                              key,
                                            )}
                                          title="Delete entry"
                                        >
                                          <Icon name="x" size={10} />
                                        </button>
                                      </td>
                                    </tr>
                                  {/each}
                                </tbody>
                              </table>
                            </details>
                          {/if}

                          <!-- sessionStorage -->
                          {#if Object.keys(detail.sessionStorage).length > 0}
                            <details class="data-section">
                              <summary
                                >sessionStorage ({Object.keys(detail.sessionStorage)
                                  .length})</summary
                              >
                              <table class="data-table">
                                <thead><tr><th>Key</th><th>Value</th><th></th></tr></thead>
                                <tbody>
                                  {#each Object.entries(detail.sessionStorage) as [key, value]}
                                    <tr>
                                      <td class="cell-name" title={key}>{key}</td>
                                      <td class="cell-value">
                                        {#if editingStorage?.key === key && editingStorage?.type === 'sessionStorage' && editingStorage?.origin === detail.origin}
                                          <input
                                            class="edit-input"
                                            type="text"
                                            bind:value={editingStorage.value}
                                            onkeydown={(e) =>
                                              e.key === 'Enter' && handleSaveStorage()}
                                          />
                                          <button class="save-btn" onclick={handleSaveStorage}
                                            ><Icon name="check" size={10} /></button
                                          >
                                          <button
                                            class="cancel-btn"
                                            onclick={() => (editingStorage = null)}
                                            ><Icon name="x" size={10} /></button
                                          >
                                        {:else}
                                          <!-- svelte-ignore a11y_no_static_element_interactions -->
                                          <span
                                            class="editable"
                                            ondblclick={() =>
                                              (editingStorage = {
                                                sessionId: session.id,
                                                origin: detail.origin,
                                                type: 'sessionStorage',
                                                key,
                                                value,
                                              })}
                                            title="Double-click to edit"
                                          >
                                            {value.length > 40 ? value.slice(0, 40) + '...' : value}
                                          </span>
                                        {/if}
                                      </td>
                                      <td>
                                        <button
                                          class="icon-btn danger tiny"
                                          onclick={() =>
                                            handleDeleteStorage(
                                              session.id,
                                              detail.origin,
                                              'sessionStorage',
                                              key,
                                            )}
                                          title="Delete entry"
                                        >
                                          <Icon name="x" size={10} />
                                        </button>
                                      </td>
                                    </tr>
                                  {/each}
                                </tbody>
                              </table>
                            </details>
                          {/if}
                        </div>
                      {/each}
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
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
    message={'Delete all saved data for ' + originConfirm.origin + '?'}
    confirmLabel="Delete"
    danger={true}
    onconfirm={() =>
      originConfirm && handleDeleteOrigin(originConfirm.sessionId, originConfirm.origin)}
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
  .empty,
  .empty-small {
    color: var(--color-text-tertiary);
    font-size: var(--text-sm);
    text-align: center;
    padding: var(--space-4);
    margin: 0;
  }

  /* Domain folders */
  .domain-folder {
    margin-bottom: var(--space-4);
  }
  .domain-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg-tertiary);
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-sans);
    transition: background var(--transition-fast);
  }
  .domain-header:hover {
    background: var(--color-interactive-hover);
  }
  .domain-name {
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    color: var(--color-text-primary);
    flex: 1;
    text-align: left;
  }
  .domain-count {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }
  .domain-sessions {
    padding-left: var(--space-5);
    margin-top: var(--space-2);
  }

  /* Session cards */
  .session-card {
    border: 1px solid var(--color-border-secondary);
    border-left: 3px solid var(--card-color);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-2);
    overflow: hidden;
  }
  .session-row {
    display: grid;
    grid-template-columns: 32px 1fr 80px 70px;
    align-items: center;
    padding: var(--space-3) var(--space-4);
    gap: var(--space-3);
  }
  .color-cell {
    position: relative;
  }
  .dot {
    width: 12px;
    height: 12px;
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
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
    cursor: default;
  }
  .meta {
    font-size: var(--text-xs);
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
  .icon-btn.tiny {
    padding: 0;
  }

  /* Details panel */
  .details-panel {
    border-top: 1px solid var(--color-border-secondary);
    padding: var(--space-4);
    background: var(--color-bg-secondary);
  }
  .details-summary {
    display: flex;
    gap: var(--space-4);
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    margin-bottom: var(--space-3);
  }

  /* Origin cards */
  .origin-card {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    margin-bottom: var(--space-2);
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
  .origin-meta {
    display: flex;
    gap: var(--space-4);
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    margin-top: var(--space-2);
    padding-left: var(--space-7);
  }

  /* Data sections */
  .data-section {
    margin-top: var(--space-3);
    padding-left: var(--space-4);
  }
  .data-section summary {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--color-text-secondary);
    cursor: pointer;
    margin-bottom: var(--space-2);
  }
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-xs);
    table-layout: fixed;
  }
  .data-table th {
    text-align: left;
    font-weight: var(--font-semibold);
    color: var(--color-text-tertiary);
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--color-border-secondary);
  }
  .data-table td {
    padding: var(--space-1) var(--space-2);
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-border-secondary);
    vertical-align: middle;
  }
  .cell-name {
    width: 28%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: var(--font-medium);
  }
  .cell-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cell-domain {
    width: 18%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Inline editing */
  .editable {
    cursor: pointer;
    color: var(--color-text-secondary);
  }
  .editable:hover {
    color: var(--color-accent);
    text-decoration: underline;
  }
  .edit-input {
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-family: monospace;
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    outline: none;
  }
  .save-btn,
  .cancel-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--space-1);
    display: inline-flex;
    align-items: center;
  }
  .save-btn {
    color: var(--color-success);
  }
  .cancel-btn {
    color: var(--color-text-tertiary);
  }
</style>
