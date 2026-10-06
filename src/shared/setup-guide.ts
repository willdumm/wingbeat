import { statusChip } from './status';

/**
 * First-run setup checklist (#4), shown to admins at the top of the settings modal while
 * a required step (basics, aircraft/pilots, trackers) is left and it hasn't been dismissed
 * (tenant setting `setup_dismissed`); re-openable from the Admin section.
 * The dashboard already opens settings when there are no trackers, so a new instance's
 * first admin lands on it. Each step only links to the existing settings section or view
 * that does the work, in the order that matters (aircraft/pilots before trackers, trackers
 * assigned before importing history), with a done/optional chip computed from live data.
 *
 * Include setupGuideMarkup() at the top of the main settings view, setupGuideAdminRowMarkup()
 * in the Admin section, setupGuideStyles() with the settings styles, and setupGuideScript()
 * inside settingsModalScript() (it uses _openTenantSettings, trackerList, aircraftList and
 * pilotList from there).
 */

export function setupGuideMarkup(): string {
  return `
            <div class="settings-section setup-guide" id="settings-section-setup" style="display:none">
              <div class="settings-section-label">Get started</div>
              <p class="settings-section-desc">Set things up in this order: flights are tagged with a tracker&rsquo;s aircraft and pilot as they arrive.</p>
              <ol class="setup-guide-steps" id="settings-setup-steps"></ol>
              <div class="settings-add-actions">
                <button id="settings-setup-dismiss" class="btn-secondary">Hide checklist</button>
              </div>
            </div>`;
}

export function setupGuideAdminRowMarkup(): string {
  return `
              <div class="settings-row">
                <div class="settings-row-info">
                  <span class="settings-row-title">Setup checklist</span>
                  <span class="settings-row-desc">The first-run steps for a new instance</span>
                </div>
                <button class="settings-action-btn" id="settings-setup-show">Show</button>
              </div>`;
}

export function setupGuideStyles(): string {
  return `
    .setup-guide-steps {
      list-style: none;
      margin: 0;
      padding: 0;
      counter-reset: setup-step;
    }

    .setup-guide-step {
      counter-increment: setup-step;
      display: flex;
      align-items: flex-start;
      gap: 0.6rem;
      padding: 0.45rem 0;
      border-bottom: 1px solid var(--border-structural);
    }

    .setup-guide-step::before {
      content: counter(setup-step);
      flex: none;
      width: 1.4rem;
      height: 1.4rem;
      border-radius: 50%;
      background: var(--surface-2);
      color: var(--text-secondary);
      font-size: 0.75rem;
      font-weight: var(--weight-bold);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .setup-guide-step-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
    .setup-guide-step-head { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
    .setup-guide-step-title { font-size: 0.85rem; font-weight: var(--weight-bold); color: var(--text-primary); }
    .setup-guide-step .settings-action-btn { flex: none; align-self: center; }
  `;
}

