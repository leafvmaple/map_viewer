import { userStore } from './UserStore.js';

/**
 * Prefs - Persists lightweight UI preferences (the layer toggles) so they
 * survive a page refresh. Stored PER USER via UserStore (key `prefs` in the
 * current profile's namespace). The selected language is persisted separately
 * by the i18n module; game/map/view survive via the URL hash.
 */
export interface UiPrefs {
  triggers: boolean;   // trigger zones visible
  labels: boolean;     // always-on labels
  treasures: boolean;  // treasure/POI markers visible
  encounters: boolean; // encounter-region overlay + details visible
  grid: boolean;       // tile grid overlay
  collision: boolean;  // static on-foot movement overlay
}

const DEFAULTS: UiPrefs = {
  triggers: true,
  labels: false,
  treasures: true,
  encounters: true,
  grid: false,
  collision: false,
};

export const Prefs = {
  /** Load the current user's prefs, filling any missing keys from the defaults. */
  load(): UiPrefs {
    const saved = userStore.getItem<Partial<UiPrefs>>('prefs');
    return { ...DEFAULTS, ...(saved ?? {}) };
  },

  /** Merge a partial update into the current user's prefs. */
  save(patch: Partial<UiPrefs>): void {
    userStore.setItem('prefs', { ...Prefs.load(), ...patch });
  },
};
