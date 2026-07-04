import L from 'leaflet';
import { escapeHtml } from '../utils.js';
import { floorLabel, type FloorEntry } from '../core/Floors.js';

interface FloorSwitcherOptions {
  /** A different floor was clicked: navigate to that map. */
  onSelect: (mapId: string) => void;
}

/**
 * FloorSwitcher - Vertical floor pills (3F / 2F / 1F / B1F…) shown top-left
 * under the zoom control when the current map belongs to a `floorGroup` with
 * 2+ floors. Clicking a pill switches maps in place (the caller preserves the
 * view), MapGenie-style. Hidden everywhere else.
 */
export class FloorSwitcher {
  private _el: HTMLElement;
  private _current = '';

  constructor(options: FloorSwitcherOptions) {
    this._el = document.createElement('div');
    this._el.className = 'floor-switcher';
    this._el.style.display = 'none';
    const parent = document.getElementById('map') ?? document.getElementById('app');
    parent?.appendChild(this._el);
    L.DomEvent.disableClickPropagation(this._el);
    L.DomEvent.disableScrollPropagation(this._el);

    this._el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-map-id]');
      const mapId = btn?.dataset.mapId;
      if (mapId && mapId !== this._current) options.onSelect(mapId);
    });
  }

  /** Show the current map's floor stack (top floor first); [] hides the control. */
  setFloors(entries: FloorEntry[], currentMapId: string): void {
    this._current = currentMapId;
    if (entries.length < 2) {
      this._el.style.display = 'none';
      this._el.innerHTML = '';
      return;
    }
    this._el.innerHTML = entries
      .map(en => `<button class="floor-btn${en.mapId === currentMapId ? ' active' : ''}"
        data-map-id="${escapeHtml(en.mapId)}">${escapeHtml(floorLabel(en.floor))}</button>`)
      .join('');
    this._el.style.display = 'flex';
  }
}
