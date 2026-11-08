/**
 * The @wingbeat/core browser bundle (scripts/build-core.mjs, Wrangler's [build] command) and
 * its content hash (64 bits of SHA-256), imported as Text modules: a missing bundle fails the
 * deploy at build time.
 */
import coreBundle from '../../build/core-bundle.txt';
import coreBundleHash from '../../build/core-bundle-hash.txt';

/** The bundle's source: for the Worker's route, and a script that inlines it (the docs-site showcase). */
export { coreBundle };

/** Where the Worker serves the bundle. Named by its content, so browsers can cache it for good. */
export const coreBundlePath = `/core-bundle.${coreBundleHash}.js`;

/** The bundle's <script> carrying the page's nonce. Goes before the page's own script. */
export function coreBundleScript(nonce: string): string {
  return `<script nonce="${nonce}" src="${coreBundlePath}"></script>`;
}
