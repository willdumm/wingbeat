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
