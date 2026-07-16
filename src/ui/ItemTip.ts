import { i18n } from '../i18n/index.js';
import { escapeHtml } from '../utils.js';
import { renderItemIcon } from '../core/ItemIcon.js';
import type { CatalogItemDef, CatalogItemStat } from '../types';

/**
 * ItemTip - a shared floating hover card showing an equipment item's stat
 * rows (`item.stats` from data/items.json, already localized by the producer)
 * plus its price. One instance serves every panel (treasure list, service
 * panel): rows call show()/hide() from their hover handlers. Items without
 * `stats` get no tip.
 */
export class ItemTip {
  private _el: HTMLElement | null = null;

  /** True when this item has something worth a tip. */
  static hasTip(item: CatalogItemDef | undefined): item is CatalogItemDef {
    return Boolean(item?.stats?.length);
  }

  /** Show the tip beside `anchor` (the hovered row), clamped to the viewport.
   *  Prefers the left side of the anchor — the calling panels sit on the right
   *  screen edge — and flips to the right when there is no room. */
  show(item: CatalogItemDef, anchor: DOMRect, resolveIcon: ((relativePath: string) => string) | null): void {
    if (!ItemTip.hasTip(item)) {
      this.hide();
      return;
    }
    const el = this._ensureEl();
    const icon = renderItemIcon(item.itemIcon, 'item-tip-icon', resolveIcon);
    const category = item.category
      ? `<span class="item-tip-category">${escapeHtml(i18n.localize(item.category))}</span>`
      : '';
    const rows = (item.stats ?? []).map(stat =>
      `<li><span class="item-tip-label">${escapeHtml(statLabel(stat))}</span>` +
      `<span class="item-tip-leader"></span>` +
      `<span class="item-tip-value">${escapeHtml(statValue(stat))}</span></li>`
    ).join('');
    const price = Number.isFinite(item.price)
      ? `<li class="item-tip-price"><span class="item-tip-label">${escapeHtml(i18n.t('item.price'))}</span>` +
        `<span class="item-tip-leader"></span>` +
        `<span class="item-tip-value">${item.price}${item.currency ? ` ${escapeHtml(item.currency)}` : ''}</span></li>`
      : '';
    el.innerHTML = `
      <div class="item-tip-head">${icon}<span class="item-tip-name">${escapeHtml(i18n.localize(item.name) || item.id)}</span>${category}</div>
      <ul class="item-tip-stats">${rows}${price}</ul>
    `;

    // Measure hidden, then place: left of the anchor, flipped when cramped.
    el.style.visibility = 'hidden';
    el.style.display = 'block';
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = anchor.left - w - 10;
    if (x < 8) x = Math.min(anchor.right + 10, window.innerWidth - w - 8);
    const y = Math.max(8, Math.min(anchor.top, window.innerHeight - h - 8));
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
    el.style.visibility = 'visible';
  }

  hide(): void {
    if (this._el) this._el.style.display = 'none';
  }

  private _ensureEl(): HTMLElement {
    if (!this._el) {
      this._el = document.createElement('div');
      this._el.className = 'item-tip';
      this._el.style.display = 'none';
      document.getElementById('app')?.appendChild(this._el);
    }
    return this._el;
  }
}

function statLabel(stat: CatalogItemStat): string {
  return i18n.localize(stat.label) || '';
}

function statValue(stat: CatalogItemStat): string {
  const v = stat.value;
  if (typeof v === 'object' && v !== null) return i18n.localize(v) || '';
  return String(v);
}

/** Shared instance — panels import this instead of each owning a card. */
export const itemTip = new ItemTip();
