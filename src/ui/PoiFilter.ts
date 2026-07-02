import L from 'leaflet';
import { i18n } from '../i18n/index.js';
import { escapeHtml } from '../utils.js';
import type { PoiDef } from '../types';

interface PoiFilterOptions {
  /** A category checkbox changed: `hidden` = kinds currently unchecked. */
  onChange: (hidden: Set<string>) => void;
}

/** Legend glyph per known POI kind (fallback: generic pin). */
const KIND_GLYPHS: Record<string, string> = {
  treasure: '⭐',
  gold: '💰',
  trainer: '⚔️',
  sign: '🪧',
  heal: '💊',
  cut: '🌲',
};

/**
 * PoiFilter - Bottom-left legend (above the coordinate readout) listing the
 * current map's POI categories with counts; unchecking a category hides those
 * markers (persisted per user+game).
 * Doubles as scale control: on dense maps, hiding categories is the cheapest
 * way to keep the marker count low. Hidden when the map has no POIs.
 */
export class PoiFilter {
  private _el: HTMLElement;
  private _options: PoiFilterOptions;
  private _kinds: Array<{ kind: string; count: number }> = [];
  private _hidden = new Set<string>();
  private _visible = true;

  constructor(options: PoiFilterOptions) {
    this._options = options;
    this._el = document.createElement('div');
    this._el.className = 'poi-filter';
    this._el.style.display = 'none';
    const parent = document.getElementById('map') ?? document.getElementById('app');
    parent?.appendChild(this._el);
    L.DomEvent.disableClickPropagation(this._el);
    L.DomEvent.disableScrollPropagation(this._el);

    this._el.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      const kind = input.dataset.kind;
      if (!kind) return;
      if (input.checked) this._hidden.delete(kind);
      else this._hidden.add(kind);
      this._options.onChange(new Set(this._hidden));
    });
  }

  /** Show the categories present on the current map (with the user's hidden set). */
  setPois(pois: PoiDef[], hidden: Set<string>): void {
    const counts = new Map<string, number>();
    for (const poi of pois ?? []) {
      counts.set(poi.kind, (counts.get(poi.kind) ?? 0) + 1);
    }
    this._kinds = [...counts.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count);
    this._hidden = new Set(hidden);
    this._render();
  }

  setVisible(visible: boolean): void {
    this._visible = visible;
    this._updateDisplay();
  }

  private _updateDisplay(): void {
    this._el.style.display = this._visible && this._kinds.length > 0 ? 'flex' : 'none';
  }

  /** Localized kind name; unknown kinds show their raw id. */
  private _kindName(kind: string): string {
    const key = `poi.kind.${kind}`;
    const name = i18n.t(key);
    return name === key ? kind : name;
  }

  private _render(): void {
    const rows = this._kinds
      .map(({ kind, count }) => {
        const checked = this._hidden.has(kind) ? '' : 'checked';
        const glyph = KIND_GLYPHS[kind] ?? '📍';
        return `<label class="poi-filter-item">
          <input type="checkbox" data-kind="${escapeHtml(kind)}" ${checked} />
          <span class="poi-filter-glyph">${glyph}</span>
          <span class="poi-filter-name">${escapeHtml(this._kindName(kind))}</span>
          <span class="poi-filter-count">${count}</span>
        </label>`;
      })
      .join('');

    this._el.innerHTML = `
      <div class="poi-filter-header">🗺 ${i18n.t('poiFilter.title')}</div>
      <div class="poi-filter-body">${rows}</div>
    `;
    this._updateDisplay();
  }

  /** Re-render after a language change (preserves checkbox state). */
  refreshLabels(): void {
    this._render();
  }
}
