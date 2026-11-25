// The page's regions (/api/regions), and its region functions over them: the logic is
// @wingbeat/core/regions (globals from the core bundle, see src/client/core-entry.ts).
export function analyticsScriptsRegion(): string {
  return `
    let REGIONS = null;

    // Keeps the regions it has if the load fails. Whether they changed.
    async function loadRegions() {
      let next;
      try { next = await fetchRegions(); } catch (_) { return false; }
      const changed = JSON.stringify(next) !== JSON.stringify(REGIONS);
      REGIONS = next;
      return changed;
    }

    // Display names of the home base regions, sorted.
    function homeBaseNames() { return homeBaseNamesIn(REGIONS); }
  `;
}
