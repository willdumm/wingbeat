import { toKnots, toFeet } from '../../shared/format';

/** Pure utility functions shared across multiple modules. */
export function dashboardScriptsHelpers(): string {
  return `
    function bearingBetween(ll1, ll2) {
      const toRad = d => d * Math.PI / 180;
      const lat1 = toRad(ll1[0]), lat2 = toRad(ll2[0]);
      const dLon = toRad(ll2[1] - ll1[1]);
      return (Math.atan2(
        Math.sin(dLon) * Math.cos(lat2),
        Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
      ) * 180 / Math.PI + 360) % 360;
    }

    function cardinalDir(deg) {
      const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
      return dirs[Math.round(deg / 22.5) % 16];
    }

    function dayKey(d) {
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function fmtDay(d) {
      return d.toLocaleDateString(undefined, {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
      });
    }

    function fmtTime(d) {
      return d.toLocaleTimeString(undefined, {
        hour: '2-digit', minute: '2-digit',
        timeZoneName: 'short',
      });
    }

    ${toKnots.toString()}

    ${toFeet.toString()}

    function relTime(epoch) {
      if (!epoch) return 'never';
      const sec = Math.floor(Date.now() / 1000) - epoch;
      if (sec < 60) return 'just now';
      if (sec < 3600) return Math.floor(sec / 60) + ' min ago';
      if (sec < 86400) return Math.floor(sec / 3600) + ' hr ago';
      return Math.floor(sec / 86400) + ' days ago';
    }

    function copyToClipboard(text, btnEl, labelEl) {
      const original = labelEl.textContent;
      const finish = () => {
        labelEl.textContent = 'Copied!';
        btnEl.classList.add('copied');
        setTimeout(() => { labelEl.textContent = original; btnEl.classList.remove('copied'); }, 2000);
      };
      navigator.clipboard.writeText(text).then(finish).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        finish();
      });
    }

    // Shared handler for the "Copy link" buttons in every info popup under container
    // (the document, or a showcase demo's shadow root).
    function wireLinkCopyButtons(container) {
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('.info-popup-link-copy');
        if (!btn) return;
        const link = btn.closest('.info-popup-link-row')?.querySelector('a');
        if (!link || !link.href) return;
        copyToClipboard(link.href, btn, btn.querySelector('.info-popup-link-copy-lbl'));
      });
    }

    // Returns the most-recent live data entry (any tracker) or null.
    function getAnyLiveData() {
      const entries = Object.values(liveDataByTracker);
      if (!entries.length) return null;
      return entries.reduce((best, cur) =>
        (!best || (cur.garmin_time ?? 0) > (best.garmin_time ?? 0)) ? cur : best, null);
    }
  `;
}
