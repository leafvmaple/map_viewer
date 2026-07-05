import { i18n } from '../i18n/index.js';
import { escapeHtml } from '../utils.js';
import { poiItemName, isMarkable, type PoiIndexEntry } from '../core/PoiIndex.js';
import { kindGlyph, type PoiKindMeta } from '../core/PoiKinds.js';
import type { PoiDef } from '../types';

interface ChecklistOptions {
  /** Row clicked: jump to the chest on its map. */
  onNavigate: (mapId: string, poiId: string) => void;
  /** Row checkbox toggled. */
  onToggleMark: (poi: PoiDef) => void;
  isMarked: (poiId: string) => boolean;
  resolveMapName: (mapId: string) => string;
  /** Drawer closed from inside (✕ / Esc) — lets the toolbar button sync. */
  onClose?: () => void;
}

/**
 * Checklist - Right-side drawer with the GAME-WIDE collectible list, grouped by
 * map, with per-map and total progress, a search box and a hide-collected
 * filter. Because the data is a full ROM export, the totals are authoritative —
 * "12 / 91" really means there are exactly 91 chests in the game.
 */
export class Checklist {
  private _el: HTMLElement;
  private _options: ChecklistOptions;
  private _entries: PoiIndexEntry[] = []; // markable POIs (chests, trainers, generals…)
  private _resolveIcon: ((relativePath: string) => string) | null = null;
  private _kindMeta: PoiKindMeta;
  private _query = '';
  private _hideCollected = false;
  private _open = false;

  constructor(options: ChecklistOptions) {
    this._options = options;
    this._el = document.createElement('div');
    this._el.className = 'checklist';
    this._el.style.display = 'none';
    document.getElementById('app')?.appendChild(this._el);

    // Delegated events for rows (the list re-renders often).
    this._el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.checklist-close')) {
        this.close();
        this._options.onClose?.();
        return;
      }
      const row = target.closest<HTMLElement>('.checklist-row');
      if (!row?.dataset.mapId || !row.dataset.poiId) return;
      if (target.closest('.checklist-mark')) return; // handled by 'change'
      this._options.onNavigate(row.dataset.mapId, row.dataset.poiId);
    });
    this._el.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      if (input.classList.contains('checklist-hide')) {
        this._hideCollected = input.checked;
        this._renderBody();
        return;
      }
      if (!input.classList.contains('checklist-mark')) return;
      const row = input.closest<HTMLElement>('.checklist-row');
      const entry = this._entries.find(
        en => en.mapId === row?.dataset.mapId && en.poi.id === row?.dataset.poiId,
      );
      if (entry) this._options.onToggleMark(entry.poi);
    });
    this._el.addEventListener('input', (e) => {
      const input = e.target as HTMLInputElement;
      if (!input.classList.contains('checklist-search')) return;
      this._query = input.value;
      this._renderBody();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._open) {
        this.close();
        this._options.onClose?.();
      }
    });
  }

  /** Resolve a POI's relative `itemIcon` path into a URL (per game). */
  setIconResolver(resolve: (relativePath: string) => string): void {
    this._resolveIcon = resolve;
  }

  /** The current game's POI-kind display metadata (game.json `poiKinds`). */
  setKindMeta(meta: PoiKindMeta): void {
    this._kindMeta = meta;
  }

  /** Feed the game-wide POI index (only markable POIs are listed). */
  setEntries(index: PoiIndexEntry[]): void {
    this._entries = index.filter(en => isMarkable(en.poi));
    this._query = '';
    if (this._open) this._render();
  }

  /** Re-render (marks or language changed). */
  refresh(): void {
    if (this._open) this._render();
  }

  refreshLabels(): void {
    this.refresh();
  }

  get open(): boolean {
    return this._open;
  }

  /** Toggle the drawer. Returns the new open state. */
  toggle(): boolean {
    if (this._open) this.close();
    else this.show();
    return this._open;
  }

  show(): void {
    this._open = true;
    this._el.style.display = 'flex';
    this._render();
  }

  close(): void {
    this._open = false;
    this._el.style.display = 'none';
  }

  private _render(): void {
    const collected = this._entries.filter(en => this._options.isMarked(en.poi.id)).length;
    const total = this._entries.length;
    const pct = total > 0 ? Math.round((collected / total) * 100) : 0;

    this._el.innerHTML = `
      <div class="checklist-header">
        <span class="checklist-title">📋 ${i18n.t('checklist.title')}</span>
        <span class="checklist-progress">${collected} / ${total} (${pct}%)</span>
        <button class="checklist-close" title="✕">✕</button>
      </div>
      <div class="checklist-controls">
        <input class="checklist-search" type="text"
               placeholder="${i18n.t('checklist.searchPlaceholder')}"
               value="${escapeHtml(this._query)}" />
        <label class="checklist-hide-label">
          <input type="checkbox" class="checklist-hide" ${this._hideCollected ? 'checked' : ''} />
          ${i18n.t('checklist.hideCollected')}
        </label>
      </div>
      <div class="checklist-body"></div>
    `;
    this._renderBody();
  }

  private _renderBody(): void {
    const body = this._el.querySelector('.checklist-body');
    if (!body) return;

    const q = this._query.trim().toLowerCase();
    const visible = this._entries.filter(en => {
      if (this._hideCollected && this._options.isMarked(en.poi.id)) return false;
      if (!q) return true;
      const texts = [
        ...(en.poi.label ? Object.values(en.poi.label).filter((v): v is string => !!v) : []),
        en.poi.item ?? '',
        ...(en.poi.party ?? []).flatMap(m => Object.values(m.name).filter((v): v is string => !!v)),
      ];
      return texts.some(t => t.toLowerCase().includes(q));
    });

    if (visible.length === 0) {
      body.innerHTML = `<div class="checklist-empty">${i18n.t('checklist.empty')}</div>`;
      return;
    }

    // Group by map, preserving index (= maps) order.
    const groups = new Map<string, PoiIndexEntry[]>();
    for (const entry of visible) {
      const list = groups.get(entry.mapId);
      if (list) list.push(entry);
      else groups.set(entry.mapId, [entry]);
    }

    const html: string[] = [];
    for (const [mapId, entries] of groups) {
      const all = this._entries.filter(en => en.mapId === mapId);
      const done = all.filter(en => this._options.isMarked(en.poi.id)).length;
      html.push(`<div class="checklist-group">
        <div class="checklist-group-header">
          <span class="checklist-group-name">${escapeHtml(this._options.resolveMapName(mapId))}</span>
          <span class="checklist-group-count">${done}/${all.length}</span>
        </div>
        ${entries.map(en => this._rowHtml(en)).join('')}
      </div>`);
    }
    body.innerHTML = html.join('');
  }

  private _rowHtml(entry: PoiIndexEntry): string {
    const { mapId, poi } = entry;
    const marked = this._options.isMarked(poi.id);
    // Item mini-icon when available; kind glyph otherwise.
    const glyph = poi.itemIcon && this._resolveIcon
      ? `<img class="checklist-item-icon" src="${escapeHtml(this._resolveIcon(poi.itemIcon))}" alt="">`
      : `<span class="checklist-glyph">${kindGlyph(this._kindMeta, poi.kind)}</span>`;
    return `<div class="checklist-row${marked ? ' marked' : ''}"
                 data-map-id="${escapeHtml(mapId)}" data-poi-id="${escapeHtml(poi.id)}">
      <input type="checkbox" class="checklist-mark" ${marked ? 'checked' : ''} />
      ${glyph}
      <span class="checklist-name">${escapeHtml(poiItemName(poi))}</span>
    </div>`;
  }
}
