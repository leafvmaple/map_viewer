import type { GameConfig, SaveFormatDef, SaveSignature } from '../types.js';

// ============================================================
// SaveImport - read a battery save file and derive the set of "done" POIs.
//
// Two layers, kept deliberately separate:
//   1. A per-format ADAPTER turns raw save bytes into normalized bitfield
//      regions (a flat NES SRAM is a plain slice; a GBA save must first locate
//      the active slot). Adapters dispatch on `saveFormat.family`.
//   2. A game-agnostic MAPPER walks every POI carrying a `saveRef` and checks
//      its bit in the named region — producing the marked-id set.
//
// This mirrors the rest of the contract: the producer (nes_decoder) ships the
// layout (`saveFormat`) and per-POI flags (`saveRef`); the viewer stays generic.
// ============================================================

/** Default region name a `saveRef` maps to when it omits `region`. */
export const DEFAULT_REGION = 'treasure';

export interface SaveImportResult {
  /** False when the save could not be read (see `reason`). */
  ok: boolean;
  /** i18n key describing the failure, set only when `ok` is false. */
  reason?: string;
  /** POI ids whose completion flag is set in the save. */
  markedIds: string[];
  /** Number of POIs carrying a `saveRef` — the import denominator ("42/91"). */
  trackable: number;
  /** Terrain event ids whose direct saved-state byte activates their overlay. */
  activeEventIds: string[];
  /** Number of terrain events carrying a `saveStateRef`. */
  trackableEvents: number;
  /** Native save position, optionally resolved to a rendered map and pixel focus. */
  location?: SaveLocationResult;
}

export interface SaveLocationResult {
  sceneId: number;
  blockX: number;
  blockY: number;
  subX: number;
  subY: number;
  globalCellX: number;
  globalCellY: number;
  mapId?: string;
  focus?: [number, number];
  /** Static on-foot destination result at this cell, when exported by the producer. */
  walkable?: boolean;
}

interface AdapterOutput {
  ok: boolean;
  reason?: string;
  /** region name → its bytes */
  regions?: Record<string, Uint8Array>;
  recordBase?: number;
}

type SaveAdapter = (bytes: Uint8Array, fmt: SaveFormatDef) => AdapterOutput;

// ─── Adapters ───────────────────────────────────────────────

/** Slice each declared region straight out of the file (flat address space). */
function sliceRegions(bytes: Uint8Array, fmt: SaveFormatDef): AdapterOutput {
  let recordBase = fmt.recordBase ?? 0;
  if (fmt.recordSelector) {
    const selector = fmt.recordSelector;
    if (selector.offset < 0 || selector.offset >= bytes.length) {
      return { ok: false, reason: 'save.error.truncated' };
    }
    const selected = selector.values[String(bytes[selector.offset])] ?? selector.fallback;
    if (selected == null || selected < 0) {
      return { ok: false, reason: 'save.error.parse' };
    }
    recordBase = selected;
  }

  const regions: Record<string, Uint8Array> = {};
  for (const [name, r] of Object.entries(fmt.regions ?? {})) {
    if (r.relativeTo === 'record' && !fmt.recordSelector && fmt.recordBase == null) {
      return { ok: false, reason: 'save.error.parse' };
    }
    const offset = r.offset + (r.relativeTo === 'record' ? recordBase : 0);
    if (r.offset < 0 || r.length < 0 || offset + r.length > bytes.length) {
      return { ok: false, reason: 'save.error.truncated' };
    }
    regions[name] = bytes.subarray(offset, offset + r.length);
  }
  return { ok: true, regions, recordBase };
}

/** NES battery SRAM: a flat byte image, so regions are plain slices. */
const nesSramAdapter: SaveAdapter = (bytes, fmt) => sliceRegions(bytes, fmt);

const ADAPTERS: Record<string, SaveAdapter> = {
  'nes-sram': nesSramAdapter,
};

// ─── Helpers ────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length === 0 || clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function matchSignature(bytes: Uint8Array, sig: SaveSignature): boolean {
  const want = hexToBytes(sig.hex);
  if (!want || sig.offset < 0 || sig.offset + want.length > bytes.length) return false;
  for (let i = 0; i < want.length; i++) {
    if (bytes[sig.offset + i] !== want[i]) return false;
  }
  return true;
}

/** Is bit `flag` set in `region`, respecting bit order? Out-of-range → false. */
function bitSet(region: Uint8Array, flag: number, order: 'lsb' | 'msb'): boolean {
  if (flag < 0) return false;
  const byte = flag >> 3;
  if (byte >= region.length) return false;
  const bit = flag & 7;
  const mask = order === 'msb' ? 0x80 >> bit : 1 << bit;
  return (region[byte] & mask) !== 0;
}

function fail(reason: string): SaveImportResult {
  return {
    ok: false, reason, markedIds: [], trackable: 0,
    activeEventIds: [], trackableEvents: 0,
  };
}

