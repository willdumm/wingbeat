/**
 * The @wingbeat/core browser bundle (scripts/build-core.mjs, Wrangler's [build] command),
 * imported as a Text module: a missing bundle fails the deploy at build time.
 */
import coreBundle from '../../build/core-bundle.txt';

/** The bundle as a <script> carrying the page's nonce. Goes before the page's own script. */
export function coreBundleScript(nonce: string): string {
  return `<script nonce="${nonce}">${coreBundle}</script>`;
}
