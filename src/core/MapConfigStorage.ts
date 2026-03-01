import type { LocalizedString, MapConfig } from '../types';

const MAP_ADD_PREFIX = 'map_viewer_added_maps_';
const MAP_RENAME_PREFIX = 'map_viewer_renamed_maps_';

/**
 * MapConfigStorage - Persists user-added maps and map renames to localStorage.
 *
 * Added maps:  key = `map_viewer_added_maps_{gameId}`   → Record<mapId, MapConfig>
 * Renames:     key = `map_viewer_renamed_maps_{gameId}`  → Record<mapId, LocalizedString>
 */
export class MapConfigStorage {
  // ─── Added Maps ─────────────────────────────────────────

  private static _addKey(gameId: string): string {
    return `${MAP_ADD_PREFIX}${gameId}`;
  }

  /** Save a user-added map config. */
  static addMap(gameId: string, mapId: string, config: MapConfig): void {
    const all = this.loadAddedMaps(gameId);
    all[mapId] = config;
    try {
      localStorage.setItem(this._addKey(gameId), JSON.stringify(all));
    } catch (e) {
      console.warn('Failed to save added map to localStorage:', e);
    }
  }

  /** Remove a user-added map. */
  static removeAddedMap(gameId: string, mapId: string): void {
    const all = this.loadAddedMaps(gameId);
    delete all[mapId];
    try {
      localStorage.setItem(this._addKey(gameId), JSON.stringify(all));
    } catch (e) {
      console.warn('Failed to update localStorage:', e);
    }
  }

  /** Load all user-added maps for a game. */
  static loadAddedMaps(gameId: string): Record<string, MapConfig> {
    try {
      const raw = localStorage.getItem(this._addKey(gameId));
      if (!raw) return {};
      return JSON.parse(raw) as Record<string, MapConfig>;
    } catch {
      return {};
    }
  }

  // ─── Renames ────────────────────────────────────────────

  private static _renameKey(gameId: string): string {
    return `${MAP_RENAME_PREFIX}${gameId}`;
  }

  /** Save a map name override. */
  static renameMap(gameId: string, mapId: string, name: LocalizedString): void {
    const all = this.loadRenames(gameId);
    all[mapId] = name;
    try {
      localStorage.setItem(this._renameKey(gameId), JSON.stringify(all));
    } catch (e) {
      console.warn('Failed to save rename to localStorage:', e);
    }
  }

  /** Load all map name overrides for a game. */
  static loadRenames(gameId: string): Record<string, LocalizedString> {
    try {
      const raw = localStorage.getItem(this._renameKey(gameId));
      if (!raw) return {};
      return JSON.parse(raw) as Record<string, LocalizedString>;
    } catch {
      return {};
    }
  }

  /** Clear all data for a game. */
  static clearGame(gameId: string): void {
    localStorage.removeItem(this._addKey(gameId));
    localStorage.removeItem(this._renameKey(gameId));
  }
}
