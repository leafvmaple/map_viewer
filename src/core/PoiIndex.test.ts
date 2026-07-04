import { describe, it, expect } from 'vitest';
import { buildPoiIndex, searchPois, isMarkable, CHEST_KINDS, MARKABLE_KINDS } from './PoiIndex.js';
import type { GameConfig, PoiDef } from '../types';

const poi = (id: string, label?: Record<string, string>, item?: string, kind = 'treasure'): PoiDef => ({
  id,
  kind,
  pos: [0, 0],
  label,
  item,
});

const config: GameConfig = {
  id: 'g',
  name: { en: 'G' },
  defaultMap: 'world',
  maps: {
    world: {
      name: { en: 'World' },
      type: 'image',
      image: 'w.png',
      triggers: [],
      pois: [poi('w_c00', { zh: '宝箱 · 长枪', en: 'Chest · Spear' }), poi('w_c01', undefined, '0x1C')],
    },
    town: {
      name: { en: 'Town' },
      type: 'image',
      image: 't.png',
      triggers: [],
      pois: [poi('t_c00', { zh: '宝箱 · 闪电' }, undefined, 'gold')],
    },
    empty: { name: { en: 'E' }, type: 'image', image: 'e.png', triggers: [] },
  },
};

describe('buildPoiIndex', () => {
  it('flattens all maps in order', () => {
    const index = buildPoiIndex(config);
    expect(index.map(e => e.poi.id)).toEqual(['w_c00', 'w_c01', 't_c00']);
    expect(index[2].mapId).toBe('town');
  });
});

describe('searchPois', () => {
  const index = buildPoiIndex(config);

  it('matches any label language, case-insensitively', () => {
    expect(searchPois(index, '长枪').map(e => e.poi.id)).toEqual(['w_c00']);
    expect(searchPois(index, 'SPEAR').map(e => e.poi.id)).toEqual(['w_c00']);
    expect(searchPois(index, '闪电').map(e => e.poi.id)).toEqual(['t_c00']);
  });

  it('matches the raw item id as a fallback', () => {
    expect(searchPois(index, '0x1c').map(e => e.poi.id)).toEqual(['w_c01']);
  });

  it('matches party member names (find the trainer that carries a mon)', () => {
    const cfg: GameConfig = {
      ...config,
      maps: {
        world: {
          ...config.maps.world,
          pois: [
            { ...poi('w_t00', { zh: '训练师 カズ' }, undefined, 'trainer'),
              party: [{ name: { zh: '火爆猴', ja: 'オコリザル' }, value: 39 }] },
            poi('w_c00', { zh: '宝箱 · 长枪' }),
          ],
        },
      },
    };
    const idx = buildPoiIndex(cfg);
    expect(searchPois(idx, '火爆猴').map(e => e.poi.id)).toEqual(['w_t00']);
    expect(searchPois(idx, 'オコリザル').map(e => e.poi.id)).toEqual(['w_t00']);
    expect(searchPois(idx, '皮卡丘')).toEqual([]);
  });

  it('returns nothing for an empty query and respects the limit', () => {
    expect(searchPois(index, '  ')).toEqual([]);
    expect(searchPois(index, '宝箱', 1)).toHaveLength(1);
  });
});

describe('kind sets', () => {
  it('chests are markable; markable also covers trainers', () => {
    for (const kind of CHEST_KINDS) expect(MARKABLE_KINDS.has(kind)).toBe(true);
    expect(MARKABLE_KINDS.has('trainer')).toBe(true);
    expect(MARKABLE_KINDS.has('sign')).toBe(false);
  });

  it('any POI with a battle party is markable, regardless of kind', () => {
    const general = { ...poi('g00', { zh: '敌将' }, undefined, 'general'), party: [{ name: { zh: '张飞' }, value: 12000 }] };
    expect(isMarkable(general)).toBe(true);
    expect(isMarkable(poi('s00', undefined, undefined, 'sign'))).toBe(false);
    expect(isMarkable(poi('t00', undefined, undefined, 'trainer'))).toBe(true);
  });
});
