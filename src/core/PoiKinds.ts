import { i18n } from '../i18n/index.js';
import type { PoiKindDef } from '../types';

/**
 * PoiKinds - Display metadata for POI categories (legend rows, checklist
 * glyphs). Resolution order per kind:
 *
 *   1. the game's own `poiKinds` metadata from game.json (new kinds ship with
 *      their data — no viewer release needed),
 *   2. the viewer's built-in i18n key / glyph for well-known kinds,
 *   3. the raw kind id / a generic pin.
 */

/** Built-in glyphs for well-known kinds (fallback: generic pin). */
export const KIND_GLYPHS: Record<string, string> = {
  treasure: '⭐',
  gold: '💰',
  trainer: '⚔️',
  sign: '🪧',
  heal: '💊',
  cut: '🌲',
  rock: '🪨',
  boulder: '🗿',
  pokemon: '🐾',
  berry: '🍒',
  dock: '⚓',
  shop: '🏪',
  vending: '🥫',
  inn: '🛏️',
  rental: '🚙',
  service: '🔧',
  transport: '↕',
  place: '📌',
  route: '🚩',
};

export type PoiKindMeta = Record<string, PoiKindDef> | undefined;

/** Localized display name for a kind. */
export function kindDisplayName(meta: PoiKindMeta, kind: string): string {
  const own = meta?.[kind]?.name;
  if (own) {
    const name = i18n.localize(own);
    if (name) return name;
  }
  const key = `poi.kind.${kind}`;
  const name = i18n.t(key);
  return name === key ? kind : name;
}

/** Legend/list glyph for a kind. */
export function kindGlyph(meta: PoiKindMeta, kind: string): string {
  return meta?.[kind]?.glyph || KIND_GLYPHS[kind] || '📍';
}
