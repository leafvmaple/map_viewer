import L from 'leaflet';
import { i18n } from '../i18n/index.js';
import { escapeHtml } from '../utils.js';
import { isMarkable } from '../core/PoiIndex.js';
import type { PoiDef } from '../types';

interface PoiFilterOptions {
  /** A category checkbox changed: `hidden` = kinds currently unchecked. */
  onChange: (hidden: Set<string>) => void;
  /** The "hide collected" toggle changed. */
  onHideMarkedChange?: (hide: boolean) => void;
}

/** Legend glyph per known POI kind (fallback: generic pin). */
export const KIND_GLYPHS: Record<string, string> = {
  treasure: '⭐',
  gold: '💰',
  trainer: '⚔️',
  sign: '🪧',
  heal: '💊',
  cut: '🌲',
  rock: '🪨',
  boulder: '🗿',
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
  private _pois: PoiDef[] = [];
  private _kinds: Array<{ kind: string; count: number; markable: boolean; done: number }> = [];
  private _hidden = new Set<string>();
  private _marked = new Set<string>();
  private _hideMarked = false;
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
      if (input.dataset.hideMarked != null) {
        this._hideMarked = input.checked;
        this._options.onHideMarkedChange?.(input.checked);
        return;
      }
      const kind = input.dataset.kind;
      if (!kind) return;
      if (input.checked) this._hidden.delete(kind);
      else this._hidden.add(kind);
      this._options.onChange(new Set(this._hidden));
    });
  }

  /** Show the categories present on the current map (with the user's hidden set). */
  setPois(pois: PoiDef[], hidden: Set<string>, hideMarked = false, marked?: Set<string>): void {
    this._pois = pois ?? [];
    this._hidden = new Set(hidden);
    this._hideMarked = hideMarked;
    if (marked) this._marked = new Set(marked);
    this._recount();
    this._render();
  }

  /** Update the marked set (a mark was toggled) — refreshes the n/total column. */
  setMarks(marked: Set<string>): void {
    this._marked = new Set(marked);
    this._recount();
    this._render();
  }

  /** Per-kind totals + collected/defeated progress for markable categories. */
  private _recount(): void {
    const acc = new Map<string, { count: number; markable: boolean; done: number }>();
    for (const poi of this._pois) {
      let entry = acc.get(poi.kind);
      if (!entry) {
        entry = { count: 0, markable: false, done: 0 };
        acc.set(poi.kind, entry);
      }
      entry.count++;
      if (isMarkable(poi)) {
        entry.markable = true;
        if (this._marked.has(poi.id)) entry.done++;
      }
    }
    this._kinds = [...acc.entries()]
      .map(([kind, e]) => ({ kind, ...e }))
      .sort((a, b) => b.count - a.count);
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
      .map(({ kind, count, markable, done }) => {
        const checked = this._hidden.has(kind) ? '' : 'checked';
        const glyph = KIND_GLYPHS[kind] ?? '📍';
        // Markable categories show collected/defeated progress, others a plain count.
        const tally = markable ? `${done}/${count}` : `${count}`;
        return `<label class="poi-filter-item">
          <input type="checkbox" data-kind="${escapeHtml(kind)}" ${checked} />
          <span class="poi-filter-glyph">${glyph}</span>
          <span class="poi-filter-name">${escapeHtml(this._kindName(kind))}</span>
          <span class="poi-filter-count${markable && done === count && count > 0 ? ' poi-filter-done' : ''}">${tally}</span>
        </label>`;
      })
      .join('');

    this._el.innerHTML = `
      <div class="poi-filter-header">🗺 ${i18n.t('poiFilter.title')}</div>
      <div class="poi-filter-body">${rows}</div>
      <label class="poi-filter-item poi-filter-footer">
        <input type="checkbox" data-hide-marked ${this._hideMarked ? 'checked' : ''} />
        <span class="poi-filter-glyph">🙈</span>
        <span class="poi-filter-name">${i18n.t('checklist.hideCollected')}</span>
      </label>
    `;
    this._updateDisplay();
  }

  /** Re-render after a language change (preserves checkbox state). */
  refreshLabels(): void {
    this._render();
  }
}
