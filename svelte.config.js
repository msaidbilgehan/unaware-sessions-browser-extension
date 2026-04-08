import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  onwarn(warning, handler) {
    // Intentional: we use $state(prop) to capture initial prop values as mutable local state
    if (warning.code === 'state_referenced_locally') return;
    handler(warning);
  },
};
