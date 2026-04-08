import '@shared/theme.css';
import { initTheme } from '@shared/theme-store';
import App from './App.svelte';
import { mount } from 'svelte';

initTheme();

const app = mount(App, { target: document.getElementById('app')! });

export default app;
