<script lang="ts">
  import Icon from './Icon.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import {
    isPasscodeEnabled,
    isBiometricEnabled,
    isBiometricAvailable,
    verifyAndUnlock,
    verifyBiometric,
    resetSecurity,
  } from '@shared/security-store';

  interface Props {
    onauth: () => void;
    oncancel: () => void;
  }

  let { onauth, oncancel }: Props = $props();

  let digits = $state<string[]>(['', '', '', '']);
  let error = $state('');
  let verifying = $state(false);
  let failCount = $state(0);
  let cooldownUntil = $state(0);
  let cooldownLabel = $state('');
  let cooldownTimer = $state<ReturnType<typeof setInterval> | null>(null);
  let biometricAvailable = $state(false);
  let biometricAutoTriggered = false;
  let showResetConfirm = $state(false);

  let dialogRef = $state<HTMLDivElement | undefined>(undefined);
  let inputRefs = $state<(HTMLInputElement | null)[]>([null, null, null, null]);

  const MAX_ATTEMPTS = 5;
  const COOLDOWN_MS = 30000;

  const showPasscode = $derived(isPasscodeEnabled());
  const showBiometric = $derived(isBiometricEnabled() && biometricAvailable);

  $effect(() => {
    isBiometricAvailable().then((available) => {
      biometricAvailable = available;
    });
  });

  // Clean up cooldown timer on component destroy
  $effect(() => {
    return () => {
      if (cooldownTimer) clearInterval(cooldownTimer);
    };
  });

  // Auto-trigger biometric once on mount; focus PIN as fallback
  $effect(() => {
    if (!dialogRef) return;

    if (showBiometric && !biometricAutoTriggered) {
      biometricAutoTriggered = true;
      handleBiometric();
    }

    if (showPasscode) {
      const firstInput = inputRefs[0];
      if (firstInput) firstInput.focus();
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      oncancel();
    }
    if (e.key === 'Tab' && dialogRef) {
      const focusable = dialogRef.querySelectorAll<HTMLElement>(
        'button, input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function handleDigitInput(index: number, e: Event) {
    const input = e.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '');
    digits[index] = value.slice(-1);
    input.value = digits[index];

    if (digits[index] && index < 3) {
      inputRefs[index + 1]?.focus();
    }

    if (digits.every((d) => d.length === 1)) {
      submitPasscode();
    }
  }

  function handleDigitKeydown(index: number, e: KeyboardEvent) {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        e.preventDefault();
        digits[index - 1] = '';
        inputRefs[index - 1]?.focus();
      } else {
        digits[index] = '';
      }
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < 3) {
      e.preventDefault();
      inputRefs[index + 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent) {
    e.preventDefault();
    const text = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, 4);
    for (let i = 0; i < 4; i++) {
      digits[i] = text[i] ?? '';
    }
    // Update input values
    for (let i = 0; i < 4; i++) {
      if (inputRefs[i]) inputRefs[i]!.value = digits[i];
    }
    if (text.length === 4) {
      submitPasscode();
    } else {
      const nextEmpty = digits.findIndex((d) => !d);
      if (nextEmpty >= 0) inputRefs[nextEmpty]?.focus();
    }
  }

  async function submitPasscode() {
    if (verifying || isCoolingDown()) return;
    const pin = digits.join('');
    if (pin.length !== 4) return;

    verifying = true;
    error = '';
    try {
      const valid = await verifyAndUnlock(pin);
      if (valid) {
        onauth();
      } else {
        failCount++;
        if (failCount >= MAX_ATTEMPTS) {
          startCooldown();
        }
        error = failCount >= MAX_ATTEMPTS ? 'Too many attempts' : 'Incorrect passcode';
        clearDigits();
      }
    } finally {
      verifying = false;
    }
  }

  async function handleBiometric() {
    if (verifying) return;
    verifying = true;
    error = '';
    try {
      const valid = await verifyBiometric();
      if (valid) {
        onauth();
      } else {
        error = 'Biometric verification failed';
      }
    } finally {
      verifying = false;
    }
  }

  function clearDigits() {
    digits = ['', '', '', ''];
    for (const ref of inputRefs) {
      if (ref) ref.value = '';
    }
    inputRefs[0]?.focus();
  }

  function isCoolingDown(): boolean {
    return cooldownUntil > Date.now();
  }

  function startCooldown() {
    cooldownUntil = Date.now() + COOLDOWN_MS;
    updateCooldownLabel();
    cooldownTimer = setInterval(() => {
      if (Date.now() >= cooldownUntil) {
        if (cooldownTimer) clearInterval(cooldownTimer);
        cooldownTimer = null;
        cooldownLabel = '';
        failCount = 0;
      } else {
        updateCooldownLabel();
      }
    }, 1000);
  }

  function updateCooldownLabel() {
    const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
    cooldownLabel = `Try again in ${remaining}s`;
  }

  async function handleResetConfirm() {
    showResetConfirm = false;
    await resetSecurity();
    oncancel();
  }
</script>

<div class="backdrop" onkeydown={handleKeydown} onclick={oncancel} role="presentation">
  <div
    class="dialog"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="auth-title"
    aria-describedby="auth-desc"
    bind:this={dialogRef}
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    <div class="header">
      <div class="lock-icon">
        <Icon name="lock" size={20} />
      </div>
      <h3 id="auth-title">Authentication Required</h3>
      <p id="auth-desc">Verify your identity to continue</p>
    </div>

    {#if showPasscode}
      <div class="pin-section">
        <div class="pin-inputs" class:shake={error && !isCoolingDown()}>
          {#each digits as _, i}
            <input
              bind:this={inputRefs[i]}
              type="tel"
              inputmode="numeric"
              maxlength="1"
              autocomplete="off"
              class="pin-digit"
              class:filled={digits[i].length > 0}
              class:error={!!error}
              disabled={verifying || isCoolingDown()}
              oninput={(e) => handleDigitInput(i, e)}
              onkeydown={(e) => handleDigitKeydown(i, e)}
              onpaste={handlePaste}
              aria-label="Digit {i + 1} of 4"
            />
          {/each}
        </div>

        {#if error}
          <p class="error-text" role="alert">{error}</p>
        {/if}

        {#if cooldownLabel}
          <p class="cooldown-text">{cooldownLabel}</p>
        {/if}
      </div>
    {/if}

    {#if showPasscode && showBiometric}
      <div class="divider">
        <span>or</span>
      </div>
    {/if}

    {#if showBiometric}
      <button
        class="biometric-btn"
        onclick={handleBiometric}
        disabled={verifying}
      >
        <Icon name="fingerprint" size={18} />
        Use Biometric
      </button>
    {/if}

    <div class="actions">
      <button class="cancel-btn" onclick={oncancel}>Cancel</button>
      {#if showPasscode}
        <button class="forgot-btn" onclick={() => (showResetConfirm = true)}>
          Forgot Passcode?
        </button>
      {/if}
    </div>
  </div>
</div>

{#if showResetConfirm}
  <ConfirmDialog
    title="Reset Security"
    message="This will disable passcode and biometric authentication. Your session data will not be affected."
    confirmLabel="Reset"
    danger={true}
    onconfirm={handleResetConfirm}
    oncancel={() => (showResetConfirm = false)}
  />
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: var(--color-bg-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(2px);
  }

  .dialog {
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    max-width: 320px;
    width: 90%;
    box-shadow: var(--shadow-lg);
  }

  .header {
    text-align: center;
    margin-bottom: var(--space-6);
  }

  .lock-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-full);
    background: var(--color-bg-tertiary);
    color: var(--color-accent);
    margin-bottom: var(--space-4);
  }

  h3 {
    margin: 0 0 var(--space-2);
    font-size: var(--text-md);
    font-weight: var(--font-semibold);
    color: var(--color-text-primary);
  }

  .header p {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-tertiary);
  }

  .pin-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }

  .pin-inputs {
    display: flex;
    gap: var(--space-4);
    justify-content: center;
  }

  .pin-digit {
    width: 44px;
    height: 52px;
    text-align: center;
    font-size: var(--text-xl);
    font-weight: var(--font-bold);
    border: 2px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    outline: none;
    transition: all var(--transition-fast);
    -webkit-text-security: disc;
  }

  .pin-digit:focus {
    border-color: var(--color-accent);
    box-shadow: var(--shadow-focus);
  }

  .pin-digit.filled {
    border-color: var(--color-accent);
  }

  .pin-digit.error {
    border-color: var(--color-error);
  }

  .pin-digit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .shake {
    animation: shake 0.4s ease;
  }

  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-6px); }
    40% { transform: translateX(6px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
  }

  .error-text {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--color-error);
    text-align: center;
  }

  .cooldown-text {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--color-text-tertiary);
    text-align: center;
  }

  .divider {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin: var(--space-5) 0;
    color: var(--color-text-tertiary);
    font-size: var(--text-xs);
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--color-border-primary);
  }

  .biometric-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-4) var(--space-5);
    border: 1px solid var(--color-border-primary);
    border-radius: var(--radius-md);
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .biometric-btn:hover {
    background: var(--color-interactive-hover);
  }

  .biometric-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .biometric-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: var(--space-5);
  }

  .cancel-btn {
    padding: var(--space-3) var(--space-5);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: var(--font-medium);
    background: var(--color-bg-tertiary);
    border: 1px solid var(--color-border-primary);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .cancel-btn:hover {
    background: var(--color-interactive-hover);
  }

  .cancel-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .forgot-btn {
    padding: var(--space-2) var(--space-3);
    background: none;
    border: none;
    color: var(--color-text-tertiary);
    font-size: var(--text-xs);
    cursor: pointer;
    text-decoration: underline;
    transition: color var(--transition-fast);
  }

  .forgot-btn:hover {
    color: var(--color-text-secondary);
  }

  .forgot-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
    border-radius: var(--radius-sm);
  }
</style>