function resolveLocation(
  game: GameConfig,
  bytes: Uint8Array,
  fmt: SaveFormatDef,
  recordBase: number,
): SaveLocationResult | null {
  const def = fmt.location;
  if (!def) return null;
  const base = def.relativeTo === 'record' ? recordBase : 0;
  const offsets = [
    def.sceneStackIndexOffset,
    def.sceneStackOffset + def.sceneStackLength - 1,
    def.subXOffset, def.subYOffset, def.blockXOffset, def.blockYOffset,
  ].map(offset => base + offset);
  if (def.sceneStackLength <= 0 || offsets.some(offset => offset < 0 || offset >= bytes.length)) return null;

  const stackIndex = bytes[base + def.sceneStackIndexOffset]!;
  if (stackIndex >= def.sceneStackLength) return null;
  const sceneId = bytes[base + def.sceneStackOffset + stackIndex]!;
  const blockX = bytes[base + def.blockXOffset]!;
  const blockY = bytes[base + def.blockYOffset]!;
  const subX = bytes[base + def.subXOffset]!;
  const subY = bytes[base + def.subYOffset]!;
  const location: SaveLocationResult = {
    sceneId, blockX, blockY, subX, subY,
    globalCellX: blockX * def.blockWidth + subX,
    globalCellY: blockY * def.blockHeight + subY,
  };

  const candidates = Object.entries(game.maps).filter(([, map]) => {
    const native = map.nativeGrid;
    if (!native || native.sceneId !== sceneId) return false;
    if (native.blocks?.length) return native.blocks.some(([x, y]) => x === blockX && y === blockY);
    const [x0, y0, x1, y1] = native.blockRect;
    return blockX >= x0 && blockX <= x1 && blockY >= y0 && blockY <= y1;
  });
  if (!candidates.length) return location;
  const [mapId, map] = candidates.sort(([, a], [, b]) => {
    const ar = a.nativeGrid!.blockRect;
    const br = b.nativeGrid!.blockRect;
    return (ar[2] - ar[0] + 1) * (ar[3] - ar[1] + 1) -
      (br[2] - br[0] + 1) * (br[3] - br[1] + 1);
  })[0]!;
  const native = map.nativeGrid!;
  const [x0, y0] = native.blockRect;
  const tileSize = map.tileSize ?? 16;
  location.mapId = mapId;
  const localCellX = (blockX - x0) * native.blockSize[0] + subX;
  const localCellY = (blockY - y0) * native.blockSize[1] + subY;
  location.focus = [
    localCellX * tileSize + tileSize / 2,
    localCellY * tileSize + tileSize / 2,
  ];
  const collisionCell = map.collision?.rows[localCellY]?.[localCellX];
  if (collisionCell === '.') location.walkable = true;
  if (collisionCell === '#') location.walkable = false;
  return location;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Read `bytes` as a save for `game` and return the POIs it marks as done.
 * Pure and DOM-free: validation, parsing and mapping only. The caller decides
 * what to do with the result (confirm, create a profile, write marks).
 */
export function interpretSave(game: GameConfig, bytes: Uint8Array): SaveImportResult {
  const fmt = game.saveFormat;
  if (!fmt) return fail('save.error.unsupported');

  // Size gate — cheap guard against wrong-game / wrong-format files.
  if (fmt.size != null) {
    const sizes = Array.isArray(fmt.size) ? fmt.size : [fmt.size];
    if (!sizes.includes(bytes.length)) return fail('save.error.size');
  }

  // Signature gate — confirm the save actually belongs to this game.
  for (const sig of fmt.signature ?? []) {
    if (!matchSignature(bytes, sig)) return fail('save.error.signature');
  }

  const adapter = ADAPTERS[fmt.family];
  if (!adapter) return fail('save.error.unsupported');

  const out = adapter(bytes, fmt);
  if (!out.ok || !out.regions) return fail(out.reason ?? 'save.error.parse');

  const bitOrder = fmt.bitOrder ?? 'lsb';
  const markedIds: string[] = [];
  const activeEventIds = new Set<string>();
  let trackable = 0;
  let trackableEvents = 0;
  for (const map of Object.values(game.maps)) {
    for (const poi of map.pois ?? []) {
      const ref = poi.saveRef;
      if (!ref) continue;
      trackable++;
      const region = out.regions[ref.region ?? DEFAULT_REGION];
      if (region && bitSet(region, ref.flag, bitOrder)) markedIds.push(poi.id);
    }
    for (const event of map.events ?? []) {
      const ref = event.saveStateRef;
      if (!ref) continue;
      trackableEvents++;
      const value = out.regions[ref.region]?.[ref.offset];
      if (value == null) continue;
      const active = ref.test === 'nonzero' ? value !== 0 : value === 0;
      if (active) activeEventIds.add(event.id);
    }
  }
  const location = resolveLocation(game, bytes, fmt, out.recordBase ?? 0);
  return {
    ok: true, markedIds, trackable,
    activeEventIds: [...activeEventIds], trackableEvents,
    ...(location ? { location } : {}),
  };
}
