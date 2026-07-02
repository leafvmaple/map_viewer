import { userStore } from './UserStore.js';

// ============================================================
// MarkStorage - per-user POI marks ("collected" chests, etc.).
//
// Stored under the current user's namespace, one record per game:
//   marks_{gameId} → { [poiId]: { state, at } }
//
// `state` is an open enum on purpose: today only 'collected' exists, but the
// schema leaves room for other mark kinds (visited / todo / ...) without a
// data migration. Marks reference `poi.id`, so the producer (nes_decoder)
// must keep POI ids stable across re-exports — see CONTRACT.md.
// ============================================================

export type MarkState = 'collected';

export interface PoiMark {
  state: MarkState;
  at: number;
}

type GameMarks = Record<string, PoiMark>;

export class MarkStorage {
  private static _key(gameId: string): string {
    return `marks_${gameId}`;
  }

  /** All marks for a game (current user). */
  static load(gameId: string): GameMarks {
    return userStore.getItem<GameMarks>(this._key(gameId)) ?? {};
  }

  /** The set of marked POI ids for a game (current user). */
  static markedIds(gameId: string): Set<string> {
    return new Set(Object.keys(this.load(gameId)));
  }

  /** Toggle a POI's mark. Returns true if it is marked afterwards. */
  static toggle(gameId: string, poiId: string, state: MarkState = 'collected'): boolean {
    const marks = this.load(gameId);
    let nowMarked: boolean;
    if (marks[poiId]) {
      delete marks[poiId];
      nowMarked = false;
    } else {
      marks[poiId] = { state, at: Date.now() };
      nowMarked = true;
    }
    userStore.setItem(this._key(gameId), marks);
    return nowMarked;
  }

  static isMarked(gameId: string, poiId: string): boolean {
    return poiId in this.load(gameId);
  }
}
