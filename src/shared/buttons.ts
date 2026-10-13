/** Shared button palette and chevron — used by both dashboard and analytics pages. */
export function sharedButtonStyles(): string {
  return `
    /* ── Button palette ──────────────────────────────────────────────────── */

    /* Primary: accent-filled, control radius. For Save / Apply / Add / Export. */
    .btn-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      min-height: var(--control-h-sm);
      background: var(--accent-solid);
      border: 1px solid transparent;
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-sm);
      color: var(--accent-fg);
      font-family: var(--font-ui);
      font-weight: var(--weight-semibold);
      cursor: pointer;
      transition: background-color var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard);
    }
    .btn-primary:hover:not(:disabled) { background: var(--accent-solid-hover); }
    .btn-primary:active:not(:disabled) { transform: scale(var(--press-scale)); }
    .btn-primary:focus-visible { outline: none; box-shadow: var(--ring-focus); }
    .btn-primary:disabled { background: var(--surface-2); color: var(--text-faint); box-shadow: none; cursor: not-allowed; }

    /* Secondary: subtle surface background, control radius. For Settings / Bulk Edit /
       Most Recent / Cancel buttons and other secondary actions. */
    .btn-secondary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      min-height: var(--control-h-sm);
      background: var(--surface-1);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-sm);
      color: var(--text-secondary);
      font-family: var(--font-ui);
      font-weight: var(--weight-semibold);
      cursor: pointer;
      transition: background-color var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard);
    }
    .btn-secondary:hover:not(:disabled) {
      background: var(--surface-hover);
      border-color: var(--border-strong);
    }
    .btn-secondary:active:not(:disabled) { transform: scale(var(--press-scale)); }
    .btn-secondary:focus-visible { outline: none; box-shadow: var(--ring-focus); }
    .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }

    /* Danger: red outline, for Delete / Remove / Clear / Sign out. */
    .btn-danger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      padding: 0.25rem 0.55rem;
      background: transparent;
      border: 1.5px solid var(--danger);
      border-radius: var(--radius-md);
      color: var(--danger-fg);
      font-family: var(--font-ui);
      font-size: var(--size-xs);
      cursor: pointer;
      transition: background-color var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard);
    }
    .btn-danger:hover:not(:disabled) { background: var(--danger-surface); }
    .btn-danger:active:not(:disabled) { transform: scale(var(--press-scale)); }
    .btn-danger:focus-visible { outline: none; box-shadow: var(--ring-focus); }
    .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Icon-only (the design system's wb-iconbtn): close buttons and other bare-glyph
       actions. Give it an aria-label. */
    .btn-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-1);
      background: none;
      border: none;
      border-radius: var(--radius-md);
      color: var(--text-muted);
      cursor: pointer;
      transition: background-color var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard);
    }
    .btn-icon:hover:not(:disabled) { background: var(--surface-hover); color: var(--text-secondary); }
    .btn-icon:focus-visible { outline: none; box-shadow: var(--ring-focus); }

    /* Sizes (the design system's wb-btn--sm / --md), for any of the above: sm for
       toolbars, md for dialog and form actions. */
    .btn-sm { min-height: var(--control-h-sm); padding: 0 var(--space-3); font-size: var(--size-sm); white-space: nowrap; }
    .btn-md { min-height: var(--control-h-md); padding: 0 var(--space-4); font-size: var(--size-md); white-space: nowrap; }

    /* ── Shared chevron ──────────────────────────────────────────────────── */

    /* Used in collapsible section headers (flight day headings, filter toggle,
       alert strip, month rows, legend toggle). A single glyph that rotates open,
       rather than swapping ▼/▶ characters. */
    .chevron {
      color: var(--text-muted);
      flex-shrink: 0;
      width: 14px;
      height: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: transform var(--duration-fast) var(--ease-standard);
    }
    .chevron[data-open="true"] { transform: rotate(90deg); }
    /* A chevron that is itself the disclosure control (flight day headings). */
    button.chevron {
      padding: 0;
      background: none;
      border: none;
      border-radius: var(--radius-xs);
      cursor: pointer;
    }
    button.chevron:focus-visible { outline: none; box-shadow: var(--ring-focus); }
  `;
}
