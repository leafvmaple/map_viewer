import { i18n } from '../i18n/index.js';
import { escapeHtml } from '../utils.js';
import type { CatalogItemDef, GameDataCatalogs, PoiDef } from '../types';
import { renderItemIcon } from '../core/ItemIcon.js';
import { poiItemName } from '../core/PoiIndex.js';
import { poiPrimaryItemIcon, resolvePoiItems } from '../core/GameDataResolver.js';
import { ItemTip, itemTip } from './ItemTip.js';

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
  private _items: Record<string, CatalogItemDef> = {};
  private _catalogs: GameDataCatalogs | undefined;
  private _hoverRow: HTMLElement | null = null;

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

    // Equipment hover tip: rows whose item ships `stats` show the attribute card.
    this._el.addEventListener('mouseover', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.treasure-item');
      if (row === this._hoverRow) return;
      this._hoverRow = row;
      const poi = row?.dataset.id ? this._pois.find(p => p.id === row.dataset.id) : undefined;
      const source = this._catalogs ?? this._items;
      const item = poi
        ? resolvePoiItems(poi, source).find(resolved => ItemTip.hasTip(resolved.item))?.item
        : undefined;
      if (item) itemTip.show(item, row!.getBoundingClientRect(), this._resolveIcon);
      else itemTip.hide();
    });
    this._el.addEventListener('mouseleave', () => {
      this._hoverRow = null;
      itemTip.hide();
    });
  }

  /** Resolve a POI's relative `itemIcon` path into a URL (per game). */
  setIconResolver(resolve: (relativePath: string) => string): void {
    this._resolveIcon = resolve;
  }

  setItemCatalog(items: Record<string, CatalogItemDef>): void {
    this._items = items;
    this._render();
  }

  setCatalogs(catalogs: GameDataCatalogs): void {
    this._catalogs = catalogs;
    this._items = catalogs.items;
    this._render();
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
    const shown = this._visible && this._pois.length > 0;
    this._el.style.display = shown ? 'flex' : 'none';
    // Lets sibling panels (e.g. the encounter roster) yield vertical space
    // via `#app:has(.treasure-panel.open)` while the list occupies the right column.
    this._el.classList.toggle('open', shown);
  }

  private _render(): void {
    this._hoverRow = null;
    itemTip.hide();
    const rows = this._pois
      .map((p, i) => {
        const tx = Math.round(p.pos[0] / this._tileSize);
        const ty = Math.round(p.pos[1] / this._tileSize);
        const marked = this._marked.has(p.id);
        const source = this._catalogs ?? this._items;
        const icon = renderItemIcon(poiPrimaryItemIcon(p, source), 'treasure-item-icon', this._resolveIcon);
        return `<div class="treasure-item${marked ? ' marked' : ''}" data-id="${escapeHtml(p.id)}">
          <input type="checkbox" class="treasure-mark" title="${escapeHtml(i18n.t('treasure.collected'))}" ${marked ? 'checked' : ''} />
          <span class="treasure-idx">${i + 1}</span>
          ${icon}<span class="treasure-name">${escapeHtml(poiItemName(p, source))}</span>
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
