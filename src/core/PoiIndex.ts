import { i18n } from '../i18n/index.js';
import type { GameConfig, PoiDef } from '../types';

// ============================================================
// PoiIndex - a flat, game-wide index of every map's POIs.
//
// Because the data is a complete ROM export (not hand-curated), a global
// index is authoritative: "search everything" and "full-collection checklist"
// are exact by construction. Built once per game load; ~1.4k entries for the
// largest game so far, so flat scans are plenty fast.
// ============================================================

export interface PoiIndexEntry {
  mapId: string;
  poi: PoiDef;
}

/** POI kinds that count as collectible chests (list / checklist / progress). */
export const CHEST_KINDS = new Set(['treasure', 'gold']);

/** POI kinds the user can mark (chests collected, trainers defeated…). */
export const MARKABLE_KINDS = new Set(['treasure', 'gold', 'trainer']);

/** Flatten a game config into one entry per POI, in maps/pois order. */
export function buildPoiIndex(config: GameConfig): PoiIndexEntry[] {
  const index: PoiIndexEntry[] = [];
  for (const [mapId, map] of Object.entries(config.maps)) {
    for (const poi of map.pois ?? []) {
      index.push({ mapId, poi });
    }
  }
  return index;
}

/**
 * Case-insensitive substring search over every label language + the raw item
 * id, across ALL maps of the game.
 */
export function searchPois(index: PoiIndexEntry[], query: string, limit = 20): PoiIndexEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: PoiIndexEntry[] = [];
  for (const entry of index) {
    const { poi } = entry;
    const haystack: string[] = [];
    if (poi.label) {
      for (const value of Object.values(poi.label)) {
        if (value) haystack.push(value);
      }
    }
    if (poi.item) haystack.push(poi.item);
    if (haystack.some(text => text.toLowerCase().includes(q))) {
      results.push(entry);
      if (results.length >= limit) break;
    }
  }
  return results;
}

/**
 * Compact display name for a POI: its localized label without the
 * "宝箱 · " kind prefix (falls back to the raw item id).
 */
export function poiItemName(poi: PoiDef): string {
  const full = poi.label ? i18n.localize(poi.label) : '';
  const sep = full.indexOf('·');
  if (sep >= 0) return full.slice(sep + 1).trim();
  return full || poi.item || '?';
}
