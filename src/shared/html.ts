/**
 * HTML escaping. The client-side `htmlEscapeScript()` is for every page script that builds
 * markup from data: the flight list and alerts, the flight form and editor, the duty log,
 * the settings modal and the aircraft info modal. Included once per page (dashboard,
 * analytics, the docs-site showcase and the tests). Server-side markup uses the plain
 * `escapeHtml` / `jsonForScript` functions below.
 */

/** HTML-escapes text for element content and quoted attribute values (& < > " '). */
export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * JSON for embedding in an inline <script>: JSON.stringify with < > & and U+2028/2029 as
 * \u escapes, so the value can't close the script element, open an HTML comment, or break
 * a JS string. JSON.parse of the result equals the input.
 */
export function jsonForScript(value: unknown): string {
  return (JSON.stringify(value) ?? 'null')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function htmlEscapeScript(): string {
  return `
    // HTML-escapes text (null/undefined → '') for markup and attribute values in double
    // or single quotes (& < > " ').
    function escHtml(s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
  `;
}
