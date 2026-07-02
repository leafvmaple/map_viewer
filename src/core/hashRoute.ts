import type { ViewState } from '../types';

/**
 * hashRoute - Pure helpers for the URL hash deep-link format:
 *
 *   #{gameId}/{mapId}@{lat},{lng},{zoom}
 *
 * The view part is optional. Kept free of window/history access so the
 * format can be unit-tested; main.ts owns the actual History API calls.
 */

export interface HashTarget {
  gameId: string;
  mapId: string;
  view?: ViewState;
}

/** Parse a `#gameId/mapId@lat,lng,zoom` hash, or null if absent/invalid. */
export function parseHash(hash: string): HashTarget | null {
  const raw = hash.replace(/^#/, '');
  if (!raw) return null;
  const m = raw.match(/^([^/]+)\/([^@]+)(?:@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?))?$/);
  if (!m) return null;
  const [, gameId, mapId, lat, lng, zoom] = m;
  const view: ViewState | undefined = lat != null
    ? { center: [parseFloat(lat), parseFloat(lng)] as [number, number], zoom: parseFloat(zoom) }
    : undefined;
  return { gameId: decodeURIComponent(gameId), mapId: decodeURIComponent(mapId), view };
}

/** Format the current game/map/view as a shareable URL hash. */
export function formatHash(gameId: string, mapId: string, vs: ViewState): string {
  const g = encodeURIComponent(gameId);
  const mp = encodeURIComponent(mapId);
  return `#${g}/${mp}@${vs.center[0].toFixed(1)},${vs.center[1].toFixed(1)},${vs.zoom.toFixed(2)}`;
}
