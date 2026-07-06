// ============================================================
// Shared type definitions for Game Map Viewer
// ============================================================

/** Localized string: an object keyed by language code */
export interface LocalizedString {
  en?: string;
  zh?: string;
  ja?: string;
  [lang: string]: string | undefined;
}

/** A single trigger zone on a map */
export interface ReturnTargetDef {
  /** Candidate source map for a return-stack exit. */
  target: string;
  /** Optional pixel focus on the candidate source map. */
  focus?: [number, number];
  /** Optional display label for chooser/fallback UI. */
  label?: LocalizedString;
}

export interface TriggerDef {
  id: string;
  /** Pixel bounds: [[x1, y1], [x2, y2]] */
  bounds: [[number, number], [number, number]];
  /** Target map ID within the same game, or "__return__" for return-stack exits. */
  target: string;
  /** Trigger semantics. `return` means go back to the source map that entered here. */
  kind?: string;
  /** Candidate source maps for `kind: "return"` fallback when no nav context exists. */
  returnTargets?: ReturnTargetDef[];
  /** Display label */
  label: LocalizedString;
}

/** One member of a POI's battle party — a trainer's Pokémon, an enemy
 *  general's army, a boss group… Rendered as an icon · name · badge row. */
export interface PartyMemberDef {
  /** Localized member name (e.g. { zh: "火爆猴" } or { zh: "张飞" }). */
  name: LocalizedString;
  /** Numeric badge, right-aligned (a level, a troop count…). Omit for none. */
  value?: number;
  /** Localized badge prefix shown dimmed before `value`. Default "Lv" —
   *  e.g. { zh: "兵" } renders 「兵12000」. */
  unit?: LocalizedString;
  /** Optional game-internal id of this member (species / general id). */
  id?: number;
  /** Optional mini-icon path (relative to the game's res dir). */
  icon?: string;
}

/** One item contained in a multi-reward POI, e.g. a chest with several rewards. */
export interface PoiItemDef {
  name: LocalizedString;
  /** Optional item id/hex for this contained item. */
  item?: string;
  /** Same format as `PoiDef.itemIcon`: image path or `emoji:<glyph>`. */
  itemIcon?: string;
}

/** A point of interest on a map (e.g. a treasure chest) */
export interface PoiDef {
  id: string;
  /** POI category, e.g. "treasure" */
  kind: string;
  /** Pixel position [x, y] (top-left of the tile) */
  pos: [number, number];
  /** Display label */
  label?: LocalizedString;
  /** Optional item id/hex for treasure POIs */
  item?: string;
  /** Optional sprite image (relative to the game's res dir, like map `image`).
   *  When set, the POI renders as this sprite instead of a glyph — on every
   *  map, not just the overworld (e.g. trainer NPC sprites). */
  icon?: string;
  /** Optional item mini-icon shown in the tooltip, treasure panel and checklist.
   *  Use a relative image path for ROM bag icons, or `emoji:<glyph>` when a
   *  game has no item icon graphics. NOT shown as a map marker. */
  itemIcon?: string;
  /** Optional explicit contents list for a POI that yields multiple items. */
  items?: PoiItemDef[];
  /** Native pixel size [w, h] of `icon` (defaults to [16, 32]). */
  iconSize?: [number, number];
  /**
   * True when the collectible has NO visible sprite in the rendered map image
   * (buried / Itemfinder-style items). Only these get an attention glyph —
   * visible chests are covered by their baked-in sprite + a hover zone.
   */
  hidden?: boolean;
  /** Structured battle party (a trainer's mons, an enemy general's army…);
   *  full roster in battle order. When present the tooltip renders an
   *  icon/name/badge card instead of plain text, and the POI is markable. */
  party?: PartyMemberDef[];
  /** Defeat reward (prize money, spoils…), pre-formatted (e.g. "¥624").
   *  Shown dimmed in the party-card header. */
  reward?: LocalizedString;
}

/** Map rendering type */
export type MapType = 'image' | 'tiles';

