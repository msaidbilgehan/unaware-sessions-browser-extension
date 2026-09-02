<script lang="ts">
  import { getTheme, setTheme, onThemeChange } from '@shared/theme-store';
  import type { ThemePreference } from '@shared/theme-store';
  import {
    getAutoRefreshInterval,
    getAutoRefreshDefaultEnabled,
    getIsolationModeDefault,
    setAutoRefreshInterval,
    setAutoRefreshDefaultEnabled,
    setIsolationModeDefault,
    onSettingsChange,
  } from '@shared/settings-store';
  import type { AutoRefreshInterval, IsolationMode, GracePeriodMs } from '@shared/types';
  import { GRACE_PERIOD_OPTIONS } from '@shared/constants';
  import {
    isPasscodeEnabled,
    isBiometricEnabled,
    isBiometricAvailable,
    getGracePeriodMs,
    setupPasscode,
    removePasscode,
    changePasscode,
    setupBiometric,
    removeBiometric,
    verifyBiometric,
    verifyAndUnlock,
    setGracePeriodDuration,
    onSecurityChange,
  } from '@shared/security-store';
  import { tick } from 'svelte';
  import Icon from '@shared/components/Icon.svelte';
  import Toast from '@shared/components/Toast.svelte';
  import ConfirmDialog from '@shared/components/ConfirmDialog.svelte';
  import Switch from '@shared/components/Switch.svelte';
  import SegmentedControl from '@shared/components/SegmentedControl.svelte';
  import SyncConflictDialog from './SyncConflictDialog.svelte';
  import {
    syncConnect,
    syncDisconnect,
    syncNow,
    syncGetState,
    syncConfigure,
    syncResolveConflicts,
  } from '@shared/api';
  import { getSyncConfig, initSyncStore, onSyncConfigChange } from '@shared/sync/sync-store';
  import type {
    SyncConfig,
    SyncState,
    MergeStrategy,
    SyncInterval,
    ConflictEntry,
  } from '@shared/sync/sync-types';
  import { SYNC_INTERVAL_OPTIONS } from '@shared/constants';
  import { formatRelativeTime } from '@shared/utils';

  let theme = $state<ThemePreference>(getTheme());

  $effect(() => {
    const unsub = onThemeChange((t) => {
      theme = t;
    });
    return unsub;
  });

  const themeOptions: { value: ThemePreference; label: string; icon: string }[] = [
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
    { value: 'system', label: 'System', icon: 'monitor' },
  ];

  // Auto-save interval
  let refreshInterval = $state<AutoRefreshInterval>(getAutoRefreshInterval());
  let defaultEnabled = $state<boolean>(getAutoRefreshDefaultEnabled());
  let isolationDefault = $state<IsolationMode>(getIsolationModeDefault());

  $effect(() => {
    const unsub = onSettingsChange((settings) => {
      refreshInterval = settings.autoRefreshInterval;
      defaultEnabled = settings.autoRefreshDefaultEnabled;
      isolationDefault = settings.isolationModeDefault;
    });
    return unsub;
  });

  const intervalOptions: { value: AutoRefreshInterval; label: string; hint: string }[] = [
    { value: 0, label: 'Off', hint: 'Pause auto-save for every site' },
    { value: 60, label: 'Every 1m', hint: 'Save tracked tabs once a minute' },
    { value: 120, label: 'Every 2m', hint: 'Save tracked tabs every two minutes' },
    { value: 300, label: 'Every 5m', hint: 'Save tracked tabs every five minutes' },
  ];

  const isolationOptions: { value: IsolationMode; label: string; icon: string; hint: string }[] = [
    { value: 'soft', label: 'Soft', icon: 'shield', hint: 'Preserve unrelated logins' },
    { value: 'strict', label: 'Strict', icon: 'lock', hint: 'Always clear cookies on switch' },
  ];

  // ── Security state ──────────────────────────────────────────────
  let passcodeOn = $state(isPasscodeEnabled());
  let biometricOn = $state(isBiometricEnabled());
  let biometricSupported = $state(false);
  let gracePeriod = $state<GracePeriodMs>(getGracePeriodMs());

  // Passcode setup flow
  type SecurityFlow =
    | 'idle'
    | 'setup-enter'
    | 'setup-confirm'
    | 'verify-then-disable'
    | 'verify-then-change'
    | 'verify-then-biometric'
    | 'change-enter'
    | 'change-confirm';
  let securityFlow = $state<SecurityFlow>('idle');
  let pinDigits = $state<string[]>(['', '', '', '']);
  let pinConfirm = $state<string[]>(['', '', '', '']);
  let pinError = $state('');
  let pinInputRefs = $state<(HTMLInputElement | null)[]>([null, null, null, null]);

  $effect(() => {
    isBiometricAvailable().then((v) => {
      biometricSupported = v;
    });
  });

  $effect(() => {
    const unsub = onSecurityChange((config) => {
      passcodeOn = config.passcodeEnabled;
      biometricOn = config.biometricEnabled;
      gracePeriod = config.gracePeriodMs;
    });
    return unsub;
  });

  function resetPinState() {
    securityFlow = 'idle';
    pinDigits = ['', '', '', ''];
    pinConfirm = ['', '', '', ''];
    pinError = '';
  }

  async function focusFirstPin() {
    await tick();
    pinInputRefs[0]?.focus();
  }

  function handlePinDigitInput(index: number, e: Event, target: 'digits' | 'confirm') {
    const input = e.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '');
    const arr = target === 'digits' ? pinDigits : pinConfirm;
    arr[index] = value.slice(-1);
    input.value = arr[index];
    pinError = '';

    if (arr[index] && index < 3) {
      pinInputRefs[index + 1]?.focus();
    } else if (arr[index] && index === 3 && arr.every((d) => d.length === 1)) {
      // Advance on the fourth digit, like every OS passcode field. The explicit
      // button stays for keyboard and screen-reader users who prefer it.
      void advanceFlow();
    }
  }

  function handlePinDigitKeydown(index: number, e: KeyboardEvent, target: 'digits' | 'confirm') {
    const arr = target === 'digits' ? pinDigits : pinConfirm;
    if (e.key === 'Backspace') {
      if (!arr[index] && index > 0) {
        e.preventDefault();
        arr[index - 1] = '';
        pinInputRefs[index - 1]?.focus();
      } else {
        arr[index] = '';
      }
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      pinInputRefs[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < 3) {
      e.preventDefault();
      pinInputRefs[index + 1]?.focus();
    }
    if (e.key === 'Escape') {
      resetPinState();
    }
  }

  /** Run whichever step the current flow is on. */
  async function advanceFlow() {
    switch (securityFlow) {
      case 'setup-enter':
        handleSetupEnterComplete();
        break;
      case 'setup-confirm':
        await handleSetupConfirmComplete();
        break;
      case 'verify-then-disable':
      case 'verify-then-change':
      case 'verify-then-biometric':
        await handleVerifyComplete();
        break;
      case 'change-enter':
        handleChangeEnterComplete();
        break;
      case 'change-confirm':
        await handleChangeConfirmComplete();
        break;
    }
  }

  function startPasscodeSetup() {
    resetPinState();
    securityFlow = 'setup-enter';
    focusFirstPin();
  }

  function handleSetupEnterComplete() {
    if (pinDigits.join('').length !== 4) return;
    securityFlow = 'setup-confirm';
    pinInputRefs = [null, null, null, null];
    focusFirstPin();
  }

  async function handleSetupConfirmComplete() {
    const pin = pinDigits.join('');
    const confirm = pinConfirm.join('');
    if (confirm.length !== 4) return;
    if (pin !== confirm) {
      pinError = 'Passcodes do not match';
      pinConfirm = ['', '', '', ''];
      focusFirstPin();
      return;
    }
    await setupPasscode(pin);
    resetPinState();
    toast('Passcode enabled', 'success');
  }

  function startPasscodeDisable() {
    resetPinState();
    securityFlow = 'verify-then-disable';
    focusFirstPin();
  }

  function startPasscodeChange() {
    resetPinState();
    securityFlow = 'verify-then-change';
    focusFirstPin();
  }

  async function handleVerifyComplete() {
    const pin = pinDigits.join('');
    if (pin.length !== 4) return;
    const valid = await verifyAndUnlock(pin);
    if (!valid) {
      pinError = 'Incorrect passcode';
      pinDigits = ['', '', '', ''];
      focusFirstPin();
      return;
    }
    if (securityFlow === 'verify-then-disable') {
      if (biometricOn) await removeBiometric();
      await removePasscode();
      resetPinState();
      toast('Passcode removed', 'info');
    } else if (securityFlow === 'verify-then-change') {
      pinDigits = ['', '', '', ''];
      pinError = '';
      securityFlow = 'change-enter';
      pinInputRefs = [null, null, null, null];
      focusFirstPin();
    } else if (securityFlow === 'verify-then-biometric') {
      resetPinState();
      await doBiometricToggle();
    }
  }

  function handleChangeEnterComplete() {
    if (pinDigits.join('').length !== 4) return;
    securityFlow = 'change-confirm';
    pinInputRefs = [null, null, null, null];
    focusFirstPin();
  }

  async function handleChangeConfirmComplete() {
    const pin = pinDigits.join('');
    const confirm = pinConfirm.join('');
    if (confirm.length !== 4) return;
    if (pin !== confirm) {
      pinError = 'Passcodes do not match';
      pinConfirm = ['', '', '', ''];
      focusFirstPin();
      return;
    }
    await changePasscode(pin);
    resetPinState();
    toast('Passcode updated', 'success');
  }

  async function handleBiometricToggle() {
    if (!passcodeOn) return; // Passcode must be enabled first
    if (biometricOn) {
      // Disabling: try biometric verification first, fall back to passcode
      await handleBiometricDisable();
    } else {
      // Enabling: verify via biometric registration (WebAuthn prompt is inherently verified)
      // but require passcode first to prove identity
      resetPinState();
      securityFlow = 'verify-then-biometric';
      focusFirstPin();
    }
  }

  async function handleBiometricDisable() {
    try {
      const verified = await verifyBiometric();
      if (verified) {
        await removeBiometric();
        return;
      }
    } catch {
      // Biometric failed — fall back to passcode
    }
    // Fallback: require passcode to disable biometric
    resetPinState();
    securityFlow = 'verify-then-biometric';
    focusFirstPin();
  }

  async function doBiometricToggle() {
    try {
      if (biometricOn) {
        await removeBiometric();
        toast('Biometric unlock disabled', 'info');
      } else {
        await setupBiometric();
        toast('Biometric unlock enabled', 'success');
      }
    } catch {
      // setupBiometric can fail if the user cancels the WebAuthn prompt.
      toast('Biometric setup was cancelled', 'info');
    }
  }

  // ── Cloud Sync state ──────────────────────────────────────

  let syncCfg = $state<SyncConfig>(getSyncConfig());
  let syncState = $state<SyncState>({ status: 'idle', progress: '', conflicts: [] });
  let showDisconnectConfirm = $state(false);
  let showConflictDialog = $state(false);
  let syncing = $state(false);
  let connecting = $state(false);
  let toastData = $state<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);

  function toast(message: string, type: 'error' | 'success' | 'info' = 'info') {
    toastData = { message, type };
  }

  function failed(prefix: string, err: unknown) {
    toast(`${prefix}: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
  }

  // Persisted conflict set survives SW restarts (syncState.conflicts is
  // volatile), so the banner and status pill stay accurate even when the
  // conflict was raised by a background auto-sync the user never saw.
  const pendingConflicts = $derived(syncCfg.pendingConflicts ?? []);
  const hasPendingConflict = $derived(pendingConflicts.length > 0);
  // Prefer a fresh in-memory conflict set (just returned by Sync Now); fall
  // back to the persisted one when the dialog is opened from the banner.
  const conflictSource = $derived(
    syncState.conflicts.length > 0 ? syncState.conflicts : pendingConflicts,
  );

  $effect(() => {
    initSyncStore().then(() => {
      syncCfg = getSyncConfig();
    });
    const unsub = onSyncConfigChange((config) => {
      syncCfg = config;
    });
    return unsub;
  });

  const mergeOptions: { value: MergeStrategy; label: string; hint: string }[] = [
    { value: 'trust-cloud', label: 'Trust cloud', hint: 'Cloud data wins every conflict' },
    { value: 'trust-local', label: 'Trust local', hint: 'This device wins every conflict' },
    { value: 'ask', label: 'Ask me', hint: 'Choose per site when both sides changed' },
  ];

  async function handleSyncConnect() {
    connecting = true;
    try {
      await syncConnect();
      syncCfg = getSyncConfig();
      toast('Connected to Google Drive', 'success');
    } catch (err) {
      failed('Connection failed', err);
    } finally {
      connecting = false;
    }
  }

  async function handleSyncDisconnect() {
    showDisconnectConfirm = false;
    try {
      await syncDisconnect();
      syncCfg = getSyncConfig();
      syncState = { status: 'idle', progress: '', conflicts: [] };
      toast('Disconnected from Google Drive', 'info');
    } catch (err) {
      failed('Disconnect failed', err);
    }
  }

  async function handleSyncNow() {
    syncing = true;
    try {
      const state = await syncNow();
      syncState = state;

      if (state.status === 'conflict') {
        showConflictDialog = true;
      } else if (state.status === 'error') {
        toast(state.progress, 'error');
      } else {
        toast('Sync completed', 'success');
      }
    } catch (err) {
      failed('Sync failed', err);
    } finally {
      syncing = false;
    }
  }

  async function handleConflictResolve(resolutions: ConflictEntry[]) {
    showConflictDialog = false;
    syncing = true;
    try {
      const state = await syncResolveConflicts(resolutions);
      syncState = state;
      if (state.status === 'error') {
        toast(state.progress, 'error');
      } else if (state.status === 'conflict') {
        // Local or remote drifted while the dialog was open — the resolution
        // cycle surfaced fresh conflicts the user never saw. Re-open rather
        // than falsely reporting success (pendingConflicts is already updated).
        showConflictDialog = true;
        toast('New changes need resolving', 'info');
      } else {
        toast('Sync completed with resolved conflicts', 'success');
      }
    } catch (err) {
      failed('Sync failed', err);
    } finally {
      syncing = false;
    }
  }

  async function refreshSyncState() {
    try {
      syncState = await syncGetState();
    } catch {
      // Ignore — sync may not be initialized
    }
  }

  $effect(() => {
    if (syncCfg.enabled) {
      refreshSyncState();
    }
  });
</script>

<!--
  One markup definition for all five passcode steps. The steps differed only in
  their heading, which array they write to, and what the confirm button does;
  copy-pasting them five times meant every a11y or masking fix had to be made
  five times.
-->
{#snippet pinFlow(
  label: string,
  target: 'digits' | 'confirm',
  submitLabel: string,
  onsubmit: () => void,
)}
  {@const values = target === 'digits' ? pinDigits : pinConfirm}
  <div class="pin-flow">
    <span class="pin-flow-label">{label}</span>
    <div class="pin-row">
      {#each values as _, i (i)}
        <input
          bind:this={pinInputRefs[i]}
          type="password"
          inputmode="numeric"
          maxlength="1"
          autocomplete="off"
          class="pin-box"
          class:filled={values[i].length > 0}
          class:error={!!pinError}
          oninput={(e) => handlePinDigitInput(i, e, target)}
          onkeydown={(e) => handlePinDigitKeydown(i, e, target)}
          aria-label="{label}, digit {i + 1} of 4"
          aria-invalid={!!pinError}
        />
      {/each}
    </div>
    {#if pinError}
      <span class="pin-error" role="alert">{pinError}</span>
    {/if}
    <div class="pin-flow-actions">
      <button class="text-btn" onclick={resetPinState}>Cancel</button>
      <button class="text-btn primary" onclick={onsubmit} disabled={values.join('').length !== 4}>
        {submitLabel}
      </button>
    </div>
  </div>
{/snippet}

{#snippet cardHeader(icon: string, tone: string, title: string, description: string)}
  <div class="card-header">
    <div class="card-icon {tone}">
      <Icon name={icon} size={16} />
    </div>
    <div>
      <h2>{title}</h2>
      <p class="description">{description}</p>
    </div>
  </div>
{/snippet}

<div class="settings-layout">
  <!-- Appearance -->
  <section class="card" id="appearance">
    {@render cardHeader('sun', '', 'Appearance', 'Choose how Unaware Sessions looks to you.')}
    <SegmentedControl
      options={themeOptions}
      value={theme}
      onchange={(v) => setTheme(v)}
      label="Colour theme"
      stretch
      size="md"
    />
  </section>

  <!-- Cookie Isolation -->
  <section class="card" id="isolation">
    {@render cardHeader(
      'shield',
      '',
      'Cookie isolation',
      'What happens to a site’s cookies when you switch sessions on it.',
    )}

    <div class="setting-row">
      <span class="setting-label">Default mode</span>
      <SegmentedControl
        options={isolationOptions}
        value={isolationDefault}
        onchange={setIsolationModeDefault}
        label="Default cookie isolation mode"
      />
    </div>

    <div class="explainer">
      <div class="explainer-row">
        <Icon name="shield" size={14} />
        <div>
          <strong>Soft</strong> — leaves cookies alone on sites where the target session has nothing saved,
          so switching a work session on one site does not sign you out of unrelated ones.
        </div>
      </div>
      <div class="explainer-row">
        <Icon name="lock" size={14} />
        <div>
          <strong>Strict</strong> — always clears the site’s cookies on switch, even when nothing will
          be restored. Use it where sessions must never bleed into each other.
        </div>
      </div>
      <div class="explainer-row">
        <Icon name="info" size={14} />
        <div>Individual sites can override this from the popup.</div>
      </div>
    </div>
  </section>

  <!-- Auto-save -->
  <section class="card" id="auto-save">
    {@render cardHeader(
      'refresh-cw',
      '',
      'Auto-save',
      'Periodically copy the live cookies and storage of tracked tabs into their session, so a crash or a closed tab does not cost you a signed-in state.',
    )}

    <div class="setting-row">
      <div class="setting-info">
        <span class="setting-label">How often</span>
        <span class="setting-description">
          Off pauses auto-save everywhere, including sites you enabled it on individually.
        </span>
      </div>
      <SegmentedControl
        options={intervalOptions}
        value={refreshInterval}
        onchange={setAutoRefreshInterval}
        label="Auto-save interval"
      />
    </div>

    <div class="divider"></div>

    <div class="setting-row">
      <div class="setting-info">
        <span class="setting-label" id="auto-save-default-label">On for new sites</span>
        <span class="setting-description" id="auto-save-default-desc">
          Sites a session visits for the first time start with auto-save switched on.
        </span>
      </div>
      <Switch
        checked={defaultEnabled}
        onchange={setAutoRefreshDefaultEnabled}
        label="Turn on auto-save for new sites"
        describedby="auto-save-default-desc"
      />
    </div>
  </section>

  <!-- Security -->
  <section class="card" id="security">
    {@render cardHeader(
      'lock',
      'security',
      'Security',
      'Ask for a passcode before switching sessions, deleting them, or exporting your data.',
    )}

    <div class="setting-row">
      <div class="setting-info">
        <span class="setting-label">Passcode</span>
        <span class="setting-description" id="passcode-desc">
          A 4-digit PIN, checked before session switches, deletions and exports.
        </span>
      </div>
      {#if securityFlow === 'idle'}
        <div class="row-actions">
          {#if passcodeOn}
            <button class="text-btn" onclick={startPasscodeChange}>Change</button>
          {/if}
          <Switch
            checked={passcodeOn}
            onchange={() => (passcodeOn ? startPasscodeDisable() : startPasscodeSetup())}
            label={passcodeOn ? 'Disable passcode' : 'Enable passcode'}
            describedby="passcode-desc"
          />
        </div>
      {/if}
    </div>

    {#if securityFlow === 'setup-enter'}
      {@render pinFlow('Choose a 4-digit passcode', 'digits', 'Next', handleSetupEnterComplete)}
    {:else if securityFlow === 'setup-confirm'}
      {@render pinFlow('Confirm your passcode', 'confirm', 'Save', handleSetupConfirmComplete)}
    {:else if securityFlow === 'verify-then-disable' || securityFlow === 'verify-then-change' || securityFlow === 'verify-then-biometric'}
      {@render pinFlow('Enter your current passcode', 'digits', 'Verify', handleVerifyComplete)}
    {:else if securityFlow === 'change-enter'}
      {@render pinFlow('Choose a new passcode', 'digits', 'Next', handleChangeEnterComplete)}
    {:else if securityFlow === 'change-confirm'}
      {@render pinFlow('Confirm the new passcode', 'confirm', 'Save', handleChangeConfirmComplete)}
    {/if}

    {#if biometricSupported}
      <div class="divider"></div>
      <div class="setting-row" class:disabled={!passcodeOn}>
        <div class="setting-info">
          <span class="setting-label">
            <Icon name="fingerprint" size={14} class="inline-icon" />
            Biometric unlock
          </span>
          <span class="setting-description" id="biometric-desc">
            {#if passcodeOn}
              Use a fingerprint or Face ID instead of typing the passcode.
            {:else}
              Set a passcode first — it is the fallback if biometrics ever fail.
            {/if}
          </span>
        </div>
        <Switch
          checked={biometricOn}
          onchange={handleBiometricToggle}
          disabled={!passcodeOn}
          label="Use biometric unlock"
          describedby="biometric-desc"
        />
      </div>
    {/if}

    {#if passcodeOn || biometricOn}
      <div class="divider"></div>
      <div class="setting-row">
        <div class="setting-info">
          <span class="setting-label">Ask again after</span>
          <span class="setting-description">
            Once you unlock, further actions go through without asking until this much time has
            passed. Always resets when the browser closes.
          </span>
        </div>
        <SegmentedControl
          options={GRACE_PERIOD_OPTIONS}
          value={gracePeriod}
          onchange={setGracePeriodDuration}
          label="Re-authentication grace period"
        />
      </div>
    {/if}
  </section>

  <!-- Cloud Sync -->
  <section class="card" id="sync">
    {@render cardHeader(
      'cloud',
      'sync',
      'Cloud sync',
      'Keep your sessions in step across devices through your own Google Drive.',
    )}

    {#if !syncCfg.enabled}
      <button class="text-btn primary wide" onclick={handleSyncConnect} disabled={connecting}>
        {#if connecting}
          <span class="spinner-sm"></span>
          Connecting…
        {:else}
          <Icon name="cloud" size={14} />
          Connect Google Drive
        {/if}
      </button>
    {:else}
      <!-- Status line -->
      <div class="sync-status-row">
        <div
          class="sync-status-indicator"
          class:syncing
          class:error={!syncing && syncState.status === 'error'}
          class:conflict={!syncing && syncState.status !== 'error' && hasPendingConflict}
        >
          {#if syncing}
            <span class="spinner-sm"></span>
          {:else if syncState.status === 'error' || hasPendingConflict}
            <Icon name="alert-triangle" size={14} />
          {:else}
            <Icon name="check" size={14} />
          {/if}
          <span class="sync-status-text">
            {#if syncing}
              Syncing…
            {:else if syncState.status === 'error'}
              Error
            {:else if hasPendingConflict}
              Conflicts pending
            {:else}
              Connected
            {/if}
          </span>
        </div>
        {#if syncCfg.lastSyncAt > 0}
          <span class="sync-last-time">Last synced {formatRelativeTime(syncCfg.lastSyncAt)}</span>
        {/if}
      </div>

      {#if hasPendingConflict && !syncing}
        <div class="banner warning" role="alert">
          <Icon name="alert-triangle" size={16} />
          <div class="banner-text">
            <span class="banner-title">
              Auto-sync paused — {pendingConflicts.length}
              {pendingConflicts.length === 1 ? 'conflict' : 'conflicts'} to resolve
            </span>
            <span class="banner-desc">
              The same data changed on this device and in the cloud. Choose which to keep to resume
              syncing.
            </span>
          </div>
          <button class="review-btn" onclick={() => (showConflictDialog = true)}>Review</button>
        </div>
      {/if}

      <!-- A background auto-sync failure is only in the persisted config; without
           this the card reads "Connected" with a stale "Last synced" and the
           reason (e.g. a refused upload after local data loss) stays invisible
           until someone presses Sync Now. -->
      {#if syncCfg.lastSyncError && !syncing}
        <div class="banner error" role="alert">
          <Icon name="alert-triangle" size={16} />
          <div class="banner-text">
            <span class="banner-title">Last sync failed</span>
            <span class="banner-desc">{syncCfg.lastSyncError}</span>
          </div>
        </div>
      {/if}

      <div class="divider"></div>

      <div class="setting-row">
        <div class="setting-info">
          <span class="setting-label">When both sides changed</span>
          <span class="setting-description">
            How to resolve a site whose data differs here and in the cloud.
          </span>
        </div>
        <SegmentedControl
          options={mergeOptions}
          value={syncCfg.mergeStrategy}
          onchange={(v) => syncConfigure({ mergeStrategy: v })}
          label="Merge strategy"
        />
      </div>

      <div class="divider"></div>

      <div class="setting-row">
        <span class="setting-label">Sync automatically</span>
        <SegmentedControl
          options={SYNC_INTERVAL_OPTIONS}
          value={syncCfg.syncInterval}
          onchange={(v: SyncInterval) => syncConfigure({ syncInterval: v })}
          label="Auto-sync interval"
        />
      </div>

      <div class="divider"></div>

      <div class="row-actions">
        <button class="text-btn primary" onclick={handleSyncNow} disabled={syncing}>
          {#if syncing}
            <span class="spinner-sm"></span>
            Syncing…
          {:else}
            <Icon name="refresh-cw" size={14} />
            Sync now
          {/if}
        </button>
        <button class="text-btn" onclick={() => (showDisconnectConfirm = true)}>
          <Icon name="cloud-off" size={14} />
          Disconnect
        </button>
      </div>

      <div class="explainer">
        <div class="explainer-row">
          <Icon name="lock" size={14} />
          <div>
            Sessions are encrypted with <strong>AES-256-GCM</strong> in this browser before upload, using
            a key derived from your Google account identity. Google stores the ciphertext in a hidden
            app folder and never receives the key.
          </div>
        </div>
      </div>
    {/if}
  </section>
</div>

{#if showDisconnectConfirm}
  <ConfirmDialog
    title="Disconnect cloud sync"
    message="Stop syncing this device with Google Drive?"
    detail="Data already in Drive stays there, and your local sessions are untouched. You can reconnect at any time."
    confirmLabel="Disconnect"
    danger={true}
    onconfirm={handleSyncDisconnect}
    oncancel={() => (showDisconnectConfirm = false)}
  />
{/if}

{#if showConflictDialog && conflictSource.length > 0}
  <SyncConflictDialog
    conflicts={conflictSource}
    onresolve={handleConflictResolve}
    oncancel={() => {
      showConflictDialog = false;
    }}
  />
{/if}

{#if toastData}
  <Toast message={toastData.message} type={toastData.type} ondismiss={() => (toastData = null)} />
{/if}

<style>
  .settings-layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .card {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-2xl);
    padding: var(--space-7);
    box-shadow: var(--shadow-xs);
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    scroll-margin-top: var(--space-10);
  }

  .card-header {
    display: flex;
    gap: var(--space-4);
    align-items: flex-start;
  }

  .card-icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-lg);
    background: var(--color-accent-soft);
    color: var(--color-accent);
    flex-shrink: 0;
  }

  .card-icon.security {
    background: var(--color-warning-soft);
    color: var(--color-warning);
  }

  h2 {
    font-size: var(--text-md);
    font-weight: var(--font-semibold);
    margin: 0;
    color: var(--color-text-primary);
    line-height: var(--leading-tight);
  }

  .description {
    font-size: var(--text-sm);
    color: var(--color-text-tertiary);
    margin: var(--space-1) 0 0;
    line-height: var(--leading-relaxed);
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
    flex-wrap: wrap;
  }

  .setting-row.disabled {
    opacity: 0.55;
  }

  .setting-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
    min-width: 220px;
  }

  .setting-label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-primary);
  }

  .setting-description {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    line-height: var(--leading-relaxed);
  }

  .divider {
    height: 1px;
    background: var(--color-border-secondary);
    margin: 0;
  }

  .row-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-shrink: 0;
  }

  /* Explainers */
  .explainer {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    line-height: var(--leading-relaxed);
  }

  .explainer-row {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
  }

  .explainer-row :global(svg) {
    flex-shrink: 0;
    margin-top: 1px;
    color: var(--color-text-tertiary);
  }

  .explainer-row strong {
    color: var(--color-text-primary);
  }

  /* Buttons */
  .text-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    background: var(--color-bg-primary);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    font-weight: var(--font-medium);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .text-btn:hover:not(:disabled) {
    background: var(--color-interactive-hover);
  }

  .text-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .text-btn.primary {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-on-accent);
  }

  .text-btn.primary:hover:not(:disabled) {
    background: var(--color-accent-hover);
  }

  .text-btn.wide {
    align-self: flex-start;
    padding: var(--space-4) var(--space-6);
    font-size: var(--text-sm);
  }

  .text-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .text-btn :global(svg) {
    flex-shrink: 0;
  }

  /* PIN flow */
  .pin-flow {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-5);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
  }

  .pin-flow-label {
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    color: var(--color-text-primary);
  }

  .pin-row {
    display: flex;
    gap: var(--space-3);
  }

  /* type=password rather than a -webkit- masking hack, so the digits are hidden
     in every browser the extension supports. */
  .pin-box {
    width: 40px;
    height: 48px;
    text-align: center;
    font-size: var(--text-xl);
    font-weight: var(--font-bold);
    font-family: var(--font-sans);
    border: 2px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    background: var(--color-bg-elevated);
    color: var(--color-text-primary);
    outline: none;
    transition: all var(--transition-fast);
  }

  .pin-box:focus {
    border-color: var(--color-accent);
    box-shadow: var(--shadow-focus);
  }

  .pin-box.filled {
    border-color: var(--color-accent);
  }

  .pin-box.error {
    border-color: var(--color-error);
  }

  .pin-error {
    font-size: var(--text-xs);
    color: var(--color-error);
  }

  .pin-flow-actions {
    display: flex;
    gap: var(--space-3);
  }

  :global(.inline-icon) {
    vertical-align: -2px;
  }

  /* Cloud Sync */
  .card-icon.sync {
    background: var(--color-accent-soft);
    color: var(--color-accent);
  }

  .sync-status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-5);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
  }

  .sync-status-indicator {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-success);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
  }

  .sync-status-indicator.syncing {
    color: var(--color-accent);
  }

  .sync-status-indicator.error {
    color: var(--color-error);
  }

  .sync-status-indicator.conflict {
    color: var(--color-warning);
  }

  .sync-status-text {
    font-size: var(--text-sm);
  }

  .sync-last-time {
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
  }

  /* Banners */
  .banner {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
    border-radius: var(--radius-lg);
    border: 1px solid;
  }

  .banner.warning {
    background: var(--color-warning-soft);
    border-color: var(--color-warning);
  }

  .banner.warning :global(svg) {
    color: var(--color-warning);
  }

  .banner.error {
    background: var(--color-error-soft);
    border-color: var(--color-error);
  }

  .banner.error :global(svg) {
    color: var(--color-error);
  }

  .banner :global(svg) {
    flex-shrink: 0;
    margin-top: 1px;
  }

  .banner-text {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
  }

  .banner-title {
    font-size: var(--text-sm);
    font-weight: var(--font-semibold);
    color: var(--color-text-primary);
  }

  .banner-desc {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    line-height: var(--leading-relaxed);
  }

  /* Amber needs a dark foreground; white on --color-warning is ~2:1. */
  .review-btn {
    padding: var(--space-2) var(--space-5);
    border: 1px solid var(--color-warning);
    border-radius: var(--radius-md);
    background: var(--color-warning);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    font-weight: var(--font-semibold);
    color: var(--color-on-warning);
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .review-btn:hover {
    background: var(--color-warning-hover);
    border-color: var(--color-warning-hover);
  }

  .review-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .spinner-sm {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--color-border-primary);
    border-top-color: currentColor;
    border-radius: var(--radius-full);
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }
</style>
