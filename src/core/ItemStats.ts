import { i18n } from '../i18n/index.js';
import { escapeHtml } from '../utils.js';
import type { CatalogItemDef, CatalogItemStat } from '../types';

/**
 * ItemStats - pure HTML renderer for a catalog item's `stats` rows
 * (label ⋯⋯ value, plus the price line). Shared by the panel hover tip
 * (ui/ItemTip) and the map POI tooltip (core/PoiTooltip), so equipment
 * attributes read the same everywhere. Leaflet/DOM-free for unit tests.
 */

/** True when the catalog item ships display-ready stat rows. */
export function itemHasStats(item: CatalogItemDef | undefined): item is CatalogItemDef {
  return Boolean(item?.stats?.length);
}

export function itemStatText(value: CatalogItemStat['value']): string {
  if (typeof value === 'object' && value !== null) return i18n.localize(value) || '';
  return String(value);
}

/** The `<ul>` stat list for one item; empty string when it has no stats. */
export function renderItemStatList(item: CatalogItemDef, withPrice = true): string {
  if (!itemHasStats(item)) return '';
  const rows = (item.stats ?? []).map(stat =>
    `<li><span class="item-stat-label">${escapeHtml(i18n.localize(stat.label))}</span>` +
    `<span class="item-stat-leader"></span>` +
    `<span class="item-stat-value">${escapeHtml(itemStatText(stat.value))}</span></li>`
  ).join('');
  const price = withPrice && Number.isFinite(item.price)
    ? `<li class="item-stat-price"><span class="item-stat-label">${escapeHtml(i18n.t('item.price'))}</span>` +
      `<span class="item-stat-leader"></span>` +
      `<span class="item-stat-value">${item.price}${item.currency ? ` ${escapeHtml(item.currency)}` : ''}</span></li>`
    : '';
  return `<ul class="item-stat-list">${rows}${price}</ul>`;
}
