import type { GameConfig, GamesRegistry, MapListItem, RegistryEntry } from '../types';

/**
 * GameLoader - Fetches and manages game configurations.
 */
export class GameLoader {
  registry: RegistryEntry[] = [];
  private _cache = new Map<string, GameConfig>();

  /** Fetch the global games registry. */
  async fetchRegistry(): Promise<RegistryEntry[]> {
    const resp = await fetch('/games/registry.json');
    if (!resp.ok) throw new Error(`Failed to load registry: ${resp.status}`);
    const data: GamesRegistry = await resp.json();
    this.registry = data.games ?? [];
    return this.registry;
  }

  /** Load a specific game's configuration. */
  async loadGame(gameId: string): Promise<GameConfig> {
    if (this._cache.has(gameId)) {
      return this._cache.get(gameId)!;
    }

    const entry = this.registry.find(g => g.id === gameId);
    if (!entry) throw new Error(`Game "${gameId}" not found in registry`);

    const resp = await fetch(entry.configPath);
    if (!resp.ok) throw new Error(`Failed to load game config: ${resp.status}`);

    const config: GameConfig = await resp.json();
    this._validate(config);

    // Compute basePath for resolving relative image paths
    const lastSlash = entry.configPath.lastIndexOf('/');
    config._basePath = entry.configPath.substring(0, lastSlash + 1);

    this._cache.set(gameId, config);
    return config;
  }

  /** Resolve an image path relative to the game config's location. */
  resolveImagePath(gameConfig: GameConfig, relativePath: string): string {
    return (gameConfig._basePath ?? '/') + relativePath;
  }

  /** Get an already-loaded (cached) game config, or undefined if not loaded yet. */
  getCached(gameId: string): GameConfig | undefined {
    return this._cache.get(gameId);
  }

  /** Get list of all map IDs and their names from a loaded game config. */
  getMapList(gameConfig: GameConfig): MapListItem[] {
    return Object.entries(gameConfig.maps).map(([id, map]) => ({
      id,
      name: map.name,
      hasTriggers: (map.triggers?.length ?? 0) > 0,
    }));
  }

  /**
   * Validate a game config against the data contract (see CONTRACT.md).
   *
   * Hard structural violations throw (the game cannot load). Softer contract
   * issues — malformed bounds, dangling trigger targets, missing images — are
   * collected and logged as warnings so a partially-broken export is still
   * browsable while surfacing exactly what nes_decoder produced incorrectly.
   */
  private _validate(config: GameConfig): void {
    // ── Hard structural checks ──────────────────────────────
    if (!config.id || typeof config.id !== 'string') {
      throw new Error('Game config: "id" must be a non-empty string');
    }
    if (!config.maps || typeof config.maps !== 'object') {
      throw new Error('Game config: "maps" must be an object');
    }
    if (!config.defaultMap) throw new Error('Game config: missing "defaultMap"');
    if (!config.maps[config.defaultMap]) {
      throw new Error(`Game config: defaultMap "${config.defaultMap}" not found in maps`);
    }

    // ── Soft contract checks (warn, non-fatal) ──────────────
    const warnings: string[] = [];
    const mapIds = new Set(Object.keys(config.maps));

    for (const [mapId, map] of Object.entries(config.maps)) {
      if (!map || typeof map !== 'object') {
        warnings.push(`map "${mapId}" is not an object`);
        continue;
      }
      if (map.type !== 'image' && map.type !== 'tiles') {
        warnings.push(`map "${mapId}" has invalid type "${map.type}"`);
      }
      if (!map.image && !(map.type === 'tiles' && map.tilesPath)) {
        warnings.push(`map "${mapId}" is missing "image"`);
      }

      const triggers = map.triggers ?? [];
      if (!Array.isArray(triggers)) {
        warnings.push(`map "${mapId}" triggers is not an array`);
        continue;
      }
      for (const t of triggers) {
        if (!this._isValidBounds(t?.bounds)) {
          warnings.push(`trigger "${t?.id ?? '?'}" in "${mapId}" has malformed bounds`);
        }
        if (t?.target && !mapIds.has(t.target)) {
          warnings.push(`trigger "${t.id}" in "${mapId}" targets unknown map "${t.target}"`);
        }
      }
    }

    if (warnings.length > 0) {
      const shown = warnings.slice(0, 50);
      console.warn(
        `[GameLoader] "${config.id}" loaded with ${warnings.length} contract warning(s):\n  - ` +
          shown.join('\n  - ') +
          (warnings.length > shown.length ? `\n  ...and ${warnings.length - shown.length} more` : ''),
      );
    }
  }

  /** True if `b` is a well-formed pixel bounds pair: [[x1,y1],[x2,y2]]. */
  private _isValidBounds(b: unknown): boolean {
    return (
      Array.isArray(b) &&
      b.length === 2 &&
      b.every(p => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number'))
    );
  }
}
