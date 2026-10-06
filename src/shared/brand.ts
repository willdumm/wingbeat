/**
 * Wingbeat brand mark. The two-arc mark is committed once at the repo root
 * (`logo_plain.svg`) and imported here as raw text (see the `Text` module rule
 * in wrangler.toml) — every rendered use (header lockup, favicon) derives from
 * that one file, so swapping the mark later means replacing that file only.
 */
import rawLogoSvg from '../../logo_plain.svg';

const LOGO_SOURCE = rawLogoSvg
  .replace(/<\?xml[\s\S]*?\?>\s*/g, '')
  .replace(/<!--[\s\S]*?-->\s*/g, '')
  .trim();

const viewBoxMatch = LOGO_SOURCE.match(/viewBox="([^"]+)"/);
const LOGO_VIEWBOX = viewBoxMatch ? viewBoxMatch[1] : '0 0 120 40';
// Width/height of the mark's own artboard, so the rendered box hugs the mark instead of
// padding it out to a fixed ratio (which left a wide gap before the wordmark).
const LOGO_ASPECT = (() => {
  const [, , w, h] = LOGO_VIEWBOX.split(/[\s,]+/).map(Number);
  return w > 0 && h > 0 ? w / h : 1;
})();
// Mark height relative to the lockup's `size`: a little under the wordmark's cap-to-descender
// height, so the mark doesn't dominate the name.
const MARK_SCALE = 0.8;

const bodyMatch = LOGO_SOURCE.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
const LOGO_BODY_RAW = bodyMatch ? bodyMatch[1].trim() : '';

