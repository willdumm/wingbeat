/**
 * The code-derived parts of the docs-site home page (site/, see src/showcase/index.ts).
 * The page's prose and layout are Hugo's: site/content/_index.md, laid out by
 * site/layouts/home.html and the shortcodes in site/layouts/_shortcodes/. This supplies
 * what those templates can't write themselves (styles, head and body scripts, the logo,
 * the phone mockup) as site/data/showcase.json. The demo frames (`[data-demo]`) are filled
 * at runtime by showcase.js with the real dashboard/analytics renderers, each in its own
 * shadow root (see scripts.ts).
 * All styling here is Wingbeat tokens from shared/theme.ts; the page only lays out
 * sections and frames — the UI inside the frames brings its own stylesheet.
 */
import { themeVars, themeFontImport, themeInitScript } from '../shared/theme';
import { mapLayerColorInitScript } from '../shared/map-controls';
import { brandStyles, logoLockupMarkup, logoFaviconHref, logoFaviconScript } from '../shared/brand';
import { iconStyles, iconRuntimeScript, icon } from '../shared/icons';
import { statusStyles } from '../shared/status';
import { segmentedControlStyles } from '../shared/segmented-control';
import { sharedButtonStyles } from '../shared/buttons';
import { SampleNotification, NOTIFICATION_TIME_TOKEN } from './sample-data';

/**
 * Name of the `<meta>` carrying the showcase's Carto key. The key is never in the
 * generated page: site/layouts/home.html adds this tag at Hugo build time from the
 * `showcaseCartoKey` param (HUGO_PARAMS_SHOWCASECARTOKEY), and scripts.ts reads it.
 * Keep the name in sync with home.html.
 */
export const SHOWCASE_TILE_KEY_META = 'showcase-carto-key';

/** Hero photo (site/static/showcase/), relative so it works wherever Hugo's baseURL puts the site root. */
const HERO_IMAGE = { large: 'showcase/hero-2000.jpg', small: 'showcase/hero-1200.jpg' };

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * A phone lock screen with the newest few sample notifications. Titles and messages are
 * the app's own formatting (sample-data.ts); showcase.js fills in the times, which
 * depend on the visitor's clock (`data-notif-ago` seconds before now).
 */
function phoneMockup(notifications: SampleNotification[]): string {
  const items = notifications.slice(0, 4).map((n) => {
    const [before, after] = n.message.split(NOTIFICATION_TIME_TOKEN).map(escapeHtml);
    return /* html */ `
          <li class="sc-notif">
            <span class="sc-notif-icon">${icon('bell', { size: 16 })}</span>
            <div class="sc-notif-body">
              <div class="sc-notif-head"><span>Pushover</span><span data-notif-ago="${n.agoSec}" data-notif-format="relative"></span></div>
              <p class="sc-notif-title">${escapeHtml(n.title)}</p>
              <p class="sc-notif-msg">${before}<span data-notif-ago="${n.agoSec}"></span>${after ?? ''}</p>
            </div>
          </li>`;
  }).join('');
  return /* html */ `
        <div class="sc-phone" role="img" aria-label="Phone lock screen showing takeoff and landing notifications">
          <div class="sc-phone-clock" data-phone-clock></div>
          <ol class="sc-notifs">${items}
          </ol>
        </div>`;
}

/** The header's menu button for narrow screens; both glyphs are rendered, CSS shows one. */
function menuButtonMarkup(): string {
  return /* html */ `<button class="btn-secondary sc-menu-btn" type="button" aria-label="Menu" aria-expanded="false" aria-controls="sc-menu">${icon('menu', { className: 'sc-menu-icon-open' })}${icon('x', { className: 'sc-menu-icon-close' })}</button>`;
}

/** Opens and closes the narrow-screen header menu (see .sc-menu in showcasePageStyles). */
function showcaseMenuScript(): string {
  return `(() => {
    const header = document.querySelector('.sc-header');
    const btn = header && header.querySelector('.sc-menu-btn');
    if (!btn) return;
    const isOpen = () => header.hasAttribute('data-menu-open');
    const setOpen = open => {
      header.toggleAttribute('data-menu-open', open);
      btn.setAttribute('aria-expanded', String(open));
    };
    btn.addEventListener('click', () => setOpen(!isOpen()));
    // Following a link (they're all in-page anchors or other pages) closes the menu.
    header.querySelector('.sc-menu').addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('click', e => { if (isOpen() && !header.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) { setOpen(false); btn.focus(); } });
    window.matchMedia('(min-width: 961px)').addEventListener('change', e => { if (e.matches) setOpen(false); });
  })();`;
}

