import { describe, expect, it } from 'vitest';
import { buildServiceIndex, searchServices } from './ServiceIndex.js';
import type { GameConfig, GameDataCatalogs } from '../types';

describe('ServiceIndex', () => {
  const config: GameConfig = {
    id: 'demo',
    name: { en: 'Demo' },
    defaultMap: 'world',
    maps: {
      world: {
        name: { en: 'World' },
        type: 'image',
        image: 'world.png',
        triggers: [],
        pois: [
          { id: 'shop_poi', kind: 'shop', pos: [0, 0], serviceIds: ['shop_01'] },
        ],
      },
    },
  };

  const catalogs: GameDataCatalogs = {
    items: {
      '2B': { id: '2B', name: { en: 'Bowgun' }, price: 230, currency: 'G', itemIcon: 'emoji:⚔️' },
    },
    services: {
      shop_01: {
        id: 'shop_01',
        kind: 'shop',
        name: { en: 'Weapon Shop' },
        entries: [
          { type: 'item', itemId: '2B' },
        ],
      },
    },
    species: {},
    parties: {},
    trainers: {},
    currencies: {},
  };

  it('binds service ids from POIs', () => {
    const index = buildServiceIndex(config, catalogs);
    expect(index).toHaveLength(1);
    expect(index[0].bindings).toEqual([{ mapId: 'world', poi: config.maps.world.pois![0] }]);
    expect(index[0].items['2B'].name.en).toBe('Bowgun');
  });

  it('searches service entries by item name', () => {
    const index = buildServiceIndex(config, catalogs);
    const results = searchServices(index, 'bow');
    expect(results).toHaveLength(1);
    expect(results[0].entry.serviceId).toBe('shop_01');
    expect(results[0].matchedEntry?.itemId).toBe('2B');
  });
});
