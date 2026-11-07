/**
 * The @wingbeat/core browser bundle (scripts/build-core.mjs, Wrangler's [build] command),
 * imported as a Text module: a missing bundle fails the deploy at build time.
 */
import coreBundle from '../../build/core-bundle.txt';

/** The bundle's source: for the Worker's route, and a script that inlines it (the docs-site showcase). */
export { coreBundle };

/** 32-bit FNV-1a, in base 36. Only tells bundle versions apart, so it needn't be cryptographic. */
function contentHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(36);
}

/** Where the Worker serves the bundle. Named by its content, so browsers can cache it for good. */
export const coreBundlePath = `/core-bundle.${contentHash(coreBundle)}.js`;

/** The bundle's <script> carrying the page's nonce. Goes before the page's own script. */
export function coreBundleScript(nonce: string): string {
  return `<script nonce="${nonce}" src="${coreBundlePath}"></script>`;
}