// Brand tone: the black wing tracks --text-primary so it stays visible against
// the app's own themed background in both light and dark mode (the blue wing is
// left alone — --accent is the same hex in both themes, see theme.ts).
const LOGO_BODY_BRAND = LOGO_BODY_RAW.replace(/fill:#000000/gi, 'fill:var(--text-primary,#000000)');

// A "mono" tone derived from the same source, for use over a dark background where
// the mark's literal ink/sky fills would lose contrast (e.g. the login/join screens).
// The design system calls this tone `mono-white`; rather than committing a second
// asset file, it's produced here by swapping the two hardcoded fills for currentColor.
const LOGO_BODY_MONO = LOGO_BODY_RAW
  .replace(/fill:#000000/gi, 'fill:currentColor')
  .replace(/fill:#2b7fc4/gi, 'fill:currentColor');

// Favicon: an isolated SVG document has no access to the page's CSS custom
// properties, so it can't just track --text-primary like the inline mark does.
// A plain prefers-color-scheme media query isn't enough either — the app's
// theme toggle (Settings → Light/Dark/System) can disagree with the OS/browser
// setting, and the favicon needs to follow *that*, not just the OS. So this
// produces two static variants and logoFaviconScript() below swaps between them
// in JS, driven by the same data-theme attribute the rest of the app uses.
const FAVICON_LIGHT = LOGO_SOURCE;
const FAVICON_DARK = LOGO_SOURCE.replace(/fill:#000000/gi, 'fill:#E9EEF2');

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * The mark sized from `size` px (MARK_SCALE × size tall, at the artboard's own aspect), optionally paired with a
 * wordmark in the display font. `appName` (not a hardcoded "Wingbeat") drives the
 * wordmark text since app_name is a per-tenant setting — see src/settings.ts.
 * `tone: 'mono'` renders both wings in currentColor, for placing on a dark surface.
 * `compact: true` shrinks just the mark and tightens the gap to the wordmark
 * (e.g. a page-header lockup sitting right next to a title) without affecting
 * the wordmark's own font size, which stays driven by `size`.
 */
export function logoLockupMarkup(
  appName: string,
  opts: { size?: number; showWordmark?: boolean; tone?: 'brand' | 'mono'; compact?: boolean } = {},
): string {
  const size = opts.size ?? 28;
  const showWordmark = opts.showWordmark ?? true;
  const tone = opts.tone ?? 'brand';
  const compact = opts.compact ?? false;
  const height = Math.round(size * MARK_SCALE);
  const width = Math.round(height * LOGO_ASPECT);
  const body = tone === 'mono' ? LOGO_BODY_MONO : LOGO_BODY_BRAND;
  const mark = `<svg width="${width}" height="${height}" viewBox="${LOGO_VIEWBOX}" class="wb-logo__mark" role="img" aria-label="${escapeHtml(appName)}">${body}</svg>`;
  const word = showWordmark ? `<span class="wb-logo__word">${escapeHtml(appName)}</span>` : '';
  const cls = ['wb-logo', tone === 'mono' ? 'wb-logo--mono' : '', compact ? 'wb-logo--compact' : ''].filter(Boolean).join(' ');
  return `<span class="${cls}" style="--wb-logo-size:${size}px;--wb-logo-aspect:${LOGO_ASPECT.toFixed(4)}">${mark}${word}</span>`;
}

/** CSS for the logo lockup produced by logoLockupMarkup(). */
export function brandStyles(): string {
  return `
    .wb-logo {
      display: inline-flex;
      align-items: center;
      gap: calc(var(--wb-logo-size, 28px) * 0.2);
      min-width: 0;
    }
    .wb-logo__mark { flex: none; display: block; }
    .wb-logo__word {
      font-family: var(--font-display);
      font-weight: var(--weight-extrabold);
      font-size: calc(var(--wb-logo-size, 28px) * 0.82);
      letter-spacing: var(--tracking-display);
      color: var(--text-primary);
      line-height: 1.2;
      /* Room for descenders (the "g") inside the overflow clip, without changing layout. */
      padding-bottom: 0.15em;
      margin-bottom: -0.15em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .wb-logo--mono, .wb-logo--mono .wb-logo__word { color: #FFFFFF; }

    .wb-logo--compact { gap: calc(var(--wb-logo-size, 28px) * 0.14); }
    .wb-logo--compact .wb-logo__mark {
      height: calc(var(--wb-logo-size, 28px) * 0.7);
      width: calc(var(--wb-logo-size, 28px) * 0.7 * var(--wb-logo-aspect, 1));
    }
  `;
}

/**
 * Data-URI favicon built from the same source file, so there's nothing separate
 * to keep in sync. `tone` picks the variant directly for pages that don't run
 * theme JS and know their theme up front (e.g. the always-dark auth pages) —
 * pages with a live theme toggle should use this only as the pre-JS default
 * and pair it with `logoFaviconScript()`.
 */
export function logoFaviconHref(tone: 'light' | 'dark' = 'light'): string {
  return `data:image/svg+xml,${encodeURIComponent(tone === 'dark' ? FAVICON_DARK : FAVICON_LIGHT)}`;
}

/**
 * Keeps the favicon in sync with `<html data-theme>` as it changes — covers
 * both the Settings theme toggle and the OS-level prefers-color-scheme
 * listener in themeRuntimeScript(), since both land on that same attribute.
 * Include once, after themeInitScript() has run (so data-theme is already set).
 */
export function logoFaviconScript(): string {
  const light = JSON.stringify(`data:image/svg+xml,${encodeURIComponent(FAVICON_LIGHT)}`);
  const dark = JSON.stringify(`data:image/svg+xml,${encodeURIComponent(FAVICON_DARK)}`);
  return `
    (function() {
      var FAVICON_LIGHT = ${light};
      var FAVICON_DARK = ${dark};
      function applyFavicon() {
        // Mutating an existing <link>'s href doesn't reliably repaint the tab
        // icon in every browser — swap in a fresh element instead, which does.
        document.querySelectorAll('link[rel="icon"]').forEach(function(l) { l.remove(); });
        var link = document.createElement('link');
        link.rel = 'icon';
        link.href = document.documentElement.getAttribute('data-theme') === 'dark' ? FAVICON_DARK : FAVICON_LIGHT;
        document.head.appendChild(link);
      }
      applyFavicon();
      new MutationObserver(applyFavicon).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    })();
  `;
}
