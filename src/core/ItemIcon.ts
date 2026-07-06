import { escapeHtml } from '../utils.js';

const EMOJI_PREFIX = 'emoji:';

/**
 * Item icons are normally image paths. Games without ROM item icons may use
 * `emoji:<glyph>` while keeping the same `itemIcon` contract field.
 */
export function itemIconEmoji(itemIcon?: string): string | null {
  if (!itemIcon?.startsWith(EMOJI_PREFIX)) return null;
  const emoji = itemIcon.slice(EMOJI_PREFIX.length).trim();
  return emoji || null;
}

export function renderItemIcon(
  itemIcon: string | undefined,
  className: string,
  resolveIcon: ((relativePath: string) => string) | null,
): string {
  const emoji = itemIconEmoji(itemIcon);
  if (emoji) {
    return `<span class="${className} item-icon-emoji" aria-hidden="true">${escapeHtml(emoji)}</span>`;
  }
  return itemIcon && resolveIcon
    ? `<img class="${className}" src="${escapeHtml(resolveIcon(itemIcon))}" alt="">`
    : '';
}
