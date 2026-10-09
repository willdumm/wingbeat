/**
 * Lucide icon system bootstrap (loaded from CDN in the page <head>, see dashboard.ts /
 * analytics.ts). Most of this app's markup is injected via innerHTML at runtime — flight
 * list rows, settings sections, filter chips, alert rows — rather than a single render
 * pass, so instead of calling lucide.createIcons() after every individual render site,
 * a MutationObserver renders any newly-added `<i data-lucide="...">` placeholder as soon
 * as it lands in the DOM, wherever it came from.
 */
export function iconRuntimeScript(): string {
  return `
    (function() {
      // Swaps one <i data-lucide> placeholder for its <svg>. Done by hand rather than via
      // lucide.createIcons(), which always rescans the whole document and re-renders every
      // [data-lucide] element it finds (it copies data-lucide onto the <svg>). Called per
      // added node by the observer below, that turned a flight-list render — hundreds of
      // separately-appended day headings — into a multi-second quadratic stall on load.
      // Only icon()'s attributes (class, style, aria-hidden) are carried over, and the
      // <svg> has no data-lucide, so it doesn't re-trigger the observer.
      function swap(el) {
        var name = el.getAttribute('data-lucide');
        var key = name.replace(/(^|-)([a-z0-9])/g, function(_, __, c) { return c.toUpperCase(); });
        var node = window.lucide.icons[key];
        if (!node || !el.parentNode) return;
        var svg = window.lucide.createElement(node);
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('class', 'lucide lucide-' + name + ' ' + (el.getAttribute('class') || ''));
        if (el.getAttribute('style')) svg.setAttribute('style', el.getAttribute('style'));
        if (el.getAttribute('aria-hidden')) svg.setAttribute('aria-hidden', el.getAttribute('aria-hidden'));
        el.parentNode.replaceChild(svg, el);
      }
      // Renders the placeholders in root (itself included) — and only there, so it works
      // the same for the document and for a shadow root.
      function renderIn(root) {
        if (!window.lucide) return;
        if (root.matches && root.matches('i[data-lucide]')) { swap(root); return; }
        var placeholders = root.querySelectorAll ? root.querySelectorAll('i[data-lucide]') : [];
        for (var i = 0; i < placeholders.length; i++) swap(placeholders[i]);
      }
      // Renders placeholders already under root, then keeps watching it for new ones.
      // Exposed as window.wbObserveIcons for shadow roots (the docs-site showcase's
      // demos), which the document-level observer can't see into.
      function observeIcons(root) {
        renderIn(root);
        var mo = new MutationObserver(function(mutations) {
          for (var i = 0; i < mutations.length; i++) {
            var added = mutations[i].addedNodes;
            for (var j = 0; j < added.length; j++) {
              if (added[j].nodeType === 1) renderIn(added[j]);
            }
          }
        });
        mo.observe(root, { childList: true, subtree: true });
      }
      window.wbObserveIcons = observeIcons;
      observeIcons(document);
    })();
  `;
}

/** `<i data-lucide="name"></i>` markup for a Lucide glyph, rendered by iconRuntimeScript(). */
export function icon(name: string, opts: { size?: number; className?: string } = {}): string {
  const size = opts.size ?? 20;
  const cls = opts.className ? ` ${opts.className}` : '';
  return `<i data-lucide="${name}" class="wb-icon${cls}" style="width:${size}px;height:${size}px" aria-hidden="true"></i>`;
}

export function iconStyles(): string {
  return `
    .wb-icon { display: inline-flex; flex: none; color: currentColor; vertical-align: middle; }
    [data-lucide] { display: inline-flex; }
  `;
}
