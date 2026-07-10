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
}

interface AdapterOutput {
  ok: boolean;
  reason?: string;
  /** region name → its bytes */
  regions?: Record<string, Uint8Array>;
}

type SaveAdapter = (bytes: Uint8Array, fmt: SaveFormatDef) => AdapterOutput;

// ─── Adapters ───────────────────────────────────────────────

/** Slice each declared region straight out of the file (flat address space). */
function sliceRegions(bytes: Uint8Array, fmt: SaveFormatDef): AdapterOutput {
  const regions: Record<string, Uint8Array> = {};
  for (const [name, r] of Object.entries(fmt.regions)) {
    if (r.offset < 0 || r.length < 0 || r.offset + r.length > bytes.length) {
      return { ok: false, reason: 'save.error.truncated' };
    }
    regions[name] = bytes.subarray(r.offset, r.offset + r.length);
  }
  return { ok: true, regions };
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
  return { ok: false, reason, markedIds: [], trackable: 0 };
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
  let trackable = 0;
  for (const map of Object.values(game.maps)) {
    for (const poi of map.pois ?? []) {
      const ref = poi.saveRef;
      if (!ref) continue;
      trackable++;
      const region = out.regions[ref.region ?? DEFAULT_REGION];
      if (region && bitSet(region, ref.flag, bitOrder)) markedIds.push(poi.id);
    }
  }
  return { ok: true, markedIds, trackable };
}
