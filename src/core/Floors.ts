import type { GameConfig, ViewState } from '../types';

/**
 * Floors - Pure helpers for the in-map floor switcher.
 *
 * Maps sharing a `floorGroup` are floors of one building/dungeon; the viewer
 * shows a vertical switcher (top floor first, basements last) when the current
 * map belongs to a group with 2+ members. Kept Leaflet-free for unit testing.
 */

export interface FloorEntry {
  mapId: string;
  floor: number;
}

/** "3" → "3F", "-1" → "B1F", 0/undefined → "1F" (treated as ground). */
export function floorLabel(floor: number | undefined): string {
  const f = floor ?? 1;
  if (f < 0) return `B${-f}F`;
  return `${f === 0 ? 1 : f}F`;
}

/**
 * The current map's floor siblings (itself included), top floor first.
 * Returns [] when the map has no group or the group has fewer than 2 maps —
 * i.e. exactly when the switcher should be hidden.
 */
export function floorSiblings(config: GameConfig, mapId: string): FloorEntry[] {
  const group = config.maps[mapId]?.floorGroup;
  if (!group) return [];
  const entries: FloorEntry[] = [];
  for (const [id, map] of Object.entries(config.maps)) {
    if (map.floorGroup === group) {
      entries.push({ mapId: id, floor: map.floor ?? 1 });
    }
  }
  if (entries.length < 2) return [];
  // Top floor first, basements last; equal floors keep maps-object order.
  entries.sort((a, b) => b.floor - a.floor);
  return entries;
}

/**
 * Preserve the camera only when two floors use the same coordinate space.
 * Shared-template floors commonly reference the same image; separately
 * rendered floors may also preserve the view when their declared dimensions
 * match. Missing or different dimensions fall back to fitBounds.
 */
export function floorSwitchViewState(
  config: GameConfig,
  fromMapId: string,
  toMapId: string,
  viewState: ViewState,
): ViewState | undefined {
  const from = config.maps[fromMapId];
  const to = config.maps[toMapId];
  if (!from || !to || from.floorGroup !== to.floorGroup || !from.floorGroup) return undefined;
  if (from.type !== to.type) return undefined;
  if (
    from.width != null && from.height != null &&
    to.width != null && to.height != null
  ) {
    return from.width === to.width && from.height === to.height ? viewState : undefined;
  }
  if (from.image === to.image) return viewState;
  return undefined;
}
