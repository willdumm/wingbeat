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

import { lightTokens, darkTokens, reducedMotionTokens } from '@wingbeat/core/tokens';

/** `name: value;` declarations for a token map. */
function tokenDecls(tokens: Record<string, string>): string {
  return Object.entries(tokens).map(([name, value]) => `--${name}: ${value};`).join('\n      ');
}

/** The CSS custom properties, generated from the design tokens in @wingbeat/core/tokens. */
export function themeVars(): string {
  return `
    :root {
      color-scheme: light;
      ${tokenDecls(lightTokens)}
    }

    @media (prefers-reduced-motion: reduce) {
      :root { ${tokenDecls(reducedMotionTokens)} }
    }

    [data-theme="dark"] {
      color-scheme: dark;
      ${tokenDecls(darkTokens)}
    }
  `;
}

/**
 * A token's light-mode value, for output that isn't themed and can't read CSS custom
 * properties (the duty log's PDF).
 */
export function lightThemeToken(name: string): string {
  const value = (lightTokens as Record<string, string>)[name.replace(/^--/, '')];
  if (value === undefined) throw new Error(`No light theme token ${name}`);
  return value;
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

    function getAccentColor() { return getCssVar('--accent', '${lightTokens.accent}'); }
    function getSuccessColor() { return getCssVar('--success-fg', '${lightTokens['success-fg']}'); }
    function getDangerColor() { return getCssVar('--danger', '${lightTokens.danger}'); }

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
        btn.setAttribute('aria-pressed', btn.dataset.themeVal === pref ? 'true' : 'false');
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
