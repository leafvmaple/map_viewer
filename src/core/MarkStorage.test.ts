import { describe, it, expect, vi } from 'vitest';

async function fresh() {
  vi.resetModules();
  localStorage.clear();
  const { MarkStorage } = await import('./MarkStorage.js');
  const { userStore } = await import('./UserStore.js');
  return { MarkStorage, userStore };
}

describe('MarkStorage', () => {
  it('toggle marks and unmarks a poi', async () => {
    const { MarkStorage } = await fresh();
    expect(MarkStorage.isMarked('g1', 'p1')).toBe(false);
    expect(MarkStorage.toggle('g1', 'p1')).toBe(true);
    expect(MarkStorage.isMarked('g1', 'p1')).toBe(true);
    expect(MarkStorage.load('g1')['p1']).toMatchObject({ state: 'collected' });
    expect(MarkStorage.toggle('g1', 'p1')).toBe(false);
    expect(MarkStorage.isMarked('g1', 'p1')).toBe(false);
  });

  it('markedIds returns the set for one game only', async () => {
    const { MarkStorage } = await fresh();
    MarkStorage.toggle('g1', 'a');
    MarkStorage.toggle('g1', 'b');
    MarkStorage.toggle('g2', 'c');
    expect(MarkStorage.markedIds('g1')).toEqual(new Set(['a', 'b']));
    expect(MarkStorage.markedIds('g2')).toEqual(new Set(['c']));
  });

  it('marks are isolated per user', async () => {
    const { MarkStorage, userStore } = await fresh();
    const first = userStore.current.id;
    MarkStorage.toggle('g1', 'a');

    userStore.create('other');
    expect(MarkStorage.markedIds('g1').size).toBe(0);
    MarkStorage.toggle('g1', 'z');

    userStore.switchTo(first);
    expect(MarkStorage.markedIds('g1')).toEqual(new Set(['a']));
  });
});
