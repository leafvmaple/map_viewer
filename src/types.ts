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
  /** Optional pixel focus on the target map. */
  focus?: [number, number];
  /** Display label */
  label: LocalizedString;
}

/** A non-spatial map jump shown in the sidebar. */
export interface MapJumpDef {
  /** Stable id within the source map when the producer can provide one. */
  id?: string;
  /** Target map ID within the same game. */
  target: string;
  /** Display label; falls back to the target map id. */
  label?: LocalizedString;
  /** Optional jump semantics, e.g. warp, door, shortcut. */
  kind?: string;
  /** Optional target pixel focus. */
  focus?: [number, number];
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
  id?: number | string;
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

export interface PoiItemRefDef {
  /** Stable id in data/items.json. */
  itemId: string;
  /** Optional stack/count for this pickup. */
  quantity?: number;
  [key: string]: unknown;
}

export interface CurrencyRefDef {
  /** Stable id in data/currencies.json. */
  currencyId: string;
  /** Fixed amount, when the reward is deterministic. */
  amount?: number;
  /** Inclusive range, when the game rolls a random amount. */
  amountRange?: [number, number];
  [key: string]: unknown;
}

export interface GameDataRefs {
  /** Item catalog JSON path, relative to res/{gameId}/game.json. */
  items?: string;
  /** Shop/service catalog JSON path, relative to res/{gameId}/game.json. */
  services?: string;
  /** Species catalog JSON path, relative to res/{gameId}/game.json. */
  species?: string;
  /** Battle party catalog JSON path, relative to res/{gameId}/game.json. */
  parties?: string;
  /** Trainer catalog JSON path, relative to res/{gameId}/game.json. */
  trainers?: string;
  /** Currency catalog JSON path, relative to res/{gameId}/game.json. */
  currencies?: string;
  /** Random-encounter realm catalog JSON path, relative to game.json. */
  encounters?: string;
}

/** One display-ready attribute row on a catalog item (attack, defense, …).
 *  `value` may be a number, a plain string ("∞", "1.8t") or a localized string. */
export interface CatalogItemStat {
  label: LocalizedString;
  value: number | string | LocalizedString;
}

export interface CatalogItemDef {
  id: string;
  name: LocalizedString;
  price?: number;
  currency?: string;
  category?: LocalizedString;
  itemIcon?: string;
  /** Equipment attribute rows, rendered verbatim in the item hover tip. */
  stats?: CatalogItemStat[];
  [key: string]: unknown;
}

export interface ServiceEntryDef {
  type: string;
  /** For type="item", display facts resolve through GameDataCatalogs.items[itemId]. */
  itemId?: string;
  /** Optional fallback/override for non-catalog service options. */
  name?: LocalizedString;
  /** Optional fallback/override; normal item prices come from the item catalog. */
  price?: number;
  currency?: string;
  category?: LocalizedString;
  slot?: number;
  quantity?: number;
  available?: boolean;
  rawCount?: string;
  [key: string]: unknown;
}

export interface ServiceDef {
  id: string;
  kind: string;
  name: LocalizedString;
  entries: ServiceEntryDef[];
  award?: ServiceEntryDef;
  source?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SpeciesDef {
  id: string;
  name: LocalizedString;
  icon?: string;
  iconSize?: [number, number];
  [key: string]: unknown;
}

export interface EncounterMemberDef {
  speciesId: string;
  count: number;
}

export interface EncounterOutcomeDef {
  kind: 'monster' | 'formation';
  speciesId?: string;
  groupId?: string;
  members?: EncounterMemberDef[];
  weight: number;
  chancePercent?: number;
  conditional?: boolean;
  countRanges?: [number, number][];
}

export interface EncounterRealmDef {
  id: string;
  name?: LocalizedString;
  attributeRaw?: number;
  ridingTankItemClass?: number;
  initialRateClass?: number;
  surpriseClass?: number;
  probabilitySet?: number;
  totalWeight: number;
  conditional: boolean;
  outcomes: EncounterOutcomeDef[];
}

export interface EncounterZoneDef {
  id: string;
  realmId: string;
  /** Full-resolution pixel bounds, top-left origin. */
  bounds: [[number, number], [number, number]];
}

export interface FixedEncounterDef {
  id: string;
  name: LocalizedString;
  mapId: string;
  /** Trigger tile coordinates, not pixels. */
  pos: [number, number];
  completionFlag: string;
  battleParameter: string;
  handlerId: string;
  active: boolean;
}

export interface PartyMemberRefDef {
  /** Stable id in data/species.json. */
  speciesId?: string;
  /** Optional fallback/override for non-species or exceptional rows. */
  name?: LocalizedString;
  /** Numeric badge, matching inline party `value` semantics. */
  value?: number;
  /** Optional alias used by some producers; resolved as `value` if present. */
  level?: number;
  unit?: LocalizedString;
  id?: number | string;
  icon?: string;
  itemId?: string;
  slot?: number;
  [key: string]: unknown;
}

export interface PartyDef {
  id: string;
  members: PartyMemberRefDef[];
  [key: string]: unknown;
}

export interface TrainerDef {
  id: string;
  name?: LocalizedString;
  label?: LocalizedString;
  className?: LocalizedString;
  partyId?: string;
  reward?: LocalizedString;
  currencyRefs?: CurrencyRefDef[];
  icon?: string;
  iconSize?: [number, number];
  [key: string]: unknown;
}

export interface CurrencyDef {
  id: string;
  name?: LocalizedString;
  symbol?: LocalizedString;
  icon?: string;
  format?: {
    position?: 'prefix' | 'suffix';
    space?: boolean;
  };
  [key: string]: unknown;
}

export interface GameDataCatalogs {
  items: Record<string, CatalogItemDef>;
  services: Record<string, ServiceDef>;
  species: Record<string, SpeciesDef>;
  parties: Record<string, PartyDef>;
  trainers: Record<string, TrainerDef>;
  currencies: Record<string, CurrencyDef>;
  encounters?: Record<string, EncounterRealmDef>;
  fixedEncounters?: Record<string, FixedEncounterDef>;
}

/** A contiguous bitfield inside a save file (e.g. Metal Max's opened-chest bits). */
export interface SaveFlagRegion {
  /** Byte offset of the bitfield, absolute unless `relativeTo` is "record". */
  offset: number;
  /** Length of the bitfield in bytes. */
  length: number;
  /** Resolve `offset` relative to the base selected by `recordSelector`. */
  relativeTo?: 'record';
}

/** Selects one duplicated save record by reading a byte in the raw file. */
export interface SaveRecordSelector {
  /** Absolute byte offset of the selector byte. */
  offset: number;
  /** Selector byte (decimal string) → absolute record base offset. */
  values: Record<string, number>;
  /** Optional record base used when the selector byte has no mapped value. */
  fallback?: number;
}

/** A byte-signature check confirming a save belongs to a given game. */
export interface SaveSignature {
  /** Byte offset of the signature within the save file. */
  offset: number;
  /** Expected bytes as a lowercase hex string, e.g. "4d4554". */
  hex: string;
}

/**
 * Describes a game's save-file layout so the viewer can read completion flags.
 * Interpreted by `core/SaveImport` together with each POI's `saveRef`.
 */
export interface SaveFormatDef {
  /** Save-format family the parser dispatches on, e.g. "nes-sram". */
  family: string;
  /** Accepted raw file size(s) in bytes; import rejects other sizes. */
  size?: number | number[];
  /** Fixed base of the save record when no selector is needed. */
  recordBase?: number;
  /** Optional selector for formats containing duplicated save records. */
  recordSelector?: SaveRecordSelector;
  /** Named bitfield regions; `saveRef.region` selects one (default "treasure"). */
  regions?: Record<string, SaveFlagRegion>;
  /** Optional native scene/block location stored in the save. */
  location?: SaveLocationDef;
  /** Bit order within each byte: "lsb" (bit 0 = 0x01) or "msb". Default "lsb". */
  bitOrder?: 'lsb' | 'msb';
  /** Optional signature bytes confirming the save belongs to this game. */
  signature?: SaveSignature[];
}

/** Byte offsets used to resolve a native map location from a save record. */
export interface SaveLocationDef {
  sceneStackIndexOffset: number;
  sceneStackOffset: number;
  sceneStackLength: number;
  subXOffset: number;
  subYOffset: number;
  blockXOffset: number;
  blockYOffset: number;
  /** Add the selected/fixed record base to every offset. */
  relativeTo?: 'record';
  blockWidth: number;
  blockHeight: number;
}

/** Native scene/block coverage used to map a save position to rendered pixels. */
export interface NativeGridDef {
  sceneId: number;
  blockRect: [number, number, number, number];
  /** Exact included blocks for irregular regions; rect containment is the fallback. */
  blocks?: Array<[number, number]>;
  blockSize: [number, number];
}

/** Which save-file flag proves this POI is done (chest opened, boss beaten…). */
export interface PoiSaveRef {
  /** Region name in `saveFormat.regions` (default "treasure"). */
  region?: string;
  /** Bit index within the region: byte = flag >> 3, bit = flag & 7. */
  flag: number;
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
  /** Canonical item references; viewer resolves display facts from data/items.json. */
  itemRefs?: PoiItemRefDef[];
  /** Canonical currency/money references; viewer resolves formatting from data/currencies.json. */
  currencyRefs?: CurrencyRefDef[];
  /** Stable species/entity id in data/species.json for standalone Pokémon/NPC encounters. */
  speciesId?: string;
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
  /** Stable trainer id in data/trainers.json. */
  trainerId?: string;
  /** Stable party id in data/parties.json. */
  partyId?: string;
  /** One or more game-wide service/shop ids attached to this map POI. */
  serviceIds?: string[];
  /** Which save-file flag proves this POI is done — read by the save importer. */
  saveRef?: PoiSaveRef;
  /** Stable row id in data/encounters.json fixedEncounters. */
  fixedEncounterId?: string;
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
  /** Producer-native coordinates used to resolve save-file player locations. */
  nativeGrid?: NativeGridDef;
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
  /** Non-spatial map jumps listed in the sidebar. */
  jumps?: MapJumpDef[];
  /** Points of interest (treasure chests, etc.) */
  pois?: PoiDef[];
  /** Event-driven tile changes (e.g. a wall opening), toggled by the viewer. */
  events?: EventDef[];
  /** Spatial bindings from map regions to the global encounter realm catalog. */
  encounters?: EncounterZoneDef[];
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
  /** Optional external catalogs (items, services/shops) loaded on demand. */
  data?: GameDataRefs;
  /** Optional save-file layout: enables importing a battery save into a profile. */
  saveFormat?: SaveFormatDef;
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
  hasJumps?: boolean;
  /** Shared building/dungeon key; grouped into one collapsible sidebar row. */
  floorGroup?: string;
  /** Floor label shown for members of a grouped sidebar row. */
  floor?: number;
}

/** Supported language codes */
export type LangCode = 'en' | 'zh' | 'ja';

/** Language option for UI display */
export interface LangOption {
  code: LangCode;
  label: string;
}
