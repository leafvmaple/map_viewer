import { i18n } from '../i18n/index.js';
import { escapeHtml } from '../utils.js';
import type { PoiDef } from '../types';

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
export function hasPartyCard(poi: PoiDef): boolean {
  return Array.isArray(poi.party) && poi.party.length > 0;
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
): string {
  const party = poi.party ?? [];

  const badge = isMarked
    ? `<span class="poi-tt-chip">✓ ${escapeHtml(i18n.t('poi.defeated'))}</span>`
    : party.length > 1
      ? `<span class="poi-tt-count">×${party.length}</span>`
      : '';
  const head = `<div class="poi-tt-head"><span class="poi-tt-name">${escapeHtml(title)}</span>${badge}</div>`;

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
