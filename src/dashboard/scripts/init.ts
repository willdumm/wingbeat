import { sharedMapControlsScripts, tileOverlayLegendMountScript } from '../../shared/map-controls';
import { sharedSidebarToggleScripts } from '../../shared/sidebar';

export function dashboardScriptsInit(): string {
  return `
    // ── Init: fetch lists, init filters, start poll loop ─────────────────────
    (async () => {
      try {
        const bootResp = await fetch('/api/bootstrap');
        if (bootResp.ok) {
          const d = await bootResp.json();
          trackerList = d.trackers;
          aircraftList = d.aircraft;
          pilotList = d.pilots;
          overlayList = d.overlays;
          currentUser = d.me;
        }
      } catch (_) {}
      _ftRenderOverlayLegend();

      if (currentUser?.role !== 'admin') {
        const bulkBtn = document.getElementById('bulk-edit-btn');
        if (bulkBtn) bulkBtn.style.display = 'none';
      }

      const activeTrackers = trackerList.filter(t => t.active && !t.deleted);

      if (activeTrackers.length === 0) {
        document.getElementById('empty-msg').textContent = 'No trackers configured.';
        openSettings();
        return;
      }

      const allTrackerIds = activeTrackers.map(t => t.id);

      // Initialise filter UI and wire up the change callback.
      initFilters((newFilters) => {
        activeFilters = newFilters;
        applyFilter();
        showDefaultMapView();
      });

      // Phase 1: paint from cache synchronously — flight list appears immediately.
      flightStore.init();
      allFlights = flightStore.getAll(allTrackerIds).reverse();
      applyFilter();
      showDefaultMapView();
      initAlerts();

      // Phase 2: fetch incremental update, re-render with live envelope data.
      try {
        const oldFlights = [...allFlights];
        const result = await flightStore.refresh(allTrackerIds);
        applyStoreResult(result);
        if (lastUserInteractionTime === 0) {
          showDefaultMapView();
        } else {
          await refreshMapIfNeeded(oldFlights);
        }
      } catch (_) {}
      scheduleNextLivePoll();
    })();

    // ── Sidebar toggle (mobile: open/close overlay; desktop: collapse/expand) ──
    ${sharedSidebarToggleScripts('map')}

    // ── Zoom controls + basemap switcher ──────────────────────────────────────
    ${sharedMapControlsScripts('map')}
    ${tileOverlayLegendMountScript('map')}

    // Track user-initiated pan/zoom so poll refreshes don't reset the viewport.
    map.on('movestart', (e) => {
      if (e.originalEvent) lastUserInteractionTime = Date.now();
    });

    // Refresh the displayed "polled X ago" time and send a heartbeat ping when the tab regains focus.
    let _lastPingTime = 0;
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        updateAircraftStatusCards();
        const now = Date.now();
        if (now - _lastPingTime > 5 * 60 * 1000) {
          _lastPingTime = now;
          try { await fetch('/api/me/ping', { method: 'POST' }); } catch (_) {}
        }
      }
    });

    // ── Pull-to-refresh: drag down on header, tab bar, or flight list top ───
    // The content wrapper (#ptr-content) slides down to reveal #ptr-indicator
    // behind it. For header touches we call e.preventDefault() at touchstart to
    // block iOS scroll tracking (so touchend always fires), then manually
    // synthesise card taps on release. For the flight list we do NOT prevent
    // default at touchstart so native scroll still works when not at the top.
    (function() {
      var startY = 0, startX = 0, scrollStartLeft = 0;
      var state = 'idle'; // idle | deciding | pulling | scrolling
      var source = 'header'; // 'header' | 'flightlist'
      var threshold = 56;
      var scrollBar   = document.getElementById('aircraft-status-bar');
      var ptrIcon     = document.getElementById('ptr-icon');
      var ptrLbl      = document.getElementById('ptr-label');
      var ptrContent  = document.getElementById('ptr-content');
      var ptrH        = 44;

      function ptrUpdate(dy) {
        if (!ptrContent) return;
        ptrContent.style.transition = 'none';
        ptrContent.style.transform = 'translateY(' + Math.max(Math.min(dy, ptrH), 0) + 'px)';
        var past = dy >= threshold;
        if (ptrIcon) ptrIcon.textContent = past ? '↑' : '↓';
        if (ptrLbl)  ptrLbl.textContent  = past ? 'Release to refresh' : 'Pull to refresh';
      }

      function ptrRefreshing() {
        if (!ptrContent) return;
        ptrContent.style.transition = 'transform 0.2s ease';
        ptrContent.style.transform = 'translateY(' + ptrH + 'px)';
        if (ptrIcon) { ptrIcon.textContent = '↻'; ptrIcon.className = 'ptr-spin'; }
        if (ptrLbl)  ptrLbl.textContent = 'Refreshing…';
      }

      function ptrResetIcon() {
        if (ptrIcon) { ptrIcon.textContent = '↓'; ptrIcon.className = ''; }
        if (ptrLbl)  ptrLbl.textContent = 'Pull to refresh';
      }

      function ptrHide() {
        if (!ptrContent) return;
        var cur = ptrContent.style.transform;
        if (!cur || cur === 'translateY(0px)' || cur === 'translateY(0)') {
          ptrContent.style.transform = ''; // ensure transform is gone
          ptrResetIcon();
          return;
        }
        ptrContent.style.transition = 'transform 0.3s ease';
        ptrContent.style.transform = 'translateY(0)';
        ptrContent.addEventListener('transitionend', function reset() {
          ptrContent.style.transition = 'none';
          ptrContent.style.transform = ''; // remove transform so position:fixed children go back to viewport
          ptrResetIcon();
        }, { once: true });
      }

      document.addEventListener('touchstart', function(e) {
        var inHeader = !!e.target.closest('header');
        var inTopnav = !!e.target.closest('#mobile-topnav');
        var flightListEl = document.getElementById('flight-list');
        var inFlightList = !!e.target.closest('#flight-list');
        var atTopOfFlightList = inFlightList && !!flightListEl && flightListEl.scrollTop <= 0;

        if (!inHeader && !inTopnav && !atTopOfFlightList) return;

        // Block iOS scroll tracking for header so touchend always fires.
        // Skip for topnav (tab-link navigation must work) and flight list (needs native scroll).
        if (inHeader) e.preventDefault();

        var t = e.touches[0];
        startY = t.clientY;
        startX = t.clientX;
        scrollStartLeft = scrollBar ? scrollBar.scrollLeft : 0;
        source = atTopOfFlightList ? 'flightlist' : 'header';
        state = 'deciding';
      }, { passive: false });

      document.addEventListener('touchmove', function(e) {
        if (state === 'idle') return;
        var dy = e.touches[0].clientY - startY;
        var dx = e.touches[0].clientX - startX;
        if (state === 'deciding' && (Math.abs(dy) > 5 || Math.abs(dx) > 5)) {
          if (source === 'flightlist') {
            // Only a downward drag from top triggers PTR; anything else reverts to native.
            if (Math.abs(dy) > Math.abs(dx) && dy > 0) {
              state = 'pulling';
            } else {
              state = 'idle';
              return;
            }
          } else {
            // Header/topnav: vertical pull or horizontal swipe of the aircraft card bar.
            state = Math.abs(dy) >= Math.abs(dx) ? 'pulling' : 'scrolling';
          }
        }
        if (state === 'scrolling') {
          if (scrollBar) scrollBar.scrollLeft = scrollStartLeft - dx;
        } else if (state === 'pulling') {
          e.preventDefault(); // prevent native scroll / overscroll rubber-band
          ptrUpdate(dy);
        }
      }, { passive: false });

      document.addEventListener('touchend', function(e) {
        if (state === 'idle') return;
        var dy = e.changedTouches[0].clientY - startY;
        var wasPulling   = state === 'pulling';
        var wasScrolling = state === 'scrolling';
        var wasTap       = state === 'deciding';
        state = 'idle';

        // Header taps: e.preventDefault() at touchstart blocked browser click synthesis,
        // so manually trigger aircraft card taps (including carousel clones).
        if (wasTap && source === 'header') {
          var tappedCard = e.changedTouches[0].target.closest('.aircraft-card');
          if (tappedCard && tappedCard.dataset.trackerId) {
            openLocationPopup(parseInt(tappedCard.dataset.trackerId, 10));
          }
        }

        if (wasPulling) {
          if (dy > threshold) {
            ptrRefreshing();
            triggerRefresh().finally(ptrHide);
          } else {
            ptrHide();
          }
        }
        if (wasScrolling && scrollBar) {
          // Snap to nearest card after manual scroll
          var cards = Array.from(scrollBar.querySelectorAll('.aircraft-card'));
          if (cards.length) {
            var cur = scrollBar.scrollLeft;
            var best = cards.reduce(function(b, c) {
              return Math.abs(c.offsetLeft - cur) < Math.abs(b.offsetLeft - cur) ? c : b;
            });
            scrollBar.scrollTo({ left: best.offsetLeft, behavior: 'smooth' });
          }
        }
      }, { passive: true });

      document.addEventListener('touchcancel', function() {
        var wasPulling = state === 'pulling';
        state = 'idle';
        if (wasPulling) ptrHide();
      }, { passive: true });
    })();

    // Prevent iOS Safari from scrolling the page when touching non-scrollable areas.
    // header/mobile-topnav touches are fully managed by the pull-to-refresh handler above.
    document.addEventListener('touchmove', (e) => {
      if (!e.target.closest('#flight-list, .settings-view, .be-panel, #alerts-strip, header, #mobile-topnav, .map-controls-bar, .overlay-legend-panel')) {
        e.preventDefault();
      }
    }, { passive: false });
  `;
}
