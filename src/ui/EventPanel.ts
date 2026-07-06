import L from 'leaflet';
import { i18n } from '../i18n/index.js';
import { escapeHtml } from '../utils.js';
import type { EventDef } from '../types';

interface EventPanelOptions {
  /** The checkbox was toggled: overlay the event's changed tiles (or remove them). */
  onToggle: (event: EventDef, active: boolean) => void;
  /** The event name was clicked: pan to and flash the event's tile region. */
  onFocus: (event: EventDef) => void;
}

/**
 * EventPanel - Bottom-left list of a map's terrain events (e.g. a wall opening).
 * Each row has a checkbox (overlay the changed tiles on/off) and a clickable
 * name (jump to the affected region on the map). Hidden when the current map
 * has no events.
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

    // Delegated: checkbox change toggles the overlay; a click or Enter on the
    // name jumps to the region (the two controls are deliberately separate).
    this._el.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      if (input.type !== 'checkbox') return;
      const ev = this._events.find(x => x.id === input.dataset.id);
      if (!ev) return;
      if (input.checked) this._active.add(ev.id);
      else this._active.delete(ev.id);
      this._options.onToggle(ev, input.checked);
    });
    this._el.addEventListener('click', (e) => {
      const name = (e.target as HTMLElement).closest<HTMLElement>('.event-name');
      if (name?.dataset.id) this._focus(name.dataset.id);
    });
    this._el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const name = (e.target as HTMLElement).closest<HTMLElement>('.event-name');
      if (name?.dataset.id) {
        e.preventDefault();
        this._focus(name.dataset.id);
      }
    });
  }

  private _focus(id: string): void {
    const ev = this._events.find(x => x.id === id);
    if (ev) this._options.onFocus(ev);
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
      .map((ev, i) => {
        // Uniform display name across games ("地形变化 N"); the producer's raw
        // label (often a ROM address) is kept only as a hover hint for debugging.
        const name = escapeHtml(i18n.t('event.itemName', { n: i + 1 }));
        const raw = ev.label ? i18n.localize(ev.label) : ev.id;
        const nameTitle = `${i18n.t('event.focusHint')}${raw ? ` · ${raw}` : ''}`;
        const checked = this._active.has(ev.id) ? 'checked' : '';
        const count = ev.tiles ? `<span class="event-count">${escapeHtml(ev.tiles)}</span>` : '';
        // Not a <label> — wrapping would route a name click to the checkbox.
        return `<div class="event-item">
          <input type="checkbox" data-id="${escapeHtml(ev.id)}" ${checked}
                 title="${escapeHtml(i18n.t('event.toggleHint'))}" />
          <span class="event-name" data-id="${escapeHtml(ev.id)}" role="button" tabindex="0"
                title="${escapeHtml(nameTitle)}">${name}</span>
          ${count}
        </div>`;
      })
      .join('');

    this._el.innerHTML = `
      <div class="event-panel-header">⛰ ${i18n.t('event.listTitle')}</div>
      <div class="event-panel-body">${rows}</div>
    `;
    this._el.style.display = 'flex';
  }

  /** Re-render after a language change (preserves active toggles). */
  refreshLabels(): void {
    this._render();
  }
}
