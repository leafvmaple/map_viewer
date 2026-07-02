import { describe, it, expect } from 'vitest';
import { NavigationStack } from './NavigationStack.js';

describe('NavigationStack', () => {
  it('starts empty: no current entry, cannot go back', () => {
    const s = new NavigationStack();
    expect(s.current).toBeNull();
    expect(s.canGoBack).toBe(false);
    expect(s.back()).toBeNull();
  });

  it('push / current / path', () => {
    const s = new NavigationStack();
    s.push('g', 'world');
    s.push('g', 'town');
    expect(s.current).toMatchObject({ gameId: 'g', mapId: 'town' });
    expect(s.path.map(e => e.mapId)).toEqual(['world', 'town']);
    expect(s.canGoBack).toBe(true);
  });

  it('ignores a duplicate push of the current map', () => {
    const s = new NavigationStack();
    s.push('g', 'world');
    s.push('g', 'world');
    expect(s.path).toHaveLength(1);
  });

  it('back pops and returns the previous entry with its saved view state', () => {
    const s = new NavigationStack();
    s.push('g', 'world');
    s.saveViewState({ center: [-100, 200], zoom: 2 });
    s.push('g', 'town');
    const entry = s.back();
    expect(entry).toMatchObject({ mapId: 'world', viewState: { zoom: 2 } });
    expect(s.canGoBack).toBe(false);
  });

  it('goTo truncates the stack to the given index', () => {
    const s = new NavigationStack();
    s.push('g', 'a');
    s.push('g', 'b');
    s.push('g', 'c');
    const entry = s.goTo(0);
    expect(entry?.mapId).toBe('a');
    expect(s.path).toHaveLength(1);
    expect(s.goTo(5)).toBeNull();
    expect(s.goTo(-1)).toBeNull();
  });

  it('notifies listeners on change and supports unsubscribe', () => {
    const s = new NavigationStack();
    const seen: number[] = [];
    const off = s.onChange(path => seen.push(path.length));
    s.push('g', 'a');
    s.push('g', 'b');
    off();
    s.push('g', 'c');
    expect(seen).toEqual([1, 2]);
  });
});
