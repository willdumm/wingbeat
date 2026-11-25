/**
 * The vector basemap's colors: a Protomaps flavor and the colors that differ from it, for both
 * clients. `npm run map:theme` edits it on the live map and writes this file.
 */
import type { Flavor } from '@protomaps/basemaps';

export interface MapTheme {
  /** The Protomaps flavor (and its icon sprite). */
  base: 'light' | 'white' | 'grayscale' | 'dark' | 'black';
  colors: Partial<Flavor>;
}

export const MAP_THEME: MapTheme = {
  "base": "white",
  "colors": {}
};
