import { describe, it, expect, vi } from 'vitest';

async function fresh() {
  vi.resetModules();
  localStorage.clear();
  const { Prefs } = await import('./Prefs.js');
  const { userStore } = await import('./UserStore.js');
  return { Prefs, userStore };
}

describe('Prefs', () => {
  it('returns defaults when nothing is saved', async () => {
    const { Prefs } = await fresh();
    expect(Prefs.load()).toEqual({
      triggers: true, labels: false, treasures: true, encounters: true, grid: false, collision: false,
    });
  });

  it('save() merges a patch over the saved prefs', async () => {
    const { Prefs } = await fresh();
    Prefs.save({ grid: true });
    Prefs.save({ labels: true });
    expect(Prefs.load()).toEqual({
      triggers: true, labels: true, treasures: true, encounters: true, grid: true, collision: false,
    });
  });

  it('prefs are per user', async () => {
    const { Prefs, userStore } = await fresh();
    const first = userStore.current.id;
    Prefs.save({ triggers: false });

    userStore.create('fresh user');
    expect(Prefs.load().triggers).toBe(true); // defaults again

    userStore.switchTo(first);
    expect(Prefs.load().triggers).toBe(false);
  });
});
