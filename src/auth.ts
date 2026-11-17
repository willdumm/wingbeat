import { themeVars, themeFontImport } from './shared/theme';
import { escapeHtml } from './shared/html';
import { logoLockupMarkup, brandStyles, logoFaviconHref } from './shared/brand';
import { cutDeviceName } from '@wingbeat/core/api/me-requests';

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
      background: var(--input-bg);
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
    input {
      width: 100%;
      background: var(--bg-base);
      color: var(--text-primary);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      font-family: var(--font-body);
      font-size: 1rem;
      padding: 0.55rem 0.7rem;
      margin-bottom: 0.75rem;
    }
    input:focus { outline: none; box-shadow: var(--ring-focus); }
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

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The name a paired phone's session gets: the phone's own name, cut to the limit
 * (cutDeviceName in core), or the User-Agent's platform when it's missing or blank.
 */
export function pairedDeviceName(name: string | null | undefined, ua: string): string {
  return cutDeviceName(name ?? '') || deviceNameFromUA(ua);
}

/** The app's wingbeat://pair link for a join token, when ua is an iPhone or iPad (the app is
 * iOS only for now), or null. */
export function appPairLink(ua: string, host: string, token: string): string | null {
  const device = deviceNameFromUA(ua);
  if (device !== 'iPhone' && device !== 'iPad') return null;
  return `wingbeat://pair?host=${encodeURIComponent(host)}&token=${encodeURIComponent(token)}`;
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

export function noAccessHTML(appName: string): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
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

/**
 * The invite or device-link page. appLink, on an iPhone or iPad, also offers the sign-in in the
 * app (wingbeat://pair, which the app confirms before signing in).
 */
export function joinHTML(type: 'invite' | 'device_link', name: string, token: string, appName: string, appLink: string | null = null): string {
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
    ${appLink ? `<a class="back" href="${escapeHtml(appLink)}">Open in the Wingbeat app instead</a>` : ''}
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

/** The page around an auth card: the same head, logo and card as the other auth pages. */
function authPage(appName: string, card: string): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${escapeHtml(appName)}</title>
  <link rel="icon" href="${logoFaviconHref('dark')}" />
  <style>${authPageStyles()}</style>
</head>
<body>
  ${logoLockupMarkup(appName, { size: 32, tone: 'mono' })}
  <div class="card">
    ${card}
  </div>
</body>
</html>`;
}

/**
 * GET /app/connect in a signed-in browser: asks before connecting the app ("Sign in with
 * Browser", docs/mobile-app-plan.md, "Auth and pairing"). The form posts the app's challenge
 * and state back, and the response redirects to the app.
 */
export function appConnectHTML(name: string, challenge: string, state: string, appName: string): string {
  return authPage(appName, `
    <p style="margin-bottom: 1.5rem;">Connect the Wingbeat app to <strong>${escapeHtml(name)}</strong>'s account?</p>
    <form method="POST" action="/app/connect">
      <input type="hidden" name="challenge" value="${escapeHtml(challenge)}" />
      <input type="hidden" name="state" value="${escapeHtml(state)}" />
      <button type="submit">Connect</button>
    </form>`);
}

/**
 * The demo tenant's signed-out page (/login and the app's connect page): the demo code signs
 * this browser in as the demo user, then goes back to returnTo.
 */
export function demoSignInHTML(appName: string, returnTo: string, error: string | null = null): string {
  return authPage(appName, `
    <p style="margin-bottom: 1rem;">This is the ${escapeHtml(appName)} demo: three simulated aircraft, two of
      them always flying. Enter the demo code to sign in.</p>
    ${error ? `<p style="color: var(--danger-fg); margin-bottom: 1rem;">${escapeHtml(error)}</p>` : ''}
    <form method="POST" action="/demo/sign-in">
      <input type="hidden" name="return" value="${escapeHtml(returnTo)}" />
      <input name="code" placeholder="Demo code" autocapitalize="none" autocomplete="off" autocorrect="off" spellcheck="false" required autofocus />
      <button type="submit">Sign in to the demo</button>
    </form>`);
}

/** GET /app/connect in a browser that isn't signed in here: how to sign in first. */
export function appConnectSignedOutHTML(appName: string): string {
  return authPage(appName, `
    <p style="margin-bottom: 1rem;">This browser isn't signed in to ${escapeHtml(appName)}.</p>
    <p>Open your sign-in link in Safari first, then try again in the app. Or, on a device that's
      signed in, open Settings → Devices, choose Get link, and scan its code with the app.</p>`);
}
