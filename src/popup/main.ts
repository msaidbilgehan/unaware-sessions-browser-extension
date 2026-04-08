import '@shared/theme.css';
import { initTheme } from '@shared/theme-store';
import { initSettings } from '@shared/settings-store';
import App from './App.svelte';
import { mount } from 'svelte';

initTheme();

initSettings().then(() => {
  mount(App, { target: document.getElementById('app')! });
});
