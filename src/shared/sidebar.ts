import { logoLockupMarkup } from './brand';

/**
 * Phone-only top bar: the sidebar toggle, then the logo mark and page title (the page-nav tabs
 * live in the sidebar on phones). Wired by sharedSidebarToggleScripts(); `label`
 * should match the one passed there.
 */
export function mobileTopnavMarkup(appName: string, title: string, label: string): string {
  return /* html */ `
  <div id="mobile-topnav" class="mobile-topnav">
    <div class="mobile-topnav-row">
      <button id="mobile-sidebar-toggle" class="mobile-sidebar-toggle btn-secondary">&#8592; Show ${label}</button>
      ${logoLockupMarkup(appName, { size: 24, showWordmark: false })}
      <span class="mobile-topnav-sep" aria-hidden="true"></span>
      <span class="mobile-topnav-title">${title}</span>
    </div>
  </div>`;
}

/**
 * CSS for sidebar toggle behavior: desktop collapse (.collapsed) and mobile overlay (.open).
 *
 * @param sidebarSelector   CSS selector for the sidebar element ('aside' or '.analytics-panel')
 * @param mapWrapperSelector CSS selector for the sibling map container ('.map-wrapper' or '.analytics-map-wrapper')
 */
export function sharedSidebarToggleStyles(sidebarSelector: string, mapWrapperSelector: string): string {
  return `
    ${sidebarSelector} {
      transition: width 0.2s ease;
      /* The page has no bottom safe-area padding (the map runs to the screen edge), so
         the sidebar keeps its footer clear of the home indicator itself. */
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }

    @media (min-width: 641px) {
      ${sidebarSelector}.collapsed { width: 0; overflow: hidden; border-right-width: 0; }
    }

    @media (max-width: 640px) {
      ${sidebarSelector} {
        position: absolute;
        inset: 0;
        width: 100%;
        z-index: 1000;
        transform: translateX(-100%);
        transition: transform 0.2s ease;
      }
      ${sidebarSelector}.open { transform: translateX(0); }
      ${sidebarSelector}.open ~ ${mapWrapperSelector} #map-controls { display: none; }
    }

    /* ── Mobile persistent top nav (tabs + toggle, always visible) ──────── */
    .mobile-topnav {
      display: none;
    }

    @media (max-width: 640px) {
      .mobile-topnav {
        display: flex;
        flex-direction: column;
        background: var(--surface-1);
        flex-shrink: 0;
        position: relative;
        z-index: 1001;
        padding-top: constant(safe-area-inset-top, 0px);
        padding-top: env(safe-area-inset-top, 0px);
      }
    }

    .mobile-topnav-row {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: 0.4rem 0.75rem;
    }

    .mobile-topnav-sep {
      width: 1px;
      align-self: stretch;
      background: var(--border);
    }

    /* Toggle on the left; logo and title pushed to the right. */
    .mobile-topnav-row .wb-logo { margin-left: auto; }

    .mobile-topnav-title {
      min-width: 0;
      font-family: var(--font-display);
      font-size: 1rem;
      font-weight: var(--weight-semibold);
      letter-spacing: var(--tracking-heading);
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mobile-sidebar-toggle {
      flex: none;
      padding: 0.35rem 0.75rem;
      font-size: 0.82rem;
    }

    /* On phones the top bar's toggle replaces the floating one over the map. */
    @media (max-width: 640px) {
      ${mapWrapperSelector} .show-sidebar-btn { display: none; }
    }

    /* ── Inline sidebar toggle (mobile only, inside sidebar above alerts) ──── */
    .sidebar-mobile-toggle {
      display: none;
    }

    @media (max-width: 640px) {
      .sidebar-mobile-toggle {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        width: 100%;
        padding: 0.35rem 0.75rem;
        background: none;
        border: none;
        border-bottom: 1px solid var(--border-structural);
        color: var(--accent-text);
        font-size: 0.82rem;
        font-weight: 500;
        cursor: pointer;
        flex-shrink: 0;
        transition: opacity 0.15s;
      }
      .sidebar-mobile-toggle:hover { opacity: 0.75; }

      /* Hide the floating map button when sidebar is open; inline button takes over */
      ${sidebarSelector}.open ~ ${mapWrapperSelector} .show-sidebar-btn { display: none; }
    }

    /* ── Page navigation tabs ───────────────────────────────────────────── */
    /* .page-nav-tabs / .page-nav-tab styling is the shared segmented-control
       primitive — see shared/segmented-control.ts. */
    .aside-nav-tabs {
      padding: 0.5rem 0.75rem;
    }

    /* ── Sidebar toggle button (overlays the map, always visible) ──────── */
    .show-sidebar-btn {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 1001;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.35rem 0.75rem;
      background: var(--surface-float);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      font-family: var(--font-ui);
      font-weight: var(--weight-medium);
      font-size: 0.82rem;
      cursor: pointer;
      backdrop-filter: blur(14px) saturate(1.1);
      -webkit-backdrop-filter: blur(14px) saturate(1.1);
      box-shadow: var(--shadow-sm);
      transition: background-color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard);
    }

    .show-sidebar-btn:hover {
      background: var(--surface-hover);
      border-color: var(--border-strong);
      color: var(--text-primary);
    }
  `;
}

