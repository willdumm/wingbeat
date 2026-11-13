/** The docs site's pages, which the web and the app link to. */

const DOCS_BASE = 'https://wingbeat.dummthings.dev/docs/';

/** The docs page at path (relative to /docs/, e.g. 'features/pilot-duty-log/#warnings-and-totals'). */
export function docsHref(path = ''): string {
  return DOCS_BASE + path;
}
