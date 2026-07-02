import { describe, it, expect } from 'vitest';
import { parseHash, formatHash } from './hashRoute.js';

describe('parseHash', () => {
  it('parses game/map with a view', () => {
    expect(parseHash('#metal_max/world_map@-2048.5,2048.0,1.25')).toEqual({
      gameId: 'metal_max',
      mapId: 'world_map',
      view: { center: [-2048.5, 2048.0], zoom: 1.25 },
    });
  });

  it('parses game/map without a view', () => {
    expect(parseHash('#tenchi2/map_03')).toEqual({
      gameId: 'tenchi2',
      mapId: 'map_03',
      view: undefined,
    });
  });

  it('decodes URI-encoded ids', () => {
    expect(parseHash('#my%20game/town%2F1')).toMatchObject({
      gameId: 'my game',
      mapId: 'town/1',
    });
  });

  it('returns null for empty or malformed hashes', () => {
    expect(parseHash('')).toBeNull();
    expect(parseHash('#')).toBeNull();
    expect(parseHash('#no-slash')).toBeNull();
    expect(parseHash('#g/m@1,2')).toBeNull(); // incomplete view triple
    expect(parseHash('#g/m@x,y,z')).toBeNull(); // non-numeric view
  });
});

describe('formatHash', () => {
  it('formats and round-trips through parseHash', () => {
    const hash = formatHash('metal_max', 'world_map', { center: [-2048.51, 2048.04], zoom: 1.257 });
    expect(hash).toBe('#metal_max/world_map@-2048.5,2048.0,1.26');
    expect(parseHash(hash)).toMatchObject({ gameId: 'metal_max', mapId: 'world_map' });
  });

  it('URI-encodes ids', () => {
    const hash = formatHash('my game', 'town/1', { center: [0, 0], zoom: 0 });
    expect(hash.startsWith('#my%20game/town%2F1@')).toBe(true);
    expect(parseHash(hash)).toMatchObject({ gameId: 'my game', mapId: 'town/1' });
  });
});