export function setupGuideScript(): string {
  const chips = {
    done: statusChip('Done', 'ok'),
    todo: statusChip('To do', 'warn'),
    optional: statusChip('Optional', 'neutral'),
  };
  return `
    // ── First-run setup checklist (#4) ────────────────────────────────────────

    const _sgChips = ${JSON.stringify(chips)};

    function _sgScrollTo(sectionEl, detailsId) {
      if (detailsId) {
        const d = document.getElementById(detailsId);
        if (d) d.open = true;
      }
      sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function _sgSection(id) {
      return document.getElementById(id).closest('.settings-section');
    }

    async function _sgFetchJson(url) {
      try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch (_) { return null; }
    }

    async function renderSetupGuide(force) {
      const section = document.getElementById('settings-section-setup');
      if (_settingsUser?.role !== 'admin') { section.style.display = 'none'; return; }

      const [settings, regions, namedPoints, users, invites, webhooks] = await Promise.all([
        _sgFetchJson('/api/settings'),
        _sgFetchJson('/api/regions'),
        _sgFetchJson('/api/named-points'),
        _sgFetchJson('/api/users'),
        _sgFetchJson('/api/invites'),
        _sgFetchJson('/api/webhooks'),
      ]);
      if (!force && settings?.setup_dismissed === '1') { section.style.display = 'none'; return; }

      const trackers = (trackerList || []).filter(t => !t.deleted);
      const basicsDone = !!settings && settings.app_name !== 'Wingbeat'
        && !(settings.map_default_lat === '30' && settings.map_default_lng === '0' && settings.map_default_zoom === '2');
      const fleetDone = aircraftList.length > 0 && pilotList.length > 0;
      const trackersDone = trackers.length > 0 && trackers.every(t =>
        (aircraftList.length === 0 || t.assigned_aircraft) && (pilotList.length === 0 || t.assigned_pilot != null));
      const placesDone = (regions?.features?.length ?? 0) > 0 || (namedPoints?.features?.length ?? 0) > 0;
      // Unprompted, it only shows while a required step is left (so established instances
      // never see it); "Show" in the Admin section brings it back with the optional steps.
      if (!force && basicsDone && fleetDone && trackersDone) { section.style.display = 'none'; return; }
      const peopleDone = (users?.users?.length ?? 0) > 1 || (invites?.invites?.length ?? 0) > 0;
      const notifyDone = (webhooks?.webhooks?.length ?? 0) > 0;

      const steps = [
        { title: 'Organization basics', state: basicsDone ? 'done' : 'todo',
          desc: 'App name, timezone, and the map view everyone starts from (Set from map).',
          action: 'Open', go: () => _openTenantSettings() },
        { title: 'Aircraft and pilots', state: fleetDone ? 'done' : 'todo',
          desc: 'Add them before trackers, so new flights are assigned automatically.',
          action: 'Show', go: () => _sgScrollTo(_sgSection('settings-aircraft-list'), aircraftList.length === 0 ? 'settings-add-aircraft' : null) },
        { title: 'Trackers', state: trackersDone ? 'done' : 'todo',
          desc: 'Paste each device\\'s MapShare feed URL (and password, if set), assign its aircraft and pilot, and use Test feed to check it.',
          action: 'Show', go: () => _sgScrollTo(_sgSection('settings-tracker-list'), trackers.length === 0 ? 'settings-add-tracker' : null) },
        { title: 'Regions and named points', state: placesDone ? 'done' : 'optional',
          desc: 'Import GeoJSON (draw it at geojson.io) or use the map editors. Named points label flight origins and destinations; a region named "… (Base)" is a home base.',
          action: 'Open', go: () => _openTenantSettings() },
        { title: 'Import history', state: 'optional',
          desc: 'New trackers start with the last two days. Use Import on a tracker to bring in older flights.',
          action: 'Show', go: () => _sgScrollTo(_sgSection('settings-tracker-list'), null) },
        { title: 'Invite people', state: peopleDone ? 'done' : 'optional',
          desc: 'Create a sign-in link for each person, as a viewer or an admin.',
          action: 'Show', go: () => _sgScrollTo(document.getElementById('settings-section-users'), 'settings-invite-form') },
        { title: 'Notifications', state: notifyDone ? 'done' : 'optional',
          desc: 'Takeoff, landing and signal-gap alerts by webhook or Pushover.',
          action: 'Open', go: () => _openTenantSettings() },
      ];

      const list = document.getElementById('settings-setup-steps');
      list.innerHTML = '';
      for (const s of steps) {
        const li = document.createElement('li');
        li.className = 'setup-guide-step';
        const body = document.createElement('div');
        body.className = 'setup-guide-step-body';
        const head = document.createElement('div');
        head.className = 'setup-guide-step-head';
        const title = document.createElement('span');
        title.className = 'setup-guide-step-title';
        title.textContent = s.title;
        head.appendChild(title);
        head.insertAdjacentHTML('beforeend', _sgChips[s.state]);
        const desc = document.createElement('span');
        desc.className = 'settings-row-desc';
        desc.textContent = s.desc;
        body.appendChild(head);
        body.appendChild(desc);
        const btn = document.createElement('button');
        btn.className = 'settings-action-btn';
        btn.textContent = s.action;
        btn.addEventListener('click', s.go);
        li.appendChild(body);
        li.appendChild(btn);
        list.appendChild(li);
      }
      section.style.display = '';
    }

    async function _sgSetDismissed(value) {
      try {
        await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setup_dismissed: value }),
        });
      } catch (_) {}
    }

    document.getElementById('settings-setup-dismiss').addEventListener('click', async () => {
      document.getElementById('settings-section-setup').style.display = 'none';
      await _sgSetDismissed('1');
    });

    document.getElementById('settings-setup-show').addEventListener('click', async () => {
      await _sgSetDismissed('0');
      await renderSetupGuide(true);
      document.getElementById('settings-view-main').scrollTop = 0;
    });
  `;
}
