import '@shared/theme.css';
import { initTheme } from '@shared/theme-store';
import { initSettings } from '@shared/settings-store';
import { initSecurity } from '@shared/security-store';
import { requestPersistentStorage } from '@shared/persistent-storage';
import App from './App.svelte';
import { mount } from 'svelte';

initTheme();

// Belt and braces alongside the unlimitedStorage permission: snapshots live in
// a quota-managed bucket that Chrome may evict under storage pressure, which
// wipes every snapshot while the session profiles survive. persist() is
// Window-only, so the options page is where it can be requested.
void requestPersistentStorage();

Promise.all([initSettings(), initSecurity()]).then(() => {
  mount(App, { target: document.getElementById('app')! });
});
