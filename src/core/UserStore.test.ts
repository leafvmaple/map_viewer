import { describe, it, expect, vi } from 'vitest';

/** Fresh module (and singleton) against a cleared localStorage. */
async function freshStore() {
  vi.resetModules();
  const mod = await import('./UserStore.js');
  return mod.userStore;
}

describe('UserStore', () => {
  it('first run creates a default profile', async () => {
    localStorage.clear();
    const store = await freshStore();
    expect(store.list()).toHaveLength(1);
    expect(store.current.name.length).toBeGreaterThan(0);
    expect(store.current.id).toBe(store.list()[0].id);
  });

  it('migrates legacy lang/prefs into the default profile and removes them', async () => {
    localStorage.clear();
    localStorage.setItem('map_viewer_lang', 'ja');
    localStorage.setItem('map_viewer_prefs', JSON.stringify({ grid: true }));
    const store = await freshStore();

    expect(store.getItem<string>('lang')).toBe('ja');
    expect(store.getItem<{ grid: boolean }>('prefs')).toEqual({ grid: true });
    expect(localStorage.getItem('map_viewer_lang')).toBeNull();
    expect(localStorage.getItem('map_viewer_prefs')).toBeNull();
  });

  it('create() adds a profile and switches to it', async () => {
    localStorage.clear();
    const store = await freshStore();
    const created = store.create('Alice');
    expect(store.current.id).toBe(created.id);
    expect(store.current.name).toBe('Alice');
    expect(store.list()).toHaveLength(2);
  });

  it('namespaces data per user', async () => {
    localStorage.clear();
    const store = await freshStore();
    const first = store.current.id;
    store.setItem('prefs', { grid: true });

    store.create('B');
    expect(store.getItem('prefs')).toBeNull(); // B sees nothing

    store.setItem('prefs', { grid: false });
    store.switchTo(first);
    expect(store.getItem<{ grid: boolean }>('prefs')).toEqual({ grid: true });
  });

  it('registry survives a reload (new module instance)', async () => {
    localStorage.clear();
    let store = await freshStore();
    const created = store.create('Persistent');
    store.setItem('lang', 'zh');

    vi.resetModules();
    store = (await import('./UserStore.js')).userStore;
    expect(store.current.id).toBe(created.id);
    expect(store.current.name).toBe('Persistent');
    expect(store.getItem<string>('lang')).toBe('zh');
  });

  it('rename / remove; refuses to remove the last user', async () => {
    localStorage.clear();
    const store = await freshStore();
    const first = store.current.id;
    expect(store.remove(first)).toBe(false); // last one

    const second = store.create('Temp');
    store.rename(second.id, 'Renamed');
    expect(store.current.name).toBe('Renamed');

    store.setItem('marks_g', { a: 1 });
    expect(store.remove(second.id)).toBe(true);
    expect(store.current.id).toBe(first);
    // the removed user's namespaced data is gone
    expect(localStorage.getItem(`map_viewer_u_${second.id}_marks_g`)).toBeNull();
  });

  it('notifies listeners on switch/create/rename/remove', async () => {
    localStorage.clear();
    const store = await freshStore();
    const first = store.current.id;
    const seen: string[] = [];
    store.onChange(u => seen.push(u.name));

    const b = store.create('B');       // → B
    store.rename(b.id, 'B2');          // → B2
    store.switchTo(first);             // → default
    store.remove(b.id);                // → default (B2 removed)
    expect(seen).toHaveLength(4);
    expect(seen[0]).toBe('B');
    expect(seen[1]).toBe('B2');
  });

  it('export/import round-trips the current profile data', async () => {
    localStorage.clear();
    const store = await freshStore();
    store.setItem('lang', 'ja');
    store.setItem('marks_metal_max', { chest1: { state: 'collected', at: 1 } });
    const payload = store.exportCurrent();

    const b = store.create('Receiver');
    expect(store.getItem('lang')).toBeNull();
    store.importCurrent(payload);
    expect(store.current.id).toBe(b.id); // import targets the current profile
    expect(store.getItem<string>('lang')).toBe('ja');
    expect(store.getItem<Record<string, unknown>>('marks_metal_max')).toHaveProperty('chest1');
  });

  it('import rejects malformed payloads', async () => {
    localStorage.clear();
    const store = await freshStore();
    expect(() => store.importCurrent('not json')).toThrow();
    expect(() => store.importCurrent('{"version":2,"data":{}}')).toThrow();
    expect(() => store.importCurrent('{"version":1}')).toThrow();
  });
});
