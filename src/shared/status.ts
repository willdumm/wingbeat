/**
 * Shared status dot/chip primitive — generalizes the design system's flight-status
 * badge for this app's own status concepts: aircraft in-flight/on-ground, GPS
 * freshness, maintenance due/overdue, tracker/aircraft/pilot active state.
 * `live` is reserved for a state that is genuinely happening right now (an aircraft
 * actually airborne) and gets the pulsing dot; every other tone is static.
 */
export type StatusTone = 'live' | 'ok' | 'neutral' | 'warn' | 'danger';

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A small standalone status dot (no label), e.g. for a table cell or inline marker. */
export function statusDot(tone: StatusTone, className = ''): string {
  const cls = className ? ` ${className}` : '';
  return `<span class="wb-dot wb-dot--${tone}${cls}"></span>`;
}

/** A dot + label chip, e.g. "In Flight" / "Overdue" / "Active". */
export function statusChip(label: string, tone: StatusTone, className = ''): string {
  const cls = className ? ` ${className}` : '';
  return `<span class="wb-chip wb-chip--${tone}${cls}">${statusDot(tone, 'wb-chip__dot')}${escapeHtml(label)}</span>`;
}

export function statusStyles(): string {
  return `
    .wb-dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex: none;
    }
    .wb-dot--live    { background: var(--live-dot); animation: wb-pulse 1.8s var(--ease-standard) infinite; }
    .wb-dot--ok      { background: var(--success-fg); }
    .wb-dot--neutral { background: var(--text-faint); }
    .wb-dot--warn    { background: var(--warning-fg); }
    .wb-dot--danger  { background: var(--danger); }

    @media (prefers-reduced-motion: reduce) { .wb-dot--live { animation: none; } }

    @keyframes wb-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .45; transform: scale(.8); } }

    .wb-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--font-ui);
      font-size: 0.72rem;
      font-weight: var(--weight-bold);
      letter-spacing: var(--tracking-wide);
      text-transform: uppercase;
      padding: 3px 8px;
      border-radius: var(--radius-pill);
      white-space: nowrap;
    }
    .wb-chip__dot { margin: 0; }
    .wb-chip--live    { background: var(--live-surface);    color: var(--live-fg); }
    .wb-chip--ok      { background: var(--success-surface); color: var(--success-fg); }
    .wb-chip--neutral { background: var(--surface-2);       color: var(--text-secondary); }
    .wb-chip--warn    { background: var(--warning-surface); color: var(--warning-fg); }
    .wb-chip--danger  { background: var(--danger-surface);  color: var(--danger-fg); }
  `;
}
