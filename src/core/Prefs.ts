/**
 * Prefs - Persists lightweight UI preferences (the layer toggles) to localStorage
 * so they survive a page refresh. The selected language is persisted separately by
 * the i18n module (key `map_viewer_lang`); game/map/view survive via the URL hash.
 */
const KEY = 'map_viewer_prefs';

export interface UiPrefs {
  triggers: boolean;   // trigger zones visible
  labels: boolean;     // always-on labels
  treasures: boolean;  // treasure/POI markers visible
  grid: boolean;       // tile grid overlay
}

const DEFAULTS: UiPrefs = { triggers: true, labels: false, treasures: true, grid: false };

export const Prefs = {
  /** Load the saved prefs, filling any missing keys from the defaults. */
  load(): UiPrefs {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  },

  /** Merge a partial update into the saved prefs. */
  save(patch: Partial<UiPrefs>): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...Prefs.load(), ...patch }));
    } catch (e) {
      console.warn('Failed to save prefs to localStorage:', e);
    }
  },
};