/** Configuration for a single map within a game */
export interface MapConfig {
  name: LocalizedString;
  type: MapType;
  /** Relative image path (for type=image) */
  image: string;
  /** Tile URL template (for type=tiles), e.g. "world_tiles/{z}/{x}_{y}.png" */
  tilesPath?: string;
  /** Lowest pre-rendered pyramid level for type=tiles (default -5). */
  minNativeZoom?: number;
  /** Tile size in pixels (used for grid overlay) */
  tileSize?: number;
  /** Building/dungeon key: maps sharing it are floors of one place and get
   *  an in-map floor switcher. Stable across re-exports. */
  floorGroup?: string;
  /** Floor number within `floorGroup` (1 = ground, -1 = B1F). */
  floor?: number;
  /** Max zoom for tile maps */
  maxZoom?: number;
  /**
   * Optional intrinsic pixel size of `image`. When both are provided the viewer
   * skips the image-probe step (faster first paint) and — together with
   * `thumbnail` — can render a low-res placeholder before the full image loads.
   */
  width?: number;
  height?: number;
  /**
   * Optional low-resolution placeholder image, displayed instantly and scaled to
   * the same bounds as `image`, then swapped for the full-res image once it loads.
   * Requires `width`/`height` to take effect (they define the bounds).
   */
  thumbnail?: string;
  /** Trigger definitions */
  triggers: TriggerDef[];
  /** Points of interest (treasure chests, etc.) */
  pois?: PoiDef[];
  /** Event-driven tile changes (e.g. a wall opening), toggled by the viewer. */
  events?: EventDef[];
}

/** A terrain change a map applies when a story event fires (toggleable overlay). */
export interface EventDef {
  id: string;
  /** Pixel rectangle [[x1, y1], [x2, y2]] the overlay covers. */
  bounds: [[number, number], [number, number]];
  /** Overlay image path (changed tiles only), relative to the game's res dir. */
  overlay: string;
  /** Display label. */
  label?: LocalizedString;
  /** Number of tiles this event changes. */
  tiles?: number;
}

/** Display metadata for a game-specific POI kind (legend name + glyph). */
export interface PoiKindDef {
  name: LocalizedString;
  /** Legend/list glyph (an emoji). Falls back to the viewer's built-ins. */
  glyph?: string;
}

/** Provenance stamp written by the producer at export time — identifies which
 *  export (and which decoder iteration) the served data came from. */
export interface ExportStamp {
  /** ISO timestamp of the export. */
  exportedAt: string;
  /** Producing tool + its git sha, e.g. "nes_decoder@4b3941b". */
  producer?: string;
  /** Short hash of the source ROM, e.g. "sha1:9f2a01c4". */
  rom?: string;
}

/** Full game configuration (game.json) */
export interface GameConfig {
  id: string;
  /** Contract version the file was produced against (currently 1). */
  version?: number;
  name: LocalizedString;
  defaultMap: string;
  maps: Record<string, MapConfig>;
  /** Display metadata for this game's POI kinds — new kinds ship with their
   *  data instead of requiring viewer i18n/glyph updates. */
  poiKinds?: Record<string, PoiKindDef>;
  /** Export provenance (shown in the build-identifier chip). */
  export?: ExportStamp;
  /** Computed at runtime: base URL path for resolving relative image paths */
  _basePath?: string;
}

/** Entry in the games registry (registry.json) */
export interface RegistryEntry {
  id: string;
  configPath: string;
  /** Localized game name — lets the dropdown label games without fetching
   *  every game.json up front. */
  name?: LocalizedString;
}

/** Games registry file structure */
export interface GamesRegistry {
  games: RegistryEntry[];
}

/** Saved map view state for restoring on back navigation */
export interface ViewState {
  center: [number, number]; // [lat, lng] in CRS.Simple
  zoom: number;
}

/** Navigation stack entry */
export interface NavEntry {
  gameId: string;
  mapId: string;
  viewState?: ViewState;
}

/** Map list item (for sidebar display) */
export interface MapListItem {
  id: string;
  name: LocalizedString;
  hasTriggers: boolean;
}

/** Supported language codes */
export type LangCode = 'en' | 'zh' | 'ja';

/** Language option for UI display */
export interface LangOption {
  code: LangCode;
  label: string;
}
