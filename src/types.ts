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
export interface TriggerDef {
  id: string;
  /** Pixel bounds: [[x1, y1], [x2, y2]] */
  bounds: [[number, number], [number, number]];
  /** Target map ID within the same game */
  target: string;
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

/** Full game configuration (game.json) */
export interface GameConfig {
  id: string;
  name: LocalizedString;
  defaultMap: string;
  maps: Record<string, MapConfig>;
  /** Computed at runtime: base URL path for resolving relative image paths */
  _basePath?: string;
}

/** Entry in the games registry (registry.json) */
export interface RegistryEntry {
  id: string;
  configPath: string;
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
