import { i18n } from '../i18n/index.js';
import type { GameConfig, NavEntry } from '../types';

interface BreadcrumbOptions {
  onNavigate: (index: number) => void;
}

/**
 * Breadcrumb - Top navigation showing the current map path.
 * Clicking an entry navigates back to that point in the stack.
 */
export class Breadcrumb {
  private _el: HTMLElement;
  private _options: BreadcrumbOptions;
  private _gameConfig: GameConfig | null = null;

  constructor(container: HTMLElement, options: BreadcrumbOptions) {
    this._el = container;
    this._el.className = 'breadcrumb';
    this._options = options;
  }

  /** Set the current game config for resolving map names. */
  setGameConfig(gameConfig: GameConfig): void {
    this._gameConfig = gameConfig;
  }

  /** Update breadcrumb from the current navigation path. */
  update(path: NavEntry[]): void {
    if (!this._gameConfig || path.length === 0) {
      this._el.innerHTML = '';
      return;
    }

    const items = path.map((entry, index) => {
      const mapConfig = this._gameConfig!.maps[entry.mapId];
      const name = mapConfig
        ? i18n.localize(mapConfig.name)
        : entry.mapId;

      const isLast = index === path.length - 1;

      if (isLast) {
        return `<span class="breadcrumb-item current">${name}</span>`;
      }
      return `<a class="breadcrumb-item clickable" data-index="${index}">${name}</a>`;
    });

    this._el.innerHTML = items.join('<span class="breadcrumb-separator">›</span>');

    // Bind click events
    this._el.querySelectorAll('.breadcrumb-item.clickable').forEach(el => {
      el.addEventListener('click', () => {
        const index = parseInt((el as HTMLElement).dataset.index!, 10);
        this._options.onNavigate(index);
      });
    });
  }

  /** Refresh labels after language change (re-render with current data). */
  refreshLabels(path: NavEntry[]): void {
    this.update(path);
  }
}
