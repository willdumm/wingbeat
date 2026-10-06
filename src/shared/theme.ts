/**
 * Theme system — CSS custom properties + init/runtime scripts.
 *
 * Usage:
 *   1. In <head>: inject themeInitScript() as a bare <script> BEFORE the stylesheet
 *      to prevent flash of wrong theme.
 *   2. In <style>: prepend themeVars() before the page stylesheet.
 *   3. In the page <script> IIFE: include themeRuntimeScript() early so setTheme()
 *      is available to the settings modal.
 *
 * Theme preference order: localStorage > OS prefers-color-scheme > light.
 */

export function themeVars(): string {
  return `
    :root {
      color-scheme: light;
      /* Backgrounds — Wingbeat "ink" neutrals, cool-leaning, never pure black/warm grey */
      --bg-base:        #F5F7F9;
      --surface-1:      #FFFFFF;
      --surface-0:      #F5F7F9;
      --surface-2:      #E9EEF2;
      --surface-hover:  #F5F7F9;
      --surface-float:  rgba(255, 255, 255, 0.82);
      --glass-border:   rgba(255, 255, 255, 0.65);
      --overlay:        rgba(245, 247, 249, 0.85);
      --scrim:          rgba(13, 37, 57, 0.42);
      /* Borders */
      --border:         #D3DBE2;
      --border-subtle:  #E9EEF2;
      --border-strong:  #A8B4C0;
      /* Text */
      --text-primary:   #0F1A24;
      --text-secondary: #2E3F4D;
      --text-muted:     #566574;
      --text-faint:     #7C8A98;
      /* Inputs */
      --input-bg:       #FFFFFF;
      /* Accent — Wingbeat "sky", anchored on the logo blue (#2b7fc4) */
      --accent:         #2B7FC4;
      --accent-hover:   #2166A0;
      --accent-fg:      #FFFFFF;
      --accent-text:    #2166A0;
      --accent-surface: #F4F9FD;
      /* Status — closed set: green on time, amber delayed, red cancelled */
      --success-fg:     #0E6B4E;
      --success-surface: #E9F6F1;
      --warning-fg:     #96600A;
      --warning-surface: #FDF4E3;
      --danger:         #D0453B;
      --danger-fg:      #9C2F27;
      --danger-surface: #FCECEA;
      /* "Live" — the single warm accent (Wingbeat "dusk"), reserved for a currently-
         in-progress state (e.g. an aircraft actually airborne right now). */
      --live-fg:        #A24D0C;
      --live-surface:   #FFF4EC;
      --live-dot:       #F07D26;
      /* Structural border (transparent in light → elevation via shadows) */
      --border-structural: transparent;
      /* Elevation shadows — sky-900 tinted, short and soft, never black */
      --shadow-sm:    0 1px 3px rgba(13,37,57,0.07), 0 1px 2px rgba(13,37,57,0.04);
      --shadow-md:    0 4px 12px rgba(13,37,57,0.08), 0 1px 3px rgba(13,37,57,0.04);
      --shadow-lg:    0 12px 28px rgba(13,37,57,0.10), 0 2px 6px rgba(13,37,57,0.05);
      --shadow-right: 3px 0 16px rgba(13,37,57,0.10);
      --ring-focus:   0 0 0 3px rgba(98,165,214,0.45);
      /* Shape */
      --radius-xs:      4px;
      --radius-sm:      6px;
      --radius-md:      10px;
      --radius-lg:      14px;
      --radius-xl:      20px;
      --radius-pill:    9999px;
      /* Controls */
      --control-h-sm:   32px;
      --control-h-md:   40px;
      /* Type — Manrope (display/UI), IBM Plex Sans (body), IBM Plex Mono (data) */
      --font-display: "Manrope", system-ui, sans-serif;
      --font-ui:      "Manrope", system-ui, sans-serif;
      --font-body:    "IBM Plex Sans", system-ui, sans-serif;
      --font-mono:    "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
      --weight-medium:    500;
      --weight-semibold:  600;
      --weight-bold:      700;
      --weight-extrabold: 800;
      --tracking-display: -0.025em;
      --tracking-heading: -0.015em;
      --tracking-wide:    0.02em;
      --tracking-caps:    0.09em;
      /* Type ramp + leading (design system rem scale, 16px base) — for page-level type
         outside the app chrome, e.g. the docs-site showcase (src/showcase/) */
      --size-2xs: 0.6875rem;
      --size-xs:  0.75rem;
      --size-sm:  0.8125rem;
      --size-md:  0.875rem;
      --size-base: 1rem;
      --size-lg:  1.125rem;
      --size-xl:  1.375rem;
      --size-2xl: 1.75rem;
      --size-3xl: 2.25rem;
      --size-4xl: 3rem;
      --size-5xl: 4rem;
      --leading-tight:   1.08;
      --leading-snug:    1.25;
      --leading-normal:  1.5;
      --leading-relaxed: 1.65;
      /* Space — 4px base; 20 and 28 are real steps */
      --space-1:  4px;
      --space-2:  8px;
      --space-3:  12px;
      --space-4:  16px;
      --space-5:  20px;
      --space-6:  24px;
      --space-7:  28px;
      --space-8:  32px;
      --space-10: 40px;
      --space-12: 48px;
      --space-16: 64px;
      --space-20: 80px;
      --space-24: 96px;
      /* Page layout */
      --content-max: 1200px;
      --prose-max:   64ch;
      --glass-blur:  blur(14px) saturate(1.1);
      /* Motion — short and level; nothing bounces */
      --duration-fast:   140ms;
      --duration-normal: 220ms;
      --ease-standard:   cubic-bezier(0.32, 0.72, 0.28, 1);
      --press-scale:     0.985;
    }

    @media (prefers-reduced-motion: reduce) {
      :root { --duration-fast: 0ms; --duration-normal: 0ms; --press-scale: 1; }
    }

    [data-theme="dark"] {
      color-scheme: dark;
      --bg-base:        #0B1119;
      --surface-1:      #1C2B38;
      --surface-0:      #0F1A24;
      --surface-2:      #2E3F4D;
      --surface-hover:  rgba(255, 255, 255, 0.05);
      --surface-float:  rgba(28, 43, 56, 0.85);
      --glass-border:   rgba(255, 255, 255, 0.08);
      --overlay:        rgba(15, 23, 31, 0.75);
      --scrim:          rgba(0, 0, 0, 0.55);
      --border:         #2E3F4D;
      --border-subtle:  #1C2B38;
      --border-strong:  #566574;
      --text-primary:   #E9EEF2;
      --text-secondary: #A8B4C0;
      --text-muted:     #7C8A98;
      --text-faint:     #566574;
      --input-bg:       #0F1A24;
      --accent:         #2B7FC4;
      --accent-hover:   #62A5D6;
      --accent-fg:      #FFFFFF;
      --accent-text:    #9AC7E8;
      --accent-surface: rgba(43, 127, 196, 0.18);
      --success-fg:     #2FBE8E;
      --success-surface: rgba(47, 190, 142, 0.16);
      --warning-fg:     #E8A23A;
      --warning-surface: rgba(232, 162, 58, 0.16);
      --danger:         #E0574C;
      --danger-fg:      #FF9089;
      --danger-surface: rgba(208, 69, 59, 0.16);
      --live-fg:        #F9C193;
      --live-surface:   rgba(240, 125, 38, 0.18);
      --live-dot:       #F07D26;
      --border-structural: var(--border-subtle);
      --shadow-sm:    none;
      --shadow-md:    none;
      --shadow-lg:    none;
      --shadow-right: none;
      --ring-focus:   0 0 0 3px rgba(98,165,214,0.55);
    }
  `;
}

