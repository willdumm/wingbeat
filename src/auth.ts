import { themeVars, themeFontImport } from './shared/theme';
import { logoLockupMarkup, brandStyles, logoFaviconHref } from './shared/brand';

/**
 * Auth pages (login/join/error) are always dark — there's no theme toggle before
 * sign-in — so they force `data-theme="dark"` on <html> and style off the real
 * theme tokens rather than a hand-copied palette, keeping them in sync with the
 * design system automatically.
 */
function authPageStyles(): string {
  return `
    ${themeFontImport()}
    ${themeVars()}
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-body);
      background: var(--bg-base);
      color: var(--text-primary);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1.5rem;
    }
    ${brandStyles()}
    .wb-logo { margin-bottom: 1.75rem; }
    .card {
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      padding: 2rem;
      width: 100%;
      max-width: 360px;
    }
    p { font-size: 0.95rem; color: var(--text-primary); line-height: 1.65; }
    button {
      width: 100%;
      background: var(--accent-hover);
      color: var(--bg-base);
      border: none;
      border-radius: var(--radius-md);
      font-family: var(--font-display);
      font-size: 0.95rem;
      font-weight: var(--weight-bold);
      padding: 0.6rem;
      cursor: pointer;
      transition: background-color var(--duration-fast) var(--ease-standard);
    }
    button:hover { background: var(--accent-text); }
    .back {
      display: block;
      margin-top: 1.5rem;
      font-size: 0.8rem;
      color: var(--accent-hover);
      text-decoration: none;
    }
    .back:hover { text-decoration: underline; }
  `;
}

export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function deviceNameFromUA(ua: string): string {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Device';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function noAccessHTML(appName: string): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(appName)}</title>
  <link rel="icon" href="${logoFaviconHref('dark')}" />
  <style>${authPageStyles()}</style>
</head>
<body>
  ${logoLockupMarkup(appName, { size: 32, tone: 'mono' })}
  <div class="card">
    <p>Access is by invitation only. Contact your administrator for a sign-in link.</p>
  </div>
</body>
</html>`;
}

export function joinHTML(type: 'invite' | 'device_link', name: string, token: string, appName: string): string {
  const heading = type === 'invite'
    ? `You've been invited to join as <strong>${escapeHtml(name)}</strong>.`
    : `Add a new device to <strong>${escapeHtml(name)}</strong>'s account?`;
  const btnLabel = type === 'invite' ? 'Set up this device' : 'Add this device';
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(appName)}</title>
  <link rel="icon" href="${logoFaviconHref('dark')}" />
  <style>${authPageStyles()}</style>
</head>
<body>
  ${logoLockupMarkup(appName, { size: 32, tone: 'mono' })}
  <div class="card">
    <p style="margin-bottom: 1.5rem;">${heading}</p>
    <form method="POST" action="/join/${escapeHtml(token)}">
      <button type="submit">${escapeHtml(btnLabel)}</button>
    </form>
  </div>
</body>
</html>`;
}

export function joinErrorHTML(message: string, appName: string): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(appName)}</title>
  <link rel="icon" href="${logoFaviconHref('dark')}" />
  <style>${authPageStyles()}</style>
</head>
<body>
  ${logoLockupMarkup(appName, { size: 32, tone: 'mono' })}
  <div class="card">
    <p style="color: var(--danger-fg);">${escapeHtml(message)}</p>
    <a class="back" href="/login">Return to home</a>
  </div>
</body>
</html>`;
}