export function showcasePageStyles(): string {
  return `
    ${sharedButtonStyles()}

    *, *::before, *::after { box-sizing: border-box; }
    html { scroll-behavior: smooth; scroll-padding-top: 80px; }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
    body {
      margin: 0;
      background: var(--bg-base);
      color: var(--text-primary);
      font-family: var(--font-body);
      font-size: var(--size-base);
      line-height: var(--leading-normal);
      -webkit-font-smoothing: antialiased;
    }
    h1, h2, h3 { font-family: var(--font-display); color: var(--text-primary); margin: 0; }
    p { margin: 0; }
    a { color: var(--accent-text); }

    .sc-container {
      max-width: var(--content-max);
      margin: 0 auto;
      padding: 0 var(--space-6);
    }
    @media (max-width: 640px) { .sc-container { padding: 0 var(--space-4); } }

    .sc-overline {
      font-family: var(--font-ui);
      font-size: var(--size-2xs);
      font-weight: var(--weight-bold);
      letter-spacing: var(--tracking-caps);
      text-transform: uppercase;
      color: var(--accent-text);
    }

    .sc-btn-lg { min-height: var(--control-h-md); padding: 0 var(--space-5); font-size: var(--size-md); text-decoration: none; }
    .sc-btn-md { padding: 0 var(--space-4); font-size: var(--size-sm); text-decoration: none; }

    /* ── Skip link: off-screen until focused ─────────────────────────────── */
    .sc-skip-link {
      position: absolute;
      left: var(--space-4);
      top: var(--space-2);
      z-index: 40;
      padding: var(--space-2) var(--space-4);
      background: var(--surface-1);
      color: var(--text-primary);
      font-family: var(--font-ui);
      font-weight: var(--weight-semibold);
      border-radius: var(--radius-md);
      box-shadow: var(--ring-focus);
      transform: translateY(-200%);
    }
    .sc-skip-link:focus { transform: none; }
    main:focus { outline: none; }

    /* ── Header ──────────────────────────────────────────────────────────── */
    .sc-header {
      position: sticky;
      top: 0;
      z-index: 30;
      background: var(--surface-float);
      backdrop-filter: var(--glass-blur);
      -webkit-backdrop-filter: var(--glass-blur);
      border-bottom: 1px solid var(--border-subtle);
    }
    .sc-header-inner { height: 64px; display: flex; align-items: center; gap: var(--space-8); }
    /* The lockup may shrink, so at 320px the wordmark ellipsizes instead of overflowing. */
    .sc-home-link { display: flex; min-width: 0; text-decoration: none; }
    .sc-header .wb-logo { flex: 0 1 auto; }
    .sc-nav { display: flex; gap: var(--space-6); }
    .sc-nav a {
      font-family: var(--font-ui);
      font-size: var(--size-md);
      font-weight: var(--weight-semibold);
      color: var(--text-muted);
      text-decoration: none;
      padding: var(--space-2) 0;
      transition: color var(--duration-fast) var(--ease-standard);
    }
    .sc-nav a:hover { color: var(--text-primary); }
    .sc-header-actions { margin-left: auto; display: flex; gap: var(--space-3); white-space: nowrap; }
    /* Wide: the menu's links and actions sit in the header row. Narrow: they fold into a
       panel under the header that the menu button opens (showcaseMenuScript). */
    .sc-menu { display: contents; }
    .sc-menu-btn { display: none; }
    @media (max-width: 960px) {
      .sc-menu-btn { display: inline-flex; flex: none; margin-left: auto; width: var(--control-h-md); min-height: var(--control-h-md); padding: 0; }
      .sc-menu-btn[aria-expanded="true"] .sc-menu-icon-open,
      .sc-menu-btn[aria-expanded="false"] .sc-menu-icon-close { display: none; }
      .sc-menu {
        display: none;
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        flex-direction: column;
        gap: var(--space-4);
        max-height: calc(100svh - 65px);
        overflow-y: auto;
        padding: var(--space-2) var(--space-6) var(--space-5);
        background: var(--surface-1);
        border-bottom: 1px solid var(--border);
        box-shadow: var(--shadow-lg);
      }
      .sc-header[data-menu-open] .sc-menu { display: flex; }
      .sc-nav { flex-direction: column; gap: 0; }
      .sc-nav a { padding: var(--space-3) 0; border-bottom: 1px solid var(--border-subtle); }
      .sc-header-actions { margin-left: 0; }
      .sc-header-actions > a { flex: 1; }
    }
    @media (max-width: 640px) { .sc-menu { padding-inline: var(--space-4); } }

    /* ── Hero ────────────────────────────────────────────────────────────── */
    .sc-hero {
      position: relative;
      overflow: hidden;
      background: var(--bg-base);
      border-bottom: 1px solid var(--border-subtle);
    }
    /* The photo sits at the top and runs on past where the copy starts, fading out behind
       the title, so the rest of the copy reads on plain background in either theme. It
       takes whatever height the copy leaves: at least --hero-photo-h on small screens, and
       on desktop, where the hero fills the viewport below the sticky header (64px + 1px
       border), everything above the copy. */
    .sc-hero {
      --hero-photo-h: clamp(11rem, min(24vw, 30vh), 20rem);
      --hero-photo-overlap: clamp(4.5rem, 10vw, 8.5rem);
      display: flex;
      flex-direction: column;
    }
    @media (min-width: 801px) { .sc-hero { min-height: calc(100svh - 65px); } }
    .sc-hero-photo {
      flex: 1 0 calc(var(--hero-photo-h) + var(--hero-photo-overlap));
      margin-bottom: calc(-1 * var(--hero-photo-overlap));
      background: url('${HERO_IMAGE.large}') center 30% / cover no-repeat;
      -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 1.25 * var(--hero-photo-overlap)), transparent);
      mask-image: linear-gradient(to bottom, #000 calc(100% - 1.25 * var(--hero-photo-overlap)), transparent);
    }
    @media (max-width: 800px) { .sc-hero-photo { background-image: url('${HERO_IMAGE.small}'); } }
    .sc-hero-inner { position: relative; width: 100%; padding-bottom: var(--space-12); }
    .sc-hero-copy { max-width: 64rem; margin-inline: auto; }
    .sc-hero h1 {
      font-size: var(--size-5xl);
      line-height: var(--leading-tight);
      letter-spacing: var(--tracking-display);
      font-weight: var(--weight-extrabold);
      margin: 0 0 var(--space-5);
      text-wrap: balance;
      text-align: center;
    }
    .sc-hero-lede {
      font-size: var(--size-lg);
      line-height: var(--leading-relaxed);
      color: var(--text-muted);
      max-width: var(--prose-max);
      margin-inline: auto;
      text-align: center;
    }
    .sc-actions { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-8); }
    .sc-hero .sc-actions { justify-content: center; }
    .sc-hero-demo { margin: 0 0 var(--space-6); }
    @media (max-width: 640px) {
      .sc-hero-inner { padding-bottom: var(--space-10); }
      .sc-hero h1 { font-size: var(--size-3xl); }
      .sc-hero-lede { font-size: var(--size-base); }
      .sc-hero-demo { margin: 0 0 var(--space-5); }
    }

    /* ── Feature sections ────────────────────────────────────────────────── */
    .sc-section { padding: var(--space-24) 0; border-bottom: 1px solid var(--border-subtle); }
    .sc-section:nth-of-type(even) { background: var(--surface-1); }
    @media (max-width: 640px) { .sc-section { padding: var(--space-16) 0; } }

    .sc-section-head { max-width: 44rem; margin-bottom: var(--space-10); }
    .sc-section h2 {
      font-size: var(--size-3xl);
      line-height: var(--leading-snug);
      letter-spacing: var(--tracking-display);
      font-weight: var(--weight-extrabold);
      margin: var(--space-3) 0 var(--space-4);
      text-wrap: balance;
    }
    @media (max-width: 640px) { .sc-section h2 { font-size: var(--size-2xl); } }
    .sc-lede { font-size: var(--size-base); line-height: var(--leading-relaxed); color: var(--text-muted); max-width: var(--prose-max); }
    /* Ledes and plan descriptions are rendered Markdown, so they may run to several paragraphs. */
    .sc-lede p + p, .sc-hero-lede p + p, .sc-plan-desc p + p { margin-top: var(--space-3); }
    .sc-link {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      margin-top: var(--space-4);
      font-family: var(--font-ui);
      font-size: var(--size-md);
      font-weight: var(--weight-semibold);
      color: var(--accent-text);
      text-decoration: none;
    }
    .sc-link:hover { text-decoration: underline; }

    .sc-facts {
      list-style: none;
      margin: var(--space-8) 0 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
      gap: var(--space-6);
    }
    /* Each item is "**Term** text" in content/_index.md; the term sits on its own line. */
    .sc-facts li {
      padding-top: var(--space-4);
      border-top: 1px solid var(--border);
      font-size: var(--size-md);
      line-height: var(--leading-normal);
      color: var(--text-muted);
    }
    .sc-facts strong { display: block; margin-bottom: var(--space-1); font-family: var(--font-ui); font-weight: var(--weight-bold); color: var(--text-primary); }

    /* Text beside a demo on wide screens, stacked on narrow ones. */
    .sc-split {
      display: grid;
      grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
      gap: var(--space-16);
      align-items: start;
    }
    .sc-split .sc-section-head { margin-bottom: 0; position: sticky; top: 104px; }
    .sc-split .sc-facts { grid-template-columns: 1fr; gap: var(--space-4); }
    @media (max-width: 960px) {
      .sc-split { grid-template-columns: minmax(0, 1fr); gap: var(--space-10); }
      .sc-split .sc-section-head { position: static; }
    }

    /* ── Demo frames ─────────────────────────────────────────────────────── */
    .sc-demo-caption {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      margin-bottom: var(--space-3);
      font-family: var(--font-ui);
      font-size: var(--size-sm);
      font-weight: var(--weight-semibold);
      color: var(--text-muted);
    }
    .sc-demo {
      display: block;
      position: relative;
      isolation: isolate;
      overflow: hidden;
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
    }
    .sc-demo--flights   { height: 580px; }
    .sc-demo--duty      { height: 540px; }
    .sc-demo--analytics { height: 620px; }
    .sc-demo--maintenance { min-height: 420px; }
    .sc-demo--status    { min-height: 52px; }
    @media (max-width: 640px) {
      .sc-demo--flights   { height: 520px; }
      .sc-demo--analytics { height: 820px; }
    }

    /* ── Notification mockup ─────────────────────────────────────────────── */
    /* Caption + phone share one centered column so the caption lines up with the phone. */
    .sc-phone-demo { max-width: 24rem; margin: 0 auto; }
    .sc-phone {
      width: 100%;
      padding: var(--space-10) var(--space-3) var(--space-8);
      background: linear-gradient(170deg, var(--accent-surface), var(--surface-2));
      border: 1px solid var(--border);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-lg);
    }
    .sc-phone-clock {
      min-height: 1.2em;
      margin-bottom: var(--space-8);
      text-align: center;
      font-family: var(--font-display);
      font-size: var(--size-5xl);
      font-weight: var(--weight-bold);
      letter-spacing: var(--tracking-display);
      line-height: 1.1;
      color: var(--text-primary);
    }
    .sc-notifs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
    .sc-notif {
      display: flex;
      gap: var(--space-3);
      padding: var(--space-3);
      background: var(--surface-float);
      backdrop-filter: var(--glass-blur);
      -webkit-backdrop-filter: var(--glass-blur);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
    }
    .sc-notif-icon {
      flex: none;
      display: grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      border-radius: var(--radius-md);
      background: var(--accent);
      color: var(--accent-fg);
    }
    .sc-notif-body { min-width: 0; flex: 1; }
    .sc-notif-head {
      display: flex;
      justify-content: space-between;
      gap: var(--space-2);
      font-family: var(--font-ui);
      font-size: var(--size-2xs);
      font-weight: var(--weight-semibold);
      letter-spacing: var(--tracking-caps);
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .sc-notif-head span:last-child { text-transform: none; letter-spacing: normal; font-weight: var(--weight-medium); }
    .sc-notif-title {
      margin-top: var(--space-1);
      font-family: var(--font-ui);
      font-size: var(--size-sm);
      font-weight: var(--weight-bold);
      color: var(--text-primary);
    }
    .sc-notif-msg {
      font-size: var(--size-sm);
      line-height: var(--leading-snug);
      color: var(--text-secondary);
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      overflow-wrap: anywhere;
    }

    /* ── Hosting plans ───────────────────────────────────────────────────── */
    .sc-plans {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
      gap: var(--space-6);
      align-items: stretch;
    }
    .sc-plan {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-6);
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
    }
    .sc-plan--featured { border-color: var(--accent); box-shadow: var(--shadow-md); }
    .sc-plan h3 { font-size: var(--size-lg); font-weight: var(--weight-bold); }
    .sc-plan-price { display: flex; align-items: baseline; gap: var(--space-1); }
    .sc-plan-amount {
      font-family: var(--font-display);
      font-size: var(--size-3xl);
      font-weight: var(--weight-extrabold);
      letter-spacing: var(--tracking-display);
      color: var(--text-primary);
    }
    .sc-plan-period { font-family: var(--font-ui); font-size: var(--size-sm); color: var(--text-muted); }
    .sc-plan-desc { font-size: var(--size-md); color: var(--text-muted); }
    .sc-plan-list {
      list-style: none;
      margin: var(--space-2) 0 0;
      padding: var(--space-4) 0 0;
      border-top: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      font-size: var(--size-md);
      color: var(--text-primary);
    }
    .sc-plan-list li { display: flex; gap: var(--space-2); align-items: flex-start; }
    .sc-plan-list svg { flex: none; margin-top: 0.2em; color: var(--success-fg); }
    .sc-plan--wide {
      margin-top: var(--space-6);
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-8);
      background: var(--surface-0);
    }
    .sc-plan-wide-copy { display: flex; flex-direction: column; gap: var(--space-3); max-width: 44rem; }
    /* A regular card's contact button sits at the bottom, so buttons line up across the row. */
    .sc-plan > .sc-actions { margin-top: auto; padding-top: var(--space-3); }
    .sc-plan > .sc-actions > a { flex: 1; justify-content: center; }
    .sc-plan--wide .sc-actions { margin-top: 0; padding-top: 0; flex: none; }
    .sc-plan--wide .sc-actions > a { flex: none; }
    @media (max-width: 800px) { .sc-plan--wide { flex-direction: column; align-items: stretch; } }

    /* ── Footer ──────────────────────────────────────────────────────────── */
    .sc-footer { padding: var(--space-12) 0; border-top: 1px solid var(--border-subtle); }
    .sc-footer-inner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-6);
    }
    .sc-footer-links { display: flex; flex-wrap: wrap; gap: var(--space-6); }
    .sc-footer-links a {
      font-family: var(--font-ui);
      font-size: var(--size-sm);
      font-weight: var(--weight-semibold);
      color: var(--text-muted);
      text-decoration: none;
    }
    .sc-footer-links a:hover { color: var(--text-primary); }
    .sc-footer .settings-theme-row { width: 15rem; }
    .sc-plan-desc a, .sc-footer-note a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
    .sc-plan-desc a:hover, .sc-footer-note a:hover { color: var(--accent); }
    .sc-footer-note {
      width: 100%;
      font-family: var(--font-mono);
      font-size: var(--size-xs);
      color: var(--text-muted);
    }
  `;
}


