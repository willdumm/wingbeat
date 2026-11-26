/**
 * Shared row-actions menu: one "⋯" icon button at a list row's trailing edge that opens a
 * small popover of the row's actions, so every row in a list ends at the same edge however
 * many actions it has (the settings lists: trackers, aircraft, pilots, devices, users,
 * webhooks, basemaps, overlays). Destructive items are in the danger colour.
 */
import { icon } from './icons';

export function rowMenuStyles(): string {
  return `
    .row-menu-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--control-h-sm);
      height: var(--control-h-sm);
      flex: none;
      padding: 0;
      background: transparent;
      border: none;
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      cursor: pointer;
      transition: background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
    }

    .row-menu-btn:hover,
    .row-menu-btn[aria-expanded="true"] {
      background: var(--surface-hover);
      color: var(--text-primary);
    }

    .row-menu-btn:focus-visible { outline: none; box-shadow: var(--ring-focus); }
    .row-menu-btn:disabled { opacity: 0.5; cursor: default; }

    .row-menu {
      position: fixed;
      z-index: 9000;
      min-width: 11rem;
      padding: var(--space-1);
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      box-sizing: border-box;
    }

    .row-menu-item {
      display: block;
      width: 100%;
      padding: var(--space-2) var(--space-3);
      background: transparent;
      border: none;
      border-radius: var(--radius-sm);
      color: var(--text-primary);
      font-family: var(--font-ui);
      font-size: var(--size-sm);
      text-align: left;
      white-space: nowrap;
      cursor: pointer;
    }

    .row-menu-item:hover,
    .row-menu-item:focus-visible { background: var(--surface-hover); outline: none; }
    .row-menu-item.danger { color: var(--danger-fg); }
    .row-menu-item.danger:hover,
    .row-menu-item.danger:focus-visible { background: var(--danger-surface); }
    .row-menu-item:disabled { color: var(--text-faint); background: transparent; cursor: default; }
  `;
}

export function rowMenuScript(): string {
  return `
    // ── Row menu (row-menu.ts) ──
    const _ROW_MENU_ICON = ${JSON.stringify(icon('ellipsis', { size: 18 }))};
    let _rowMenuOpen = null;   // { menu, btn } while a menu is shown

    function _rowMenuClose(refocus) {
      if (!_rowMenuOpen) return;
      const { menu, btn } = _rowMenuOpen;
      _rowMenuOpen = null;
      menu.remove();
      btn.setAttribute('aria-expanded', 'false');
      if (refocus && btn.isConnected) btn.focus();
    }

    // A "⋯" button whose menu lists items, each { label, onSelect, danger, disabled }
    // (falsy entries are left out). onSelect gets the button, to disable while a request
    // it starts runs. label names the button for screen readers.
    function rowMenuButton(items, label = 'Actions') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'row-menu-btn';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('aria-haspopup', 'menu');
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = _ROW_MENU_ICON;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasOpen = _rowMenuOpen?.btn === btn;
        _rowMenuClose(false);
        if (!wasOpen) _rowMenuShow(btn, items.filter(Boolean));
      });
      return btn;
    }

    function _rowMenuShow(btn, items) {
      const menu = document.createElement('div');
      menu.className = 'row-menu';
      menu.setAttribute('role', 'menu');
      for (const item of items) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'row-menu-item' + (item.danger ? ' danger' : '');
        el.setAttribute('role', 'menuitem');
        el.textContent = item.label;
        el.disabled = !!item.disabled;
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          // Focus goes back to the button first, so an action that opens a form can take it.
          _rowMenuClose(true);
          item.onSelect(btn);
        });
        menu.appendChild(el);
      }
      menu.addEventListener('keydown', (e) => {
        const enabled = [...menu.querySelectorAll('.row-menu-item:not(:disabled)')];
        const i = enabled.indexOf(document.activeElement);
        if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); _rowMenuClose(true); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); enabled[(i + 1) % enabled.length]?.focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); enabled[(i - 1 + enabled.length) % enabled.length]?.focus(); }
        else if (e.key === 'Home') { e.preventDefault(); enabled[0]?.focus(); }
        else if (e.key === 'End') { e.preventDefault(); enabled[enabled.length - 1]?.focus(); }
      });
      document.body.appendChild(menu);
      // Under the button, its right edge on the button's; above it when there's no room below.
      const r = btn.getBoundingClientRect();
      const m = menu.getBoundingClientRect();
      const gap = 4;
      const top = r.bottom + gap + m.height <= window.innerHeight ? r.bottom + gap : Math.max(gap, r.top - gap - m.height);
      menu.style.top = top + 'px';
      menu.style.left = Math.max(gap, Math.min(r.right - m.width, window.innerWidth - m.width - gap)) + 'px';
      btn.setAttribute('aria-expanded', 'true');
      _rowMenuOpen = { menu, btn };
      menu.querySelector('.row-menu-item:not(:disabled)')?.focus();
    }

    document.addEventListener('pointerdown', (e) => {
      if (_rowMenuOpen && !_rowMenuOpen.menu.contains(e.target) && e.target !== _rowMenuOpen.btn
        && !_rowMenuOpen.btn.contains(e.target)) _rowMenuClose(false);
    });
    // It's placed once, so anything that moves the button closes it.
    window.addEventListener('scroll', () => _rowMenuClose(false), true);
    window.addEventListener('resize', () => _rowMenuClose(false));
  `;
}
