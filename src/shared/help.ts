import { icon } from './icons';

/**
 * Links from the app to the docs site, and the warning notice for views that check
 * regulatory limits (the duty log). The notice says the same as the docs' compliance
 * warning (site/layouts/_shortcodes/compliance.html).
 */

const DOCS_BASE = 'https://wingbeat.dummthings.dev/docs/';

/** The docs page at path (relative to /docs/, e.g. 'features/pilot-duty-log/#warnings-and-totals'). */
export function docsHref(path = ''): string {
  return DOCS_BASE + path;
}

/** An inline "book" link to a docs page, opening in a new tab. */
export function docsLinkMarkup(path: string, label: string): string {
  return `<a class="docs-link" href="${docsHref(path)}" target="_blank" rel="noopener">${icon('book-open', { size: 14 })}${label}</a>`;
}

/** Warning callout: a regulation-checking view is an aid, not advice or a guarantee. */
export function complianceNoticeMarkup(docPath: string): string {
  return /* html */ `
          <div class="compliance-notice" role="note">
            ${icon('triangle-alert', { size: 16 })}
            <p><strong>Not a guarantee of compliance or legal advice.</strong> These checks are an aid
            only, can be incomplete or wrong, and depend on what's recorded. The certificate holder and
            its pilots remain responsible for compliance and for these records.
            ${docsLinkMarkup(docPath, 'How this works and its limits')}</p>
          </div>`;
}

export function helpStyles(): string {
  return `
    .docs-link {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      color: var(--accent-text);
      font-weight: var(--weight-medium);
      text-decoration: none;
    }
    .docs-link:hover { text-decoration: underline; }

    .compliance-notice {
      display: flex;
      gap: 0.6rem;
      align-items: flex-start;
      padding: 0.6rem 0.8rem;
      border-radius: var(--radius-md);
      background: var(--warning-surface);
      color: var(--text-primary);
      font-size: var(--size-xs);
      line-height: 1.45;
    }
    .compliance-notice > .wb-icon { flex: none; color: var(--warning-fg); margin-top: 0.1rem; }
    .compliance-notice p { margin: 0; }
    .compliance-notice strong { color: var(--warning-fg); }
    .compliance-notice .docs-link { white-space: nowrap; }`;
}
