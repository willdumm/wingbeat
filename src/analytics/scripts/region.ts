// The page's regions (/api/regions), and its region functions over them: the logic is
// @wingbeat/core/regions (globals from the core bundle, see src/client/core-entry.ts).
export function analyticsScriptsRegion(): string {
  return `
    let REGIONS = null;

    async function loadRegions() {
      try {
        const res = await fetch('/api/regions');
        if (res.ok) REGIONS = await res.json();
      } catch (_) {}
    }

    // Display names of the home base regions, sorted.
    function homeBaseNames() { return homeBaseNamesIn(REGIONS); }
  `;
}
