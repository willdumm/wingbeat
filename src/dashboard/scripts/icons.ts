/** Leaflet icon factories for the direction arrow and the Cessna plane marker. */
export function dashboardScriptsIcons(): string {
  return `
    function makeArrowIcon(deg) {
      return L.divIcon({
        className: '',
        html: '<svg width="24" height="24" viewBox="-12 -12 24 24" xmlns="http://www.w3.org/2000/svg" style="transform:rotate(' + deg + 'deg);display:block"><polygon points="0,-10 5,5 0,1 -5,5" fill="' + getAccentColor() + '" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
    }

    // Cessna 152 SVG icon (FlyingPete, CC-BY-SA).
    // The SVG's nose points DOWN (south) when unrotated, so we add 180° to the
    // bearing so that bearing=0 (north) renders with the nose pointing up.
    // color parameter tints the wing fill; defaults to the standard amber.
    function makePlaneIcon(deg, color) {
      const rot = ((deg ?? 0) + 180) % 360;
      const fillColor = color || '#ffc43b';
      return L.divIcon({
        className: '',
        html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="36" height="36" style="display:block;transform:rotate(' + rot + 'deg);transform-origin:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5))">' +
          '<g transform="matrix(1,0,0,-1,0,64)">' +
          '<path d="m 32,10.2 0.4,0.7 0.2,0.6 4.7,0 0,0.2 -4.6,0.1 0.1,0.4 0.7,0 0.6,0.2 0.3,0.4 0.2,0.7 0.3,3.5 0.1,3 11.3,0 15.6,0.7 0.6,0.4 0.3,0.8 0,5.5 -17.5,2.5 -10.6,0 -1.8,14.1 8,1.2 0.4,0.5 0.2,1.1 0,1.2 -0.2,0.9 -0.4,0.7 -7.3,1.1 -1.3,-2.5 -0.1,5.6 -0.2,0.1 -0.2,-0.1 -0.1,-5.6 -1.3,2.5 -7.3,-1.1 -0.4,-0.7 -0.2,-0.9 0,-1.2 0.2,-1.1 0.4,-0.4 8,-1.3 -1.8,-14.1 -10.6,0 -17.5,-2.5 0,-5.5 0.3,-0.8 0.6,-0.3 15.6,-0.8 11.3,0 0.1,-3 0.3,-3.5 0.2,-0.7 0.3,-0.4 0.6,-0.2 0.7,0 0.1,-0.4 -4.7,-0.1 0,-0.2 4.8,0 0.2,-0.6 z" fill="' + fillColor + '"/>' +
          '</g></svg>',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
    }
  `;
}
