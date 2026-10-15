/**
 * Shared segmented-control primitive — an inset track with a raised "active" pill
 * inside it. Backs both the page-nav tabs (Flight Tracker ↔ Flight Trends) and the
 * appearance theme switcher (Light / Dark / System); those keep their own class
 * names (for existing markup and the theme JS's `.settings-theme-btn` selector),
 * this just supplies the one shared ruleset both render with. New toggles use the
 * generic `.segmented` / `.segmented-btn` pair (e.g. the duty log's Part 135 / 91 and
 * Duty / Rest toggles), built and wired with segmentedControlScript()'s helpers.
 */
export function segmentedControlStyles(): string {
  return `
    .page-nav-tabs,
    .settings-theme-row,
    .segmented {
      display: flex;
      gap: 2px;
      padding: 3px;
      background: var(--surface-2);
      border-radius: var(--radius-md);
    }

    .page-nav-tab,
    .settings-theme-btn,
    .segmented-btn {
      flex: 1;
      padding: 0.4rem 0.5rem;
      background: transparent;
      border: none;
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      font-family: var(--font-ui);
      font-weight: var(--weight-semibold);
      font-size: 0.82rem;
      cursor: pointer;
      text-decoration: none;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard);
    }

    .page-nav-tab.active,
    .settings-theme-btn.active,
    .segmented-btn.active {
      background: var(--surface-1);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .page-nav-tab:not(.active):hover,
    .settings-theme-btn:not(.active):hover,
    .segmented-btn:not(.active):hover {
      background: var(--surface-hover);
      color: var(--text-secondary);
    }
  `;
}

export function segmentedControlScript(): string {
  return `
    // ── Segmented control ─────────────────────────────────────────────────────

    // A .segmented radiogroup named name, from [value, label, docShot?] options (labels are
    // trusted markup), with value selected. Name it with { label } or { labelledBy }.
    function segmentedHtml(name, options, value, { label, labelledBy } = {}) {
      return '<div class="segmented" role="radiogroup" data-segmented="' + name + '"' +
        (labelledBy ? ' aria-labelledby="' + labelledBy + '"' : '') +
        (label ? ' aria-label="' + label + '"' : '') + '>' +
        options.map(([v, text, docShot]) =>
          '<button type="button" role="radio" class="segmented-btn' + (v === value ? ' active' : '') +
          '" aria-checked="' + (v === value) + '" data-value="' + v + '"' +
          (docShot ? ' data-doc-shot="' + docShot + '"' : '') + '>' + text + '</button>').join('') +
        '</div>';
    }

    // Wires the segmentedHtml() group named name inside root: clicks select a button and
    // call onChange(value). Returns a getter for the selected value.
    function wireSegmented(root, name, onChange) {
      const group = root.querySelector('[data-segmented="' + name + '"]');
      group.addEventListener('click', e => {
        const btn = e.target.closest('.segmented-btn');
        if (!btn) return;
        group.querySelectorAll('.segmented-btn').forEach(b => {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-checked', String(b === btn));
        });
        if (onChange) onChange(btn.dataset.value);
      });
      return () => group.querySelector('.segmented-btn.active').dataset.value;
    }
  `;
}
