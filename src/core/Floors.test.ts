import { describe, it, expect } from 'vitest';
import { floorLabel, floorSiblings } from './Floors.js';
import type { GameConfig, MapConfig } from '../types';

const map = (floorGroup?: string, floor?: number): MapConfig => ({
  name: { en: 'M' },
  type: 'image',
  image: 'm.png',
  triggers: [],
  floorGroup,
  floor,
});

const config: GameConfig = {
  id: 'g',
  name: { en: 'G' },
  defaultMap: 'world',
  maps: {
    world: map(),
    pc1: map('b_pc', 1),
    pc2: map('b_pc', 2),
    cave_b1: map('d_cave', -1),
    cave_1: map('d_cave', 1),
    cave_b2: map('d_cave', -2),
    lonely: map('b_solo', 1), // group with a single member → no switcher
  },
};

describe('floorLabel', () => {
  it('formats floors like the game does', () => {
    expect(floorLabel(3)).toBe('3F');
    expect(floorLabel(1)).toBe('1F');
    expect(floorLabel(-1)).toBe('B1F');
    expect(floorLabel(-2)).toBe('B2F');
    expect(floorLabel(undefined)).toBe('1F');
    expect(floorLabel(0)).toBe('1F');
  });
});

describe('floorSiblings', () => {
  it('returns the group top-floor-first, including the current map', () => {
    expect(floorSiblings(config, 'pc1').map(e => e.mapId)).toEqual(['pc2', 'pc1']);
    expect(floorSiblings(config, 'cave_b2').map(e => e.mapId)).toEqual(['cave_1', 'cave_b1', 'cave_b2']);
  });

  it('empty for ungrouped maps, single-member groups and unknown ids', () => {
    expect(floorSiblings(config, 'world')).toEqual([]);
    expect(floorSiblings(config, 'lonely')).toEqual([]);
    expect(floorSiblings(config, 'nope')).toEqual([]);
  });
});
