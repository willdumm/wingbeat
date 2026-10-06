/**
 * Docs-site home page ("showcase"): a landing page whose demos are the real dashboard
 * and analytics UI rendered from sample data. The prose lives in site/content/_index.md;
 * this builds what Hugo can't: site/scripts/build-showcase.mjs bundles this module, reads
 * the geojson datasets, and writes the two outputs into site/ (`npm run docs:showcase`);
 * the file I/O stays in the .mjs so this stays pure.
 */
import { buildSampleData, GeoCollection, TerrainGrid } from './sample-data';
import { showcasePageData } from './page';
import { showcaseScript } from './scripts';

/** Where the page loads the script from, relative to the site root. */
export const SHOWCASE_SCRIPT_PATH = 'showcase/showcase.js';

export function buildShowcase({ namedPoints, regions, terrain }: { namedPoints: GeoCollection; regions: GeoCollection; terrain: TerrainGrid }): { data: string; js: string } {
  const sample = buildSampleData(namedPoints, regions, terrain);
  const js = showcaseScript(sample);
  // The script's URL never changes and the host sends no cache headers, so without a
  // version browsers can pair a fresh page with a stale script.
  const page = showcasePageData(sample.appName, `${SHOWCASE_SCRIPT_PATH}?v=${contentHash(js)}`, sample.notifications);
  return { data: JSON.stringify(page, null, 2) + '\n', js };
}

/** Short FNV-1a hash of `text`, for cache-busting. */
function contentHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
