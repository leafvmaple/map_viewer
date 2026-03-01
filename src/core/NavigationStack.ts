import type { NavEntry, ViewState } from '../types';

type StackChangeListener = (path: NavEntry[]) => void;

/**
 * NavigationStack - Maintains a history of visited maps for back navigation.
 */
export class NavigationStack {
  private _stack: NavEntry[] = [];
  private _listeners = new Set<StackChangeListener>();

  /** Push a new map onto the stack. */
  push(gameId: string, mapId: string): void {
    const top = this.current;
    if (top && top.gameId === gameId && top.mapId === mapId) return;
    this._stack.push({ gameId, mapId });
    this._notify();
  }

  /**
   * Save the current view state (zoom + center) to the top of the stack.
   * Call this BEFORE navigating away from the current map.
   */
  saveViewState(viewState: ViewState): void {
    const top = this.current;
    if (top) {
      top.viewState = viewState;
    }
  }

  /** Pop the current map and return to the previous one (with saved viewState). */
  back(): NavEntry | null {
    if (this._stack.length <= 1) return null;
    this._stack.pop();
    this._notify();
    return this.current;
  }

  /** Navigate back to a specific index in the stack (with saved viewState). */
  goTo(index: number): NavEntry | null {
    if (index < 0 || index >= this._stack.length) return null;
    this._stack = this._stack.slice(0, index + 1);
    this._notify();
    return this.current;
  }

  /** Get the current (top of stack) entry. */
  get current(): NavEntry | null {
    return this._stack.length > 0 ? this._stack[this._stack.length - 1] : null;
  }

  /** Get the full navigation path. */
  get path(): NavEntry[] {
    return [...this._stack];
  }

  /** Check if we can go back. */
  get canGoBack(): boolean {
    return this._stack.length > 1;
  }

  /** Clear the entire stack. */
  clear(): void {
    this._stack = [];
    this._notify();
  }

  /** Subscribe to stack changes. */
  onChange(fn: StackChangeListener): () => void {
    this._listeners.add(fn);
    return () => { this._listeners.delete(fn); };
  }

  private _notify(): void {
    const path = this.path;
    this._listeners.forEach(fn => fn(path));
  }
}