/**
 * JS for wiring the sidebar toggle buttons.
 * Requires a `sidebar` variable (the aside element) to already be in scope.
 * Calls `mapVar.invalidateSize()` after each sidebar transition completes.
 * `rootExpr` is the JS expression the buttons are looked up in — 'document' for the app
 * pages, a shadow root variable for the docs-site showcase (src/showcase/).
 */
export function sharedSidebarToggleScripts(mapVar: string, label = 'flight list', rootExpr = 'document'): string {
  return `
    /* Single toggle button in the map — works on both desktop and mobile */
    (function() {
      var btn = ${rootExpr}.getElementById('sidebar-toggle');
      if (!btn) return;
      function isMobile() { return window.innerWidth <= 640; }
      function syncBtn() {
        var mobile = isMobile();
        var visible = mobile
          ? sidebar.classList.contains('open')
          : !sidebar.classList.contains('collapsed');
        /* On mobile this button only appears in map view (sidebar closed),
           so the arrow always points toward the sidebar (←). */
        btn.innerHTML = mobile
          ? '&#8592; Show ${label}'
          : (visible ? '&#8592; Hide ${label}' : '&#8594; Show ${label}');
      }
      btn.addEventListener('click', function() {
        if (isMobile()) {
          sidebar.classList.toggle('open');
        } else {
          sidebar.classList.toggle('collapsed');
        }
      });
      new MutationObserver(syncBtn).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
      syncBtn();
    })();

    /* Phone top-bar toggle (mobileTopnavMarkup): opens the sidebar, or closes it to
       reveal the map. */
    (function() {
      var btn = ${rootExpr}.getElementById('mobile-sidebar-toggle');
      if (!btn) return;
      function syncBtn() {
        btn.innerHTML = sidebar.classList.contains('open') ? 'Show map &#8594;' : '&#8592; Show ${label}';
      }
      btn.addEventListener('click', function() { sidebar.classList.toggle('open'); });
      new MutationObserver(syncBtn).observe(sidebar, { attributes: true, attributeFilter: ['class'] });
      syncBtn();
    })();

    /* Inline mobile button inside the sidebar — closes sidebar to reveal map */
    var mobileMapBtn = ${rootExpr}.getElementById('mobile-map-btn');
    if (mobileMapBtn) {
      mobileMapBtn.addEventListener('click', function() {
        sidebar.classList.remove('open');
      });
    }

    sidebar.addEventListener('transitionend', function() {
      ${mapVar}.invalidateSize();
    });
  `;
}
