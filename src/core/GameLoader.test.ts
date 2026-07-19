import { describe, expect, it, vi } from 'vitest';
import { GameLoader } from './GameLoader.js';
import type { GameConfig } from '../types';


describe('GameLoader spatial validation', () => {
  it('warns when exported triggers, focus points, POIs or events are outside map bounds', () => {
    const config: GameConfig = {
      id: 'g',
      name: { en: 'G' },
      defaultMap: 'a',
      maps: {
        a: {
          name: { en: 'A' },
          type: 'image',
          image: 'a.png',
          width: 100,
          height: 80,
          triggers: [{
            id: 'exit',
            bounds: [[96, 64], [112, 80]],
            target: 'b',
            label: { en: 'Exit' },
            focus: [150, 10],
          }],
          pois: [{ id: 'chest', kind: 'treasure', pos: [10, 90] }],
          events: [{ id: 'wall', bounds: [[0, 0], [101, 16]], overlay: 'wall.png' }],
        },
        b: {
          name: { en: 'B' },
          type: 'image',
          image: 'b.png',
          width: 120,
          height: 80,
          triggers: [],
        },
      },
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    (new GameLoader() as unknown as { _validate: (value: GameConfig) => void })._validate(config);

    expect(warn).toHaveBeenCalledOnce();
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('trigger "exit" in "a" has out-of-bounds bounds');
    expect(message).toContain('trigger "exit" in "a" has out-of-bounds target focus');
    expect(message).toContain('poi "chest" in "a" has out-of-bounds position');
    expect(message).toContain('event "wall" in "a" has out-of-bounds bounds');
    warn.mockRestore();
  });
});