/**
 * site/data/showcase.json: the pieces of the home page that come from the app's code,
 * for site/layouts/home.html and its shortcodes to place. `scriptSrc` is the showcase
 * bundle's URL relative to the page.
 */
export interface ShowcasePageData {
  appName: string;
  /** Everything in `<head>` after the title and description. */
  head: string;
  /** The end of `<body>`: Leaflet and friends, the icon runtime, then showcase.js. */
  scripts: string;
  logo: { header: string; footer: string };
  /** The header's menu toggle, shown on narrow screens. */
  menuButton: string;
  /** The `{{< demo name="notifications" >}}` phone mockup. */
  phone: string;
}

export function showcasePageData(appName: string, scriptSrc: string, notifications: SampleNotification[]): ShowcasePageData {
  return {
    appName,
    head: /* html */ `<link rel="icon" href="${logoFaviconHref()}" />
  <script>${themeInitScript()}</script>
  <script>${logoFaviconScript()}</script>
  <script>${mapLayerColorInitScript()}</script>
  <style>${themeFontImport()}${themeVars()}${brandStyles()}${iconStyles()}${statusStyles()}${segmentedControlStyles()}${showcasePageStyles()}</style>`,
    scripts: /* html */ `<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script>
  <script src="https://unpkg.com/pmtiles@3/dist/pmtiles.js"></script>
  <script src="https://unpkg.com/lucide@0.454.0/dist/umd/lucide.js"></script>
  <script>${iconRuntimeScript()}</script>
  <script>${showcaseMenuScript()}</script>
  <script src="${scriptSrc}"></script>`,
    logo: {
      header: logoLockupMarkup(`${appName} Flight Tracker`, { size: 32 }),
      footer: logoLockupMarkup(`${appName} Flight Tracker`, { size: 20 }),
    },
    menuButton: menuButtonMarkup(),
    phone: phoneMockup(notifications),
  };
}
