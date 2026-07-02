import type { ViewState } from '../types';

/**
 * hashRoute - Pure helpers for the URL hash deep-link format:
 *
 *   #{gameId}/{mapId}@{lat},{lng},{zoom}&poi={poiId}
 *
 * The view and poi parts are optional; `poi` deep-links a specific marker
 * (the viewer pans to it and flashes it). Kept free of window/history access
 * so the format can be unit-tested; main.ts owns the actual History API calls.
 */

export interface HashTarget {
  gameId: string;
  mapId: string;
  view?: ViewState;
  poi?: string;
}

/** Parse a `#gameId/mapId@lat,lng,zoom&poi=id` hash, or null if absent/invalid. */
export function parseHash(hash: string): HashTarget | null {
  let raw = hash.replace(/^#/, '');
  if (!raw) return null;

  let poi: string | undefined;
  const poiMatch = raw.match(/&poi=([^&]+)/);
  if (poiMatch) {
    poi = decodeURIComponent(poiMatch[1]);
    raw = raw.replace(/&poi=[^&]+/, '');
  }

  const m = raw.match(/^([^/]+)\/([^@]+)(?:@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?))?$/);
  if (!m) return null;
  const [, gameId, mapId, lat, lng, zoom] = m;
  const view: ViewState | undefined = lat != null
    ? { center: [parseFloat(lat), parseFloat(lng)] as [number, number], zoom: parseFloat(zoom) }
    : undefined;
  return { gameId: decodeURIComponent(gameId), mapId: decodeURIComponent(mapId), view, poi };
}

/** Format the current game/map/view (and optional focused POI) as a URL hash. */
export function formatHash(gameId: string, mapId: string, vs: ViewState, poi?: string): string {
  const g = encodeURIComponent(gameId);
  const mp = encodeURIComponent(mapId);
  const base = `#${g}/${mp}@${vs.center[0].toFixed(1)},${vs.center[1].toFixed(1)},${vs.zoom.toFixed(2)}`;
  return poi ? `${base}&poi=${encodeURIComponent(poi)}` : base;
}
