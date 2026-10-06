/**
 * Shared collapsible section toggle — used by the filter panel and alert strip.
 * Finds the .chevron child of barEl and rotates it (via [data-open]); toggles
 * bodyEl visibility. State lives in the DOM (bodyEl.style.display) — no separate
 * JS variable needed.
 */
export function toggleScript(): string {
  return `
    function initToggleSection(barEl, bodyEl, initialOpen) {
      var chev = barEl.querySelector('.chevron');
      function _setOpen(open) {
        if (chev) chev.setAttribute('data-open', open ? 'true' : 'false');
        bodyEl.style.display = open ? '' : 'none';
      }
      barEl.addEventListener('click', function() {
        _setOpen(bodyEl.style.display === 'none');
      });
      _setOpen(!!initialOpen);
    }
  `;
}
