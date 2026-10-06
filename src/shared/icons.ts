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
      // lucide.createIcons() only ever searches the whole document (this version ignores
      // a root option), so placeholders inside a shadow root are swapped in by hand.
      function renderInShadow(root) {
        var placeholders = root.querySelectorAll('i[data-lucide]');
        for (var i = 0; i < placeholders.length; i++) {
          var el = placeholders[i];
          var name = el.getAttribute('data-lucide');
          var key = name.replace(/(^|-)([a-z0-9])/g, function(_, __, c) { return c.toUpperCase(); });
          var node = window.lucide.icons[key];
          if (!node) continue;
          var svg = window.lucide.createElement(node);
          svg.setAttribute('stroke-width', '2');
          svg.setAttribute('class', 'lucide lucide-' + name + ' ' + (el.getAttribute('class') || ''));
          if (el.getAttribute('style')) svg.setAttribute('style', el.getAttribute('style'));
          if (el.getAttribute('aria-hidden')) svg.setAttribute('aria-hidden', el.getAttribute('aria-hidden'));
          el.parentNode.replaceChild(svg, el);
        }
      }
      function renderIn(root) {
        if (!window.lucide) return;
        var node = root.getRootNode ? root.getRootNode() : root;
        if (window.ShadowRoot && node instanceof ShadowRoot) { renderInShadow(root); return; }
        window.lucide.createIcons({ attrs: { 'stroke-width': 2 } });
        // Lucide copies the source element's attributes (including data-lucide) onto the
        // <svg> it swaps in, so the replacement itself matches our own [data-lucide]
        // selector below — without stripping it here, the MutationObserver sees that SVG
        // land, re-renders it, and ping-pongs forever. Strip it from just-rendered <svg>s
        // (not from <i> placeholders that haven't been rendered yet) so each icon settles.
        var rendered = root.querySelectorAll ? root.querySelectorAll('svg[data-lucide]') : [];
        for (var i = 0; i < rendered.length; i++) rendered[i].removeAttribute('data-lucide');
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
              var node = added[j];
              if (node.nodeType !== 1) continue;
              if (node.matches && node.matches('[data-lucide]')) { renderIn(node.parentNode || root); continue; }
              if (node.querySelector && node.querySelector('[data-lucide]')) renderIn(node);
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
