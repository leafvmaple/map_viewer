import type { TriggerDef } from '../types';

const STORAGE_PREFIX = 'map_viewer_triggers_';

/**
 * TriggerStorage - Persists trigger edits to localStorage.
 *
 * Key format: `map_viewer_triggers_{gameId}_{mapId}`
 * Value: JSON array of TriggerDef.
 *
 * This allows edits to survive page refreshes and Vite HMR.
 * When loading a map, the app should check for overrides here
 * and merge them over the base game.json data.
 */
export class TriggerStorage {
  /** Build the localStorage key for a specific map. */
  private static _key(gameId: string, mapId: string): string {
    return `${STORAGE_PREFIX}${gameId}_${mapId}`;
  }

  /** Save triggers for a map. */
  static save(gameId: string, mapId: string, triggers: TriggerDef[]): void {
    try {
      const key = this._key(gameId, mapId);
      localStorage.setItem(key, JSON.stringify(triggers));
    } catch (e) {
      console.warn('Failed to save triggers to localStorage:', e);
    }
  }

  /** Load saved triggers for a map, or null if none exist. */
  static load(gameId: string, mapId: string): TriggerDef[] | null {
    try {
      const key = this._key(gameId, mapId);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as TriggerDef[];
      return null;
    } catch {
      return null;
    }
  }

  /** Check if a map has saved trigger overrides. */
  static has(gameId: string, mapId: string): boolean {
    return localStorage.getItem(this._key(gameId, mapId)) !== null;
  }

  /** Remove saved triggers for a map (revert to game.json defaults). */
  static remove(gameId: string, mapId: string): void {
    localStorage.removeItem(this._key(gameId, mapId));
  }

  /** Remove all saved triggers for a game. */
  static clearGame(gameId: string): void {
    const prefix = `${STORAGE_PREFIX}${gameId}_`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }

  /** Remove all saved triggers for all games. */
  static clearAll(): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }
}
