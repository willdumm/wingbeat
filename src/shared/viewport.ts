/**
 * Full-screen page height that matches what's actually visible.
 *
 * The dashboard and analytics pages are one fixed-height, non-scrolling screen (a global
 * touchmove handler cancels page scrolling on iOS), so anything laid out below the visible
 * area is unreachable. `100svh` alone isn't enough: iOS in-app browsers (links opened from
 * Messages, Mail, social apps…) and some Safari toolbar states report a viewport taller
 * than the area left uncovered, which pushed the map controls off the bottom of the screen.
 *
 * This measures the visible height directly and publishes it as `--app-height`, which the
 * page body sizes itself from (falling back to `100svh` before the script runs or without
 * JS). Run it in <head> so the first layout already uses the measured value.
 */
export function viewportHeightInitScript(): string {
  return `(function(){
  var root = document.documentElement, vv = window.visualViewport, last = 0;
  function editing() {
    var el = document.activeElement;
    return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  }
  function measure() {
    var hs = [window.innerHeight, root.clientHeight];
    // The visual viewport is the truest "what's on screen", but it also shrinks with
    // pinch zoom, so only trust it unzoomed.
    if (vv && Math.abs(vv.scale - 1) < 0.01) hs.push(vv.height);
    var h = 0;
    for (var i = 0; i < hs.length; i++) if (hs[i] > 0 && (!h || hs[i] < h)) h = hs[i];
    return Math.round(h);
  }
  function update(fromWindowResize) {
    var h = measure();
    if (!h || h === last) return;
    // An on-screen keyboard shrinks the visual viewport; resizing the whole page under
    // it would reflow the map behind a settings field. Only grow while editing.
    if (last && h < last && editing()) return;
    last = h;
    root.style.setProperty('--app-height', h + 'px');
    // Leaflet (and other layout code) only listens for window resize; a visual-viewport-
    // only change (in-app browser toolbar showing/hiding) wouldn't otherwise reach it.
    if (!fromWindowResize) window.dispatchEvent(new Event('resize'));
  }
  function settle() {
    update(false);
    // The page never scrolls on purpose, but iOS can leave it offset after the keyboard
    // or a toolbar animation; snap back so nothing sits above the top edge.
    if (!editing() && (window.scrollY || window.scrollX)) window.scrollTo(0, 0);
  }
  update(true);
  window.addEventListener('resize', function(){ update(true); });
  window.addEventListener('orientationchange', function(){ setTimeout(settle, 300); });
  window.addEventListener('pageshow', settle);
  window.addEventListener('load', settle);
  document.addEventListener('focusout', function(){ setTimeout(settle, 100); });
  if (vv) vv.addEventListener('resize', settle);
})();`;
}
