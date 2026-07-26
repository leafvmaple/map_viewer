import { describe, it, expect } from 'vitest';
import { interpretSave } from './SaveImport.js';
import type { GameConfig, PoiDef, SaveFormatDef } from '../types.js';

function game(saveFormat: SaveFormatDef | undefined, pois: PoiDef[]): GameConfig {
  return {
    id: 'g',
    name: { en: 'G' },
    defaultMap: 'm',
    maps: { m: { name: { en: 'M' }, type: 'image', image: 'm.png', triggers: [], pois } },
    saveFormat,
  };
}

function chest(id: string, flag: number, region?: string): PoiDef {
  return { id, kind: 'treasure', pos: [0, 0], saveRef: region ? { flag, region } : { flag } };
}

/** A save of `size` bytes with specific byte values patched in. */
function save(size: number, patch: Record<number, number>): Uint8Array {
  const b = new Uint8Array(size);
  for (const [off, val] of Object.entries(patch)) b[Number(off)] = val;
  return b;
}

const FMT: SaveFormatDef = {
  family: 'nes-sram',
  size: 8192,
  regions: { treasure: { offset: 4, length: 2 } },
};

describe('interpretSave', () => {
  it('maps set bits (lsb) to marked poi ids and counts trackable POIs', () => {
    const g = game(FMT, [chest('a', 0), chest('b', 1), chest('c', 3), chest('d', 8), chest('e', 9)]);
    // byte4 = bits 0,3 set → flags 0,3 ; byte5 = bit0 set → flag 8
    const r = interpretSave(g, save(8192, { 4: 0b0000_1001, 5: 0b0000_0001 }));
    expect(r.ok).toBe(true);
    expect(r.trackable).toBe(5);
    expect(new Set(r.markedIds)).toEqual(new Set(['a', 'c', 'd']));
  });

  it('ignores POIs without a saveRef (not marked, not counted)', () => {
    const plain: PoiDef = { id: 'x', kind: 'sign', pos: [0, 0] };
    const r = interpretSave(game(FMT, [chest('a', 0), plain]), save(8192, { 4: 0b0000_0001 }));
    expect(r.trackable).toBe(1);
    expect(r.markedIds).toEqual(['a']);
  });

  it('reports unsupported when the game has no saveFormat', () => {
    const r = interpretSave(game(undefined, [chest('a', 0)]), new Uint8Array(8192));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('save.error.unsupported');
  });

  it('rejects a wrong-sized file', () => {
    const r = interpretSave(game(FMT, [chest('a', 0)]), new Uint8Array(4096));
    expect(r.reason).toBe('save.error.size');
  });

  it('accepts any of several allowed sizes', () => {
    const fmt = { ...FMT, size: [8192, 32768] };
    const r = interpretSave(game(fmt, [chest('a', 0)]), save(32768, { 4: 1 }));
    expect(r.ok).toBe(true);
    expect(r.markedIds).toEqual(['a']);
  });

  it('enforces a byte signature', () => {
    const fmt: SaveFormatDef = { ...FMT, signature: [{ offset: 0, hex: '4d4d' }] };
    const ok = interpretSave(game(fmt, [chest('a', 0)]), save(8192, { 0: 0x4d, 1: 0x4d, 4: 1 }));
    expect(ok.ok).toBe(true);
    expect(ok.markedIds).toEqual(['a']);

    const bad = interpretSave(game(fmt, [chest('a', 0)]), save(8192, { 0: 0x00, 1: 0x4d, 4: 1 }));
    expect(bad.reason).toBe('save.error.signature');
  });

  it('respects msb bit order', () => {
    const fmt: SaveFormatDef = { ...FMT, bitOrder: 'msb' };
    // 0x81 = 1000_0001 → msb bit0 (0x80) → flag 0 ; msb bit7 (0x01) → flag 7
    const r = interpretSave(game(fmt, [chest('a', 0), chest('b', 7), chest('c', 3)]), save(8192, { 4: 0x81 }));
    expect(new Set(r.markedIds)).toEqual(new Set(['a', 'b']));
  });

  it('resolves POIs against named regions', () => {
    const fmt: SaveFormatDef = {
      family: 'nes-sram',
      size: 8192,
      regions: { treasure: { offset: 4, length: 1 }, events: { offset: 10, length: 1 } },
    };
    const eventPoi: PoiDef = { id: 'e', kind: 'event', pos: [0, 0], saveRef: { region: 'events', flag: 2 } };
    const r = interpretSave(game(fmt, [chest('t', 0), eventPoi]), save(8192, { 4: 0b0000_0001, 10: 0b0000_0100 }));
    expect(new Set(r.markedIds)).toEqual(new Set(['t', 'e']));
  });

  it('resolves record-relative regions from the active-record selector', () => {
    const fmt: SaveFormatDef = {
      family: 'nes-sram',
      size: 32,
      recordSelector: { offset: 2, values: { '1': 8, '2': 16 } },
      regions: { treasure: { offset: 3, length: 1, relativeTo: 'record' } },
    };
    const g = game(fmt, [chest('file1', 0), chest('file2', 1)]);

    const first = interpretSave(g, save(32, { 2: 1, 11: 0b0000_0001, 19: 0b0000_0010 }));
    expect(first.markedIds).toEqual(['file1']);

    const second = interpretSave(g, save(32, { 2: 2, 11: 0b0000_0001, 19: 0b0000_0010 }));
    expect(second.markedIds).toEqual(['file2']);
  });

  it('rejects an unknown record selector unless a fallback is declared', () => {
    const base: SaveFormatDef = {
      family: 'nes-sram',
      size: 32,
      recordSelector: { offset: 2, values: { '1': 8 } },
      regions: { treasure: { offset: 3, length: 1, relativeTo: 'record' } },
    };
    expect(interpretSave(game(base, [chest('a', 0)]), save(32, { 2: 7 })).reason).toBe('save.error.parse');

    const fallback: SaveFormatDef = {
      ...base,
      recordSelector: { ...base.recordSelector!, fallback: 16 },
    };
    expect(interpretSave(game(fallback, [chest('a', 0)]), save(32, { 2: 7, 19: 1 })).markedIds).toEqual(['a']);
  });

  it('rejects a record-relative region without a record selector', () => {
    const fmt: SaveFormatDef = {
      family: 'nes-sram', size: 8,
      regions: { treasure: { offset: 1, length: 1, relativeTo: 'record' } },
    };
    expect(interpretSave(game(fmt, [chest('a', 0)]), save(8, { 1: 1 })).reason).toBe('save.error.parse');
  });

  it('rejects a selector or selected region outside the file', () => {
    const selectorPastEnd: SaveFormatDef = {
      family: 'nes-sram', size: 8,
      recordSelector: { offset: 8, values: { '1': 0 } },
      regions: { treasure: { offset: 0, length: 1 } },
    };
    expect(interpretSave(game(selectorPastEnd, [chest('a', 0)]), new Uint8Array(8)).reason).toBe('save.error.truncated');

    const recordPastEnd: SaveFormatDef = {
      family: 'nes-sram', size: 8,
      recordSelector: { offset: 0, values: { '1': 7 } },
      regions: { treasure: { offset: 1, length: 1, relativeTo: 'record' } },
    };
    expect(interpretSave(game(recordPastEnd, [chest('a', 0)]), save(8, { 0: 1 })).reason).toBe('save.error.truncated');
  });

  it('fails when a declared region runs past the end of the file', () => {
    const fmt: SaveFormatDef = { family: 'nes-sram', size: 8, regions: { treasure: { offset: 4, length: 10 } } };
    const r = interpretSave(game(fmt, [chest('a', 0)]), new Uint8Array(8));
    expect(r.reason).toBe('save.error.truncated');
  });

  it('leaves ids unmarked when their flag byte is out of the region', () => {
    // region is 1 byte (flags 0-7); flag 20 addresses byte 2 → out of range, not a crash
    const fmt: SaveFormatDef = { family: 'nes-sram', size: 8192, regions: { treasure: { offset: 4, length: 1 } } };
    const r = interpretSave(game(fmt, [chest('a', 0), chest('far', 20)]), save(8192, { 4: 0xff }));
    expect(r.markedIds).toEqual(['a']);
    expect(r.trackable).toBe(2);
  });

  it('resolves a location-only save contract to native map pixels', () => {
    const fmt: SaveFormatDef = {
      family: 'nes-sram',
      size: [8192, 32768],
      recordBase: 0x1000,
      location: {
        sceneStackIndexOffset: 0x12,
        sceneStackOffset: 0x14,
        sceneStackLength: 4,
        subYOffset: 0x18,
        blockYOffset: 0x19,
        subXOffset: 0x1a,
        blockXOffset: 0x1b,
        relativeTo: 'record',
        blockWidth: 16,
        blockHeight: 15,
      },
    };
    const g: GameConfig = {
      id: 'tenchi2', name: { en: 'Tenchi II' }, defaultMap: 'm', saveFormat: fmt,
      maps: {
        m: {
          name: { en: 'Scene 07' }, type: 'image', image: 'm.png', tileSize: 16, triggers: [],
          nativeGrid: {
            sceneId: 7,
            blockRect: [0, 25, 6, 29],
            blocks: [[5, 25]],
            blockSize: [16, 15],
          },
          collision: {
            encoding: 'ascii-grid-v1',
            semantics: 'on-foot-destination',
            rows: Array.from({ length: 75 }, (_, y) =>
              y === 11 ? `${'.'.repeat(86)}#${'.'.repeat(25)}` : '.'.repeat(112)),
          },
        },
      },
    };
    const r = interpretSave(g, save(32768, {
      [0x1012]: 2,
      [0x1016]: 7,
      [0x1018]: 11,
      [0x1019]: 25,
      [0x101a]: 6,
      [0x101b]: 5,
    }));
    expect(r.ok).toBe(true);
    expect(r.trackable).toBe(0);
    expect(r.location).toEqual({
      sceneId: 7,
      blockX: 5,
      blockY: 25,
      subX: 6,
      subY: 11,
      globalCellX: 86,
      globalCellY: 386,
      mapId: 'm',
      focus: [1384, 184],
      walkable: false,
    });
  });
});
