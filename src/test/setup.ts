// Vitest setup: the storage modules run against localStorage, which doesn't
// exist in Node — provide a minimal in-memory implementation. Tests that need
// a pristine module state use vi.resetModules() + dynamic import themselves.

class MemoryStorage implements Storage {
  private _map = new Map<string, string>();

  get length(): number {
    return this._map.size;
  }

  clear(): void {
    this._map.clear();
  }

  getItem(key: string): string | null {
    return this._map.has(key) ? this._map.get(key)! : null;
  }

  key(index: number): string | null {
    return [...this._map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this._map.delete(key);
  }

  setItem(key: string, value: string): void {
    this._map.set(key, String(value));
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
  writable: true,
});