/** Google Fonts stand-ins for Manrope / IBM Plex Sans / IBM Plex Mono (see readme in the design system export — no licensed font binaries were supplied). */
export function themeFontImport(): string {
  return `@import url("https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap");`;
}

/** Tiny blocking script for <head> — sets data-theme before first paint. */
export function themeInitScript(): string {
  return `(function(){var s=localStorage.getItem('ft_theme');if(s==='dark'||s==='light'){document.documentElement.setAttribute('data-theme',s);}else if(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.setAttribute('data-theme','dark');}else{document.documentElement.setAttribute('data-theme','light');}})();`;
}

/** Runtime script for the page IIFE — setTheme(), OS change listener, button sync. */
export function themeRuntimeScript(): string {
  return `
    // ── Theme runtime ─────────────────────────────────────────────────────────

    // Reads a live theme token for Leaflet layers, which can't consume CSS custom
    // properties directly. \`fallback\` covers a layer built before first paint
    // (or off-DOM), where getComputedStyle has nothing to read yet.
    function getCssVar(name, fallback) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    }

    function getAccentColor() { return getCssVar('--accent', '#2B7FC4'); }
    function getSuccessColor() { return getCssVar('--success-fg', '#0E6B4E'); }
    function getDangerColor() { return getCssVar('--danger', '#D0453B'); }

    function _getThemePref() {
      return localStorage.getItem('ft_theme') || 'system';
    }

    function setTheme(val) {
      if (val === 'system') {
        localStorage.removeItem('ft_theme');
        const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      } else {
        localStorage.setItem('ft_theme', val);
        document.documentElement.setAttribute('data-theme', val);
      }
      _syncThemeButtons();
    }

    function _syncThemeButtons() {
      const pref = _getThemePref();
      document.querySelectorAll('.settings-theme-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.themeVal === pref);
      });
    }

    document.querySelectorAll('.settings-theme-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { setTheme(btn.dataset.themeVal); });
    });

    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
        if (!localStorage.getItem('ft_theme')) {
          document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        }
      });
    }
  `;
}
