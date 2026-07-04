import { i18n } from '../i18n/index.js';
import { escapeHtml } from '../utils.js';
import type { PoiDef } from '../types';

interface TreasureListOptions {
  onSelect: (poi: PoiDef) => void;
  /** Checkbox toggled: mark/unmark a chest as collected (per user). */
  onToggleMark?: (poi: PoiDef) => void;
}

/**
 * TreasureList - The top-right panel listing the current map's treasure/gold
 * chests. Clicking a row pans+flashes that chest; the row checkbox marks it as
 * collected (per user) and dims it. The header shows collected/total progress.
 * Hidden when there are no chests or while a trigger hover card is showing the
 * destination's chests instead.
 */
export class TreasureList {
  private _el: HTMLElement;
  private _options: TreasureListOptions;
  private _pois: PoiDef[] = [];
  private _tileSize = 16;
  private _marked = new Set<string>();
  private _visible = true;
  private _resolveIcon: ((relativePath: string) => string) | null = null;

  constructor(options: TreasureListOptions) {
    this._options = options;
    this._el = document.createElement('div');
    this._el.className = 'treasure-panel';
    this._el.style.display = 'none';
    document.getElementById('app')?.appendChild(this._el);

    // Delegated events: one listener each for row clicks and checkbox toggles.
    this._el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const row = target.closest<HTMLElement>('.treasure-item');
      if (!row?.dataset.id) return;
      const poi = this._pois.find(p => p.id === row.dataset.id);
      if (!poi) return;
      if (target.closest('.treasure-mark')) return; // handled by 'change' below
      this._options.onSelect(poi);
    });
    this._el.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      if (!input.classList.contains('treasure-mark')) return;
      const row = input.closest<HTMLElement>('.treasure-item');
      const poi = row?.dataset.id ? this._pois.find(p => p.id === row.dataset.id) : undefined;
      if (poi) this._options.onToggleMark?.(poi);
    });
  }

  /** Resolve a POI's relative `itemIcon` path into a URL (per game). */
  setIconResolver(resolve: (relativePath: string) => string): void {
    this._resolveIcon = resolve;
  }

  /** Update the list (treasure + gold chests only). */
  setPois(pois: PoiDef[], tileSize = 16): void {
    this._pois = (pois ?? []).filter(p => p.kind === 'treasure' || p.kind === 'gold');
    this._tileSize = tileSize;
    this._render();
  }

  /**
   * Set which chest ids the current user marked as collected. Updates rows in
   * place (class + checkbox + header count) — no innerHTML rebuild, so a single
   * toggle stays cheap even with thousands of rows.
   */
  setMarks(marked: Set<string>): void {
    this._marked = marked;
    this._el.querySelectorAll<HTMLElement>('.treasure-item').forEach(row => {
      const isMarked = marked.has(row.dataset.id ?? '');
      row.classList.toggle('marked', isMarked);
      const cb = row.querySelector<HTMLInputElement>('.treasure-mark');
      if (cb) cb.checked = isMarked;
    });
    const countEl = this._el.querySelector('.treasure-count');
    if (countEl) {
      const collected = this._pois.filter(p => marked.has(p.id)).length;
      countEl.textContent = `${collected}/${this._pois.length}`;
    }
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
        const tx = Math.round(p.pos[0] / this._tileSize);
        const ty = Math.round(p.pos[1] / this._tileSize);
        const marked = this._marked.has(p.id);
        const icon = p.itemIcon && this._resolveIcon
          ? `<img class="treasure-item-icon" src="${escapeHtml(this._resolveIcon(p.itemIcon))}" alt="">`
          : '';
        return `<div class="treasure-item${marked ? ' marked' : ''}" data-id="${escapeHtml(p.id)}">
          <input type="checkbox" class="treasure-mark" title="${escapeHtml(i18n.t('treasure.collected'))}" ${marked ? 'checked' : ''} />
          <span class="treasure-idx">${i + 1}</span>
          ${icon}<span class="treasure-name">${escapeHtml(this._itemName(p))}</span>
          <span class="treasure-pos">${tx},${ty}</span>
        </div>`;
      })
      .join('');

    const collected = this._pois.filter(p => this._marked.has(p.id)).length;
    this._el.innerHTML = `
      <div class="treasure-panel-header">
        📦 ${i18n.t('treasure.listTitle')}
        <span class="treasure-count">${collected}/${this._pois.length}</span>
      </div>
      <div class="treasure-panel-body">${rows}</div>
    `;

    this._updateDisplay();
  }

  /** Re-render after a language change. */
  refreshLabels(): void {
    this._render();
  }
}
