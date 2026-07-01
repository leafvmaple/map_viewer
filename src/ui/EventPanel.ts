import L from 'leaflet';
import { i18n } from '../i18n/index.js';
import type { EventDef } from '../types';

interface EventPanelOptions {
  onToggle: (event: EventDef, active: boolean) => void;
}

/**
 * EventPanel - Bottom-left checkbox list of a map's terrain events (e.g. a wall
 * opening). Checking one overlays the event's changed tiles onto the map. Hidden
 * when the current map has no events.
 */
export class EventPanel {
  private _el: HTMLElement;
  private _options: EventPanelOptions;
  private _events: EventDef[] = [];
  private _active = new Set<string>();

  constructor(options: EventPanelOptions) {
    this._options = options;
    this._el = document.createElement('div');
    this._el.className = 'event-panel';
    this._el.style.display = 'none';
    // Live inside the map container so it sits at the map's top-left (right of the
    // zoom control), independent of the sidebar's collapsed state.
    const parent = document.getElementById('map') ?? document.getElementById('app');
    parent?.appendChild(this._el);
    // Don't let clicks / wheel on the panel pan or zoom the map underneath.
    L.DomEvent.disableClickPropagation(this._el);
    L.DomEvent.disableScrollPropagation(this._el);
  }

  /** Show the events for the current map (resets all toggles to off). */
  setEvents(events: EventDef[]): void {
    this._events = events ?? [];
    this._active.clear();
    this._render();
  }

  private _render(): void {
    if (this._events.length === 0) {
      this._el.style.display = 'none';
      this._el.innerHTML = '';
      return;
    }

    const rows = this._events
      .map(ev => {
        const name = ev.label ? i18n.localize(ev.label) : ev.id;
        const checked = this._active.has(ev.id) ? 'checked' : '';
        const count = ev.tiles ? `<span class="event-count">${ev.tiles}</span>` : '';
        return `<label class="event-item">
          <input type="checkbox" data-id="${ev.id}" ${checked} />
          <span class="event-name">${name}</span>
          ${count}
        </label>`;
      })
      .join('');

    this._el.innerHTML = `
      <div class="event-panel-header">⛰ ${i18n.t('event.listTitle')}</div>
      <div class="event-panel-body">${rows}</div>
    `;

    this._el.querySelectorAll('input[type="checkbox"]').forEach(el => {
      el.addEventListener('change', () => {
        const input = el as HTMLInputElement;
        const ev = this._events.find(e => e.id === input.dataset.id);
        if (!ev) return;
        if (input.checked) this._active.add(ev.id);
        else this._active.delete(ev.id);
        this._options.onToggle(ev, input.checked);
      });
    });

    this._el.style.display = 'flex';
  }

  /** Re-render after a language change (preserves active toggles). */
  refreshLabels(): void {
    this._render();
  }
}
