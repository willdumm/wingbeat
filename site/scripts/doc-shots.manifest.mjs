// One entry per generated doc screenshot. See docs/doc-screenshots-plan.md.
//
// slug   — matches the data-doc-shot value of the capture target
// route  — page to load
// setup  — ordered data-doc-shot slugs to click first, to reach the target state
// theme  — 'light' | 'dark' (optional, defaults to 'light')
// output — path (no extension) under site/static/img/generated/

/** @type {Array<{ slug: string, route: string, setup?: string[], theme?: 'light' | 'dark', output: string }>} */
export const manifest = [
  {
    slug: 'settings.add-tracker-dialog',
    route: '/',
    setup: ['settings.settings-button'],
    theme: 'light',
    output: 'settings/add-tracker-dialog',
  },
];
