import { describe, it, expect, beforeAll } from 'vitest';
import { buildPoiIndex, searchPois, isMarkable, poiItemName, CHEST_KINDS, MARKABLE_KINDS } from './PoiIndex.js';
import { i18n } from '../i18n/index.js';
import type { GameConfig, GameDataCatalogs, PoiDef } from '../types';

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

beforeAll(() => {
  i18n.lang = 'en';
});

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

  it('matches contained items in a multi-item POI', () => {
    const cfg: GameConfig = {
      ...config,
      maps: {
        world: {
          ...config.maps.world,
          pois: [{
            ...poi('w_c_multi', { en: 'Chest' }),
            items: [
              { name: { en: 'Wind Helm', ja: 'かぜのかぶと' }, item: '48', itemIcon: 'emoji:🪖' },
              { name: { en: 'Thunder Shield', ja: 'らいじんのたて' }, item: '4B', itemIcon: 'emoji:🛡️' },
            ],
          }],
        },
      },
    };
    const idx = buildPoiIndex(cfg);
    expect(searchPois(idx, 'thunder').map(e => e.poi.id)).toEqual(['w_c_multi']);
    expect(searchPois(idx, '4b').map(e => e.poi.id)).toEqual(['w_c_multi']);
    expect(poiItemName(idx[0].poi)).toBe('Wind Helm / Thunder Shield');
  });

  it('resolves canonical itemRefs through the item catalog', () => {
    const cfg: GameConfig = {
      ...config,
      maps: {
        world: {
          ...config.maps.world,
          pois: [{ ...poi('w_c_ref'), itemRefs: [{ itemId: '48' }, { itemId: '4B', quantity: 2 }] }],
        },
      },
    };
    const catalogs: GameDataCatalogs = {
      items: {
        '48': { id: '48', name: { en: 'Wind Helm' }, itemIcon: 'emoji:🪖' },
        '4B': { id: '4B', name: { en: 'Thunder Shield' }, itemIcon: 'emoji:🛡️' },
      },
      services: {},
      species: {},
      parties: {},
      trainers: {},
      currencies: {},
    };
    const idx = buildPoiIndex(cfg, catalogs);
    expect(searchPois(idx, 'thunder').map(e => e.poi.id)).toEqual(['w_c_ref']);
    expect(searchPois(idx, '4b').map(e => e.poi.id)).toEqual(['w_c_ref']);
    expect(poiItemName(idx[0].poi, idx[0].items)).toBe('Wind Helm / Thunder Shield ×2');
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

  it('resolves trainer party refs through trainer/party/species catalogs', () => {
    const cfg: GameConfig = {
      ...config,
      maps: {
        world: {
          ...config.maps.world,
          pois: [{ id: 'w_t_ref', kind: 'boss', pos: [0, 0], trainerId: '42' }],
        },
      },
    };
    const catalogs: GameDataCatalogs = {
      items: {},
      services: {},
      species: {
        '57': { id: '57', name: { zh: '火爆猴', ja: 'オコリザル' }, icon: 'sprites/mon/057.png' },
      },
      parties: {
        'trainer:42': { id: 'trainer:42', members: [{ speciesId: '57', value: 39 }] },
      },
      trainers: {
        '42': { id: '42', label: { zh: '训练师 カズ' }, partyId: 'trainer:42' },
      },
      currencies: {},
    };
    const idx = buildPoiIndex(cfg, catalogs);
    expect(searchPois(idx, '火爆猴').map(e => e.poi.id)).toEqual(['w_t_ref']);
    expect(searchPois(idx, 'オコリザル').map(e => e.poi.id)).toEqual(['w_t_ref']);
    expect(searchPois(idx, 'trainer:42').map(e => e.poi.id)).toEqual(['w_t_ref']);
    expect(poiItemName(idx[0].poi, idx[0].catalogs)).toBe('训练师 カズ');
    expect(isMarkable(idx[0].poi)).toBe(true);
  });

  it('resolves and searches currency reward refs', () => {
    const cfg: GameConfig = {
      ...config,
      maps: {
        world: {
          ...config.maps.world,
          pois: [{ id: 'w_g00', kind: 'gold', pos: [0, 0], currencyRefs: [{ currencyId: 'coin', amount: 100 }] }],
        },
      },
    };
    const catalogs: GameDataCatalogs = {
      items: {},
      services: {},
      species: {},
      parties: {},
      trainers: {},
      currencies: {
        coin: { id: 'coin', name: { zh: '金币', en: 'Coin' }, symbol: { zh: '金币', en: 'Coins' }, icon: 'emoji:💰' },
      },
    };
    const idx = buildPoiIndex(cfg, catalogs);
    expect(poiItemName(idx[0].poi, idx[0].catalogs)).toBe('100 Coins');
    expect(searchPois(idx, '100').map(e => e.poi.id)).toEqual(['w_g00']);
    expect(searchPois(idx, '金币').map(e => e.poi.id)).toEqual(['w_g00']);
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
    expect(isMarkable({ ...poi('g01', { zh: '敌将' }, undefined, 'general'), partyId: 'p1' })).toBe(true);
    expect(isMarkable(poi('s00', undefined, undefined, 'sign'))).toBe(false);
    expect(isMarkable(poi('t00', undefined, undefined, 'trainer'))).toBe(true);
  });
});
