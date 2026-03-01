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

  /** Get list of all map IDs and their names from a loaded game config. */
  getMapList(gameConfig: GameConfig): MapListItem[] {
    return Object.entries(gameConfig.maps).map(([id, map]) => ({
      id,
      name: map.name,
      hasTriggers: (map.triggers?.length ?? 0) > 0,
    }));
  }

  /** Basic validation of a game config. */
  private _validate(config: GameConfig): void {
    if (!config.id) throw new Error('Game config missing "id"');
    if (!config.maps) throw new Error('Game config missing "maps"');
    if (!config.defaultMap) throw new Error('Game config missing "defaultMap"');
    if (!config.maps[config.defaultMap]) {
      throw new Error(`Default map "${config.defaultMap}" not found in maps`);
    }
  }
}
