/**
 * The client-side HTML escape, for every page script that builds markup from data: the
 * flight list and alerts, the flight form and editor, the duty log, the settings modal
 * and the aircraft info modal. Included once per page (dashboard, analytics, the docs-site
 * showcase and the tests). Server-side markup has its own escapeHtml.
 */
export function htmlEscapeScript(): string {
  return `
    // HTML-escapes text (null/undefined → '') for markup and attribute values in double
    // quotes (& < > "; not ').
    function escHtml(s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
  `;
}
