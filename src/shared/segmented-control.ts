/**
 * Shared segmented-control primitive — an inset track with a raised "active" pill
 * inside it. Backs both the page-nav tabs (Flight Tracker ↔ Flight Trends) and the
 * appearance theme switcher (Light / Dark / System); those keep their own class
 * names (for existing markup and the theme JS's `.settings-theme-btn` selector),
 * this just supplies the one shared ruleset both render with.
 */
export function segmentedControlStyles(): string {
  return `
    .page-nav-tabs,
    .settings-theme-row {
      display: flex;
      gap: 2px;
      padding: 3px;
      background: var(--surface-2);
      border-radius: var(--radius-md);
    }

    .page-nav-tab,
    .settings-theme-btn {
      flex: 1;
      padding: 0.4rem 0.5rem;
      background: transparent;
      border: none;
      border-radius: var(--radius-sm);
      color: var(--text-muted);
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
    .settings-theme-btn.active {
      background: var(--surface-1);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .page-nav-tab:not(.active):hover,
    .settings-theme-btn:not(.active):hover {
      background: var(--surface-hover);
      color: var(--text-secondary);
    }
  `;
}
