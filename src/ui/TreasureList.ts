import { i18n } from '../i18n/index.js';
import type { PoiDef } from '../types';

interface TreasureListOptions {
  onSelect: (poi: PoiDef) => void;
}

/**
 * TreasureList - A right-side panel listing every treasure chest on the current
 * map. Clicking a row pans to that chest and flashes it. Hidden when the map has
 * no chests, when treasures are toggled off, or in edit mode.
 */
export class TreasureList {
  private _el: HTMLElement;
  private _options: TreasureListOptions;
  private _pois: PoiDef[] = [];
  private _visible = true;

  constructor(options: TreasureListOptions) {
    this._options = options;
    this._el = document.createElement('div');
    this._el.className = 'treasure-panel';
    this._el.style.display = 'none';
    document.getElementById('app')?.appendChild(this._el);
  }

  /** Update the list for the current map (treasures only). */
  setPois(pois: PoiDef[]): void {
    this._pois = (pois ?? []).filter(p => p.kind === 'treasure');
    this._render();
  }

  setVisible(visible: boolean): void {
    this._visible = visible;
    this._updateDisplay();
  }

  private _updateDisplay(): void {
    this._el.style.display = this._visible && this._pois.length > 0 ? 'flex' : 'none';
  }

  /** Item name without the "宝箱 · " prefix, for a compact row. */
  private _itemName(poi: PoiDef): string {
    const full = poi.label ? i18n.localize(poi.label) : '';
    const sep = full.indexOf('·');
    if (sep >= 0) return full.slice(sep + 1).trim();
    return full || poi.item || '?';
  }

  private _render(): void {
    const rows = this._pois
      .map((p, i) => {
        const tx = Math.round(p.pos[0] / 16);
        const ty = Math.round(p.pos[1] / 16);
        return `<div class="treasure-item" data-id="${p.id}">
          <span class="treasure-idx">${i + 1}</span>
          <span class="treasure-name">${this._itemName(p)}</span>
          <span class="treasure-pos">${tx},${ty}</span>
        </div>`;
      })
      .join('');

    this._el.innerHTML = `
      <div class="treasure-panel-header">
        📦 ${i18n.t('treasure.listTitle')}
        <span class="treasure-count">${this._pois.length}</span>
      </div>
      <div class="treasure-panel-body">${rows}</div>
    `;

    this._el.querySelectorAll('.treasure-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.id!;
        const poi = this._pois.find(p => p.id === id);
        if (poi) this._options.onSelect(poi);
      });
    });

    this._updateDisplay();
  }

  /** Re-render after a language change. */
  refreshLabels(): void {
    this._render();
  }
}
