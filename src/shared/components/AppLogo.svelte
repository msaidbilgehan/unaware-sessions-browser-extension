<script lang="ts">
  import { getTheme, onThemeChange } from '@shared/theme-store';
  import type { ThemePreference } from '@shared/theme-store';

  import lightLogo from '@shared/../assets/Unaware-Sessions-Extension-Icon/transparent/png/WhiteBG-SunDown-MoonUp.png';
  import darkLogo from '@shared/../assets/Unaware-Sessions-Extension-Icon/transparent/png/DarkBG-SunDown-MoonUp.png';

  interface Props {
    size?: number;
  }

  let { size = 24 }: Props = $props();

  let theme = $state<ThemePreference>(getTheme());

  $effect(() => {
    const unsub = onThemeChange((t) => {
      theme = t;
    });
    return unsub;
  });

  const isDark = $derived(
    theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches),
  );
  const logoSrc = $derived(isDark ? darkLogo : lightLogo);
</script>

<img class="app-logo" src={logoSrc} alt="Unaware Sessions" width={size} height={size} />

<style>
  .app-logo {
    display: block;
    flex-shrink: 0;
  }
</style>
