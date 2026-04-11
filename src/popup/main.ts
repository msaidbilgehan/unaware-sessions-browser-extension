import '@shared/theme.css';
import { initTheme } from '@shared/theme-store';
import { initSettings } from '@shared/settings-store';
import { initSecurity } from '@shared/security-store';
import App from './App.svelte';
import { mount } from 'svelte';

initTheme();

Promise.all([initSettings(), initSecurity()]).then(() => {
  mount(App, { target: document.getElementById('app')! });
});
