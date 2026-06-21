import '@shared/theme.css';
import '@shared/i18n';
import { initTheme } from '@shared/theme-store';
import { initSettings } from '@shared/settings-store';
import { initSecurity } from '@shared/security-store';
import { waitLocale } from 'svelte-i18n';
import App from './App.svelte';
import { mount } from 'svelte';

initTheme();

Promise.all([initSettings(), initSecurity(), waitLocale()]).then(() => {
  mount(App, { target: document.getElementById('app')! });
});
