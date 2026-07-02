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

describe('poi deep links', () => {
  it('parses &poi= with a view', () => {
    expect(parseHash('#g/m@-1.0,2.0,3.00&poi=world_map_c05')).toEqual({
      gameId: 'g',
      mapId: 'm',
      view: { center: [-1, 2], zoom: 3 },
      poi: 'world_map_c05',
    });
  });

  it('parses &poi= without a view', () => {
    expect(parseHash('#g/m&poi=x%2F1')).toMatchObject({ mapId: 'm', poi: 'x/1' });
  });

  it('formats and round-trips a poi anchor', () => {
    const hash = formatHash('g', 'm', { center: [-1, 2], zoom: 3 }, 'c 1');
    expect(hash).toBe('#g/m@-1.0,2.0,3.00&poi=c%201');
    expect(parseHash(hash)).toMatchObject({ poi: 'c 1' });
  });

  it('omits the poi part when not given', () => {
    expect(formatHash('g', 'm', { center: [0, 0], zoom: 0 })).not.toContain('&poi=');
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
