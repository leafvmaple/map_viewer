import type { GameConfig, GameDataCatalogs, GamesRegistry, MapListItem, RegistryEntry } from '../types';

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

  /** Load optional external item/service catalogs declared by game.json `data`. */
  async loadGameData(gameConfig: GameConfig): Promise<GameDataCatalogs> {
    const out: GameDataCatalogs = { items: {}, services: {}, species: {}, parties: {}, trainers: {}, currencies: {} };
    const refs = gameConfig.data;
    if (!refs) return out;

    out.items = await this._loadCatalog(gameConfig, refs.items, 'items', 'item');
    out.services = await this._loadCatalog(gameConfig, refs.services, 'services', 'service');
    out.species = await this._loadCatalog(gameConfig, refs.species, 'species', 'species');
    out.parties = await this._loadCatalog(gameConfig, refs.parties, 'parties', 'party');
    out.trainers = await this._loadCatalog(gameConfig, refs.trainers, 'trainers', 'trainer');
    out.currencies = await this._loadCatalog(gameConfig, refs.currencies, 'currencies', 'currency');
    this._validateGameData(gameConfig, out);
    return out;
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
      hasJumps: (map.jumps?.length ?? 0) > 0,
      floorGroup: map.floorGroup,
      floor: map.floor,
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
      const mapSize = this._mapSize(map);

      const triggers = map.triggers ?? [];
      if (!Array.isArray(triggers)) {
        warnings.push(`map "${mapId}" triggers is not an array`);
        continue;
      }
      for (const t of triggers) {
        if (!this._isValidBounds(t?.bounds)) {
          warnings.push(`trigger "${t?.id ?? '?'}" in "${mapId}" has malformed bounds`);
        } else if (mapSize && !this._boundsInside(t.bounds, mapSize)) {
          warnings.push(`trigger "${t.id}" in "${mapId}" has out-of-bounds bounds`);
        }
        if (t?.target && !mapIds.has(t.target)) {
          warnings.push(`trigger "${t.id}" in "${mapId}" targets unknown map "${t.target}"`);
        }
        if (t?.focus) {
          const targetSize = t.target ? this._mapSize(config.maps[t.target]) : undefined;
          if (!this._isValidPoint(t.focus) || (targetSize && !this._pointInside(t.focus, targetSize, true))) {
            warnings.push(`trigger "${t.id}" in "${mapId}" has out-of-bounds target focus`);
          }
        }
      }
      const jumps = map.jumps ?? [];
      if (!Array.isArray(jumps)) {
        warnings.push(`map "${mapId}" jumps is not an array`);
        continue;
      }
      for (const j of jumps) {
        if (!j?.target || typeof j.target !== 'string') {
          warnings.push(`jump "${j?.id ?? '?'}" in "${mapId}" is missing target`);
        } else if (!mapIds.has(j.target)) {
          warnings.push(`jump "${j.id ?? '?'}" in "${mapId}" targets unknown map "${j.target}"`);
        }
      }
      for (const poi of map.pois ?? []) {
        if (mapSize && (!this._isValidPoint(poi?.pos) || !this._pointInside(poi.pos, mapSize, false))) {
          warnings.push(`poi "${poi?.id ?? '?'}" in "${mapId}" has out-of-bounds position`);
        }
      }
      for (const event of map.events ?? []) {
        if (mapSize && (!this._isValidBounds(event?.bounds) || !this._boundsInside(event.bounds, mapSize))) {
          warnings.push(`event "${event?.id ?? '?'}" in "${mapId}" has out-of-bounds bounds`);
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

  private _isValidPoint(point: unknown): point is [number, number] {
    return Array.isArray(point) && point.length === 2 && point.every(value => typeof value === 'number');
  }

  private _mapSize(map: unknown): [number, number] | undefined {
    if (!map || typeof map !== 'object') return undefined;
    const { width, height } = map as { width?: unknown; height?: unknown };
    return typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0
      ? [width, height]
      : undefined;
  }

  private _pointInside(point: [number, number], size: [number, number], includeEdge: boolean): boolean {
    const [x, y] = point;
    const [width, height] = size;
    return includeEdge
      ? x >= 0 && x <= width && y >= 0 && y <= height
      : x >= 0 && x < width && y >= 0 && y < height;
  }

  private _boundsInside(bounds: [[number, number], [number, number]], size: [number, number]): boolean {
    const [[x1, y1], [x2, y2]] = bounds;
    return x1 >= 0 && y1 >= 0 && x1 < x2 && y1 < y2 && x2 <= size[0] && y2 <= size[1];
  }

  private _validateGameData(config: GameConfig, catalogs: GameDataCatalogs): void {
    const warnings: string[] = [];
    const itemIds = new Set(Object.keys(catalogs.items));
    const serviceIds = new Set(Object.keys(catalogs.services));
    const speciesIds = new Set(Object.keys(catalogs.species));
    const partyIds = new Set(Object.keys(catalogs.parties));
    const trainerIds = new Set(Object.keys(catalogs.trainers));
    const currencyIds = new Set(Object.keys(catalogs.currencies));

    for (const [mapId, map] of Object.entries(config.maps)) {
      for (const poi of map.pois ?? []) {
        for (const ref of poi.itemRefs ?? []) {
          if (!itemIds.has(ref.itemId)) warnings.push(`maps/${mapId}/pois/${poi.id}: itemRef '${ref.itemId}' missing from item catalog`);
        }
        for (const serviceId of poi.serviceIds ?? []) {
          if (!serviceIds.has(serviceId)) warnings.push(`maps/${mapId}/pois/${poi.id}: serviceId '${serviceId}' missing from service catalog`);
        }
        if (poi.trainerId && !trainerIds.has(poi.trainerId)) {
          warnings.push(`maps/${mapId}/pois/${poi.id}: trainerId '${poi.trainerId}' missing from trainer catalog`);
        }
        if (poi.partyId && !partyIds.has(poi.partyId)) {
          warnings.push(`maps/${mapId}/pois/${poi.id}: partyId '${poi.partyId}' missing from party catalog`);
        }
        if (poi.speciesId && !speciesIds.has(poi.speciesId)) {
          warnings.push(`maps/${mapId}/pois/${poi.id}: speciesId '${poi.speciesId}' missing from species catalog`);
        }
        for (const ref of poi.currencyRefs ?? []) {
          if (!currencyIds.has(ref.currencyId)) warnings.push(`maps/${mapId}/pois/${poi.id}: currencyRef '${ref.currencyId}' missing from currency catalog`);
        }
      }
    }

    for (const [serviceId, service] of Object.entries(catalogs.services)) {
      for (const entry of [...service.entries, ...(service.award ? [service.award] : [])]) {
        if (entry.type === 'item' && entry.itemId && !itemIds.has(entry.itemId)) {
          warnings.push(`services/${serviceId}: itemId '${entry.itemId}' missing from item catalog`);
        }
      }
    }

    for (const [trainerId, trainer] of Object.entries(catalogs.trainers)) {
      if (trainer.partyId && !partyIds.has(trainer.partyId)) {
        warnings.push(`trainers/${trainerId}: partyId '${trainer.partyId}' missing from party catalog`);
      }
      for (const ref of trainer.currencyRefs ?? []) {
        if (!currencyIds.has(ref.currencyId)) warnings.push(`trainers/${trainerId}: currencyRef '${ref.currencyId}' missing from currency catalog`);
      }
    }

    for (const [partyId, party] of Object.entries(catalogs.parties)) {
      for (const member of party.members ?? []) {
        if (member.speciesId && !speciesIds.has(member.speciesId)) {
          warnings.push(`parties/${partyId}: speciesId '${member.speciesId}' missing from species catalog`);
        }
        if (member.itemId && !itemIds.has(member.itemId)) {
          warnings.push(`parties/${partyId}: itemId '${member.itemId}' missing from item catalog`);
        }
      }
    }

    if (warnings.length > 0) {
      const shown = warnings.slice(0, 50);
      console.warn(
        `[GameLoader] "${config.id}" loaded with ${warnings.length} catalog warning(s):\n  - ` +
          shown.join('\n  - ') +
          (warnings.length > shown.length ? `\n  ...and ${warnings.length - shown.length} more` : ''),
      );
    }
  }

  private async _loadCatalog<K extends keyof GameDataCatalogs>(
    gameConfig: GameConfig,
    path: string | undefined,
    key: K,
    label: string,
  ): Promise<GameDataCatalogs[K]> {
    if (!path) return {} as GameDataCatalogs[K];
    const resp = await fetch(this.resolveImagePath(gameConfig, path));
    if (!resp.ok) throw new Error(`Failed to load ${label} catalog: ${resp.status}`);
    const data = await resp.json() as Partial<GameDataCatalogs>;
    return (data[key] ?? {}) as GameDataCatalogs[K];
  }
}
