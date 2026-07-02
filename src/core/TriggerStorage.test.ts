import { describe, it, expect, beforeEach } from 'vitest';
import { TriggerStorage } from './TriggerStorage.js';
import type { TriggerDef } from '../types';

const trigger = (id: string): TriggerDef => ({
  id,
  bounds: [[0, 0], [16, 16]],
  target: 'somewhere',
  label: { en: id },
});

describe('TriggerStorage (global, NOT per-user)', () => {
  beforeEach(() => localStorage.clear());

  it('save/load round-trip per map', () => {
    TriggerStorage.save('g', 'm1', [trigger('a')]);
    expect(TriggerStorage.load('g', 'm1')).toHaveLength(1);
    expect(TriggerStorage.load('g', 'm2')).toBeNull();
    expect(TriggerStorage.has('g', 'm1')).toBe(true);
  });

  it('loadGame collects overrides for all maps of one game', () => {
    TriggerStorage.save('g', 'm1', [trigger('a')]);
    TriggerStorage.save('g', 'm2', [trigger('b'), trigger('c')]);
    TriggerStorage.save('other', 'm1', [trigger('x')]);

    const all = TriggerStorage.loadGame('g');
    expect(Object.keys(all).sort()).toEqual(['m1', 'm2']);
    expect(all.m2).toHaveLength(2);
  });

  it('remove and clearGame', () => {
    TriggerStorage.save('g', 'm1', [trigger('a')]);
    TriggerStorage.save('g', 'm2', [trigger('b')]);
    TriggerStorage.remove('g', 'm1');
    expect(TriggerStorage.load('g', 'm1')).toBeNull();
    TriggerStorage.clearGame('g');
    expect(TriggerStorage.loadGame('g')).toEqual({});
  });
});
