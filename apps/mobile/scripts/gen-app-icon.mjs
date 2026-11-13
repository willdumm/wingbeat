// Writes assets/icon.png, the iOS app icon: the Wingbeat mark (logo_plain.svg at the repo
// root, as src/shared/brand.ts uses it) centered on white at 1024 px. iOS rounds the
// corners itself, and an icon must be opaque. Renders with the root's Playwright, so run it
// from the repo root: nix develop path:./nix --command node apps/mobile/scripts/gen-app-icon.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const SIZE = 1024;
/** The mark's share of the icon's width, clear of iOS's rounded corners. */
const MARK = 0.62;

const root = new URL('../../../', import.meta.url);
const svg = readFileSync(new URL('logo_plain.svg', root), 'utf8').replace(/<\?xml[\s\S]*?\?>/, '');
const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
const dir = browsersPath && readdirSync(browsersPath).find((d) => /^chromium-\d+$/.test(d));
if (!dir) throw new Error('No chromium under PLAYWRIGHT_BROWSERS_PATH: run inside nix develop path:./nix');

const browser = await chromium.launch({ executablePath: `${browsersPath}/${dir}/chrome-linux64/chrome` });
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
await page.setContent(`<!doctype html><style>
  html, body { margin: 0; width: ${SIZE}px; height: ${SIZE}px; background: #fff; }
  body { display: grid; place-items: center; }
  svg { width: ${Math.round(SIZE * MARK)}px; height: auto; }
</style>${svg}`);
writeFileSync(new URL('apps/mobile/assets/icon.png', root), await page.screenshot({ omitBackground: false }));
await browser.close();
