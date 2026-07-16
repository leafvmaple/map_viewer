import { i18n } from '../i18n/index.js';
import { escapeHtml } from '../utils.js';
import { resolveBattleRewardText, resolvePoiBattle, resolvePoiItems, resolvePoiRewards } from './GameDataResolver.js';
import { renderItemIcon } from './ItemIcon.js';
import { itemHasStats, renderItemStatList } from './ItemStats.js';
import type { CatalogItemDef, GameDataCatalogs, PoiDef } from '../types';

/**
 * PoiTooltip - Builds the HTML for a POI's party tooltip card: a header row
 * (title + member count / defeated badge) above one icon · name · badge row
 * per party member. Game-agnostic — a trainer's Pokémon (火爆猴 Lv39) and an
 * enemy general's army (张飞 兵12000) render through the same card; the badge
 * is `unit` (default "Lv") + `value`. Styles live in main.css (`.poi-tt-*`),
 * the card container class is `.poi-tooltip-card`.
 *
 * Kept Leaflet-free so it can be unit-tested in plain Node.
 */

/** True when the POI carries a structured party worth rendering as a card. */
export function hasPartyCard(poi: PoiDef, catalogs?: GameDataCatalogs): boolean {
  return resolvePoiBattle(poi, catalogs).members.length > 0;
}

/**
 * Render a plain (non-card) tooltip: optional item mini-icon + localized
 * label, with the collected suffix when marked. Falls back to pure text when
 * the POI has no `itemIcon` or no resolver is set.
 */
export function renderPlainTooltip(
  poi: PoiDef,
  title: string,
  isMarked: boolean,
  resolveIcon: ((relativePath: string) => string) | null,
  source?: Record<string, CatalogItemDef> | GameDataCatalogs,
): string {
  const resolved = resolvePoiRewards(poi, source);
  // Equipment stat blocks (data-driven `item.stats`): one list per contained
  // item that ships stats, name-headed when the chest holds several items.
  const withStats = resolvePoiItems(poi, source).filter(r => itemHasStats(r.item));
  const stats = withStats.map(r => {
    const head = resolved.length > 1
      ? `<div class="item-stat-head">${escapeHtml(i18n.localize(r.name) || r.itemId || '')}</div>`
      : '';
    return `${head}${renderItemStatList(r.item!)}`;
  }).join('');
  if (resolved.length > 1) {
    const rows = resolved.map(reward => {
      const icon = renderItemIcon(reward.icon, 'poi-tt-item', resolveIcon);
      return `<li>${icon}<span>${escapeHtml(reward.text)}</span></li>`;
    }).join('');
    const base = `<ul class="poi-tt-items">${rows}</ul>${stats}`;
    return isMarked ? `${base}<div class="poi-tt-done-text">✓ ${escapeHtml(i18n.t('treasure.collected'))}</div>` : base;
  }
  const icon = renderItemIcon(resolved[0]?.icon ?? poi.itemIcon, 'poi-tt-item', resolveIcon);
  const base = `${icon}${escapeHtml(resolved[0]?.text ?? title)}`;
  return (isMarked ? `${base} · ✓ ${escapeHtml(i18n.t('treasure.collected'))}` : base) + stats;
}

/**
 * Render the party card's inner HTML. `title` is the already-localized POI
 * label; `resolveIcon` turns a member's relative icon path into a URL
 * (missing icon / resolver → poké-ball placeholder, the row layout is
 * unaffected).
 */
export function renderPartyCard(
  poi: PoiDef,
  title: string,
  isMarked: boolean,
  resolveIcon: ((relativePath: string) => string) | null,
  catalogs?: GameDataCatalogs,
): string {
  const battle = resolvePoiBattle(poi, catalogs);
  const party = battle.members;

  const badge = isMarked
    ? `<span class="poi-tt-chip">✓ ${escapeHtml(i18n.t('poi.defeated'))}</span>`
    : party.length > 1
      ? `<span class="poi-tt-count">×${party.length}</span>`
      : '';
  // Defeat reward (prize money, spoils…), dimmed between title and count.
  const rewardText = resolveBattleRewardText(poi, catalogs);
  const reward = rewardText
    ? `<span class="poi-tt-reward">${escapeHtml(rewardText)}</span>`
    : '';
  const head = `<div class="poi-tt-head"><span class="poi-tt-name">${escapeHtml(title)}</span>${reward}${badge}</div>`;

  const rows = party.map(member => {
    const icon = member.icon && resolveIcon
      ? `<img class="poi-tt-icon" src="${escapeHtml(resolveIcon(member.icon))}" alt="">`
      : '<span class="poi-tt-icon poi-tt-ball"></span>';
    const name = escapeHtml(i18n.localize(member.name));
    // Numeric badge (level / troop count…) with its dimmed unit prefix;
    // rows without a value get no badge and no dotted leader.
    const stat = Number.isFinite(member.value)
      ? `<span class="poi-tt-leader"></span>` +
        `<span class="poi-tt-lv"><small>${escapeHtml(i18n.localize(member.unit) || 'Lv')}</small>${member.value}</span>`
      : '';
    return `<li>${icon}<span class="poi-tt-mon">${name}</span>${stat}</li>`;
  }).join('');

  return `${head}<ul class="poi-tt-party">${rows}</ul>`;
}
