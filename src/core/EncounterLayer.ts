import L from 'leaflet';
import type { EncounterZoneDef } from '../types';

interface EncounterLayerOptions {
  onZoneChange?: (zone: EncounterZoneDef | null) => void;
}

/** Non-interactive encounter-region overlay with cursor-based zone selection. */
export class EncounterLayer {
  private readonly _map: L.Map;
  private readonly _group = L.layerGroup();
  private readonly _onZoneChange: (zone: EncounterZoneDef | null) => void;
  private _zones: EncounterZoneDef[] = [];
  private _highlight: L.Rectangle | null = null;
  private _selectedId: string | null = null;
  private _visible = true;

  constructor(map: L.Map, options: EncounterLayerOptions = {}) {
    this._map = map;
    this._onZoneChange = options.onZoneChange ?? (() => {});
    this._group.addTo(map);
    map.on('mousemove', this._handleMouseMove, this);
  }

  setZones(zones: EncounterZoneDef[]): void {
    this.clear();
    this._zones = zones;
    for (const zone of zones) {
      const [[x1, y1], [x2, y2]] = zone.bounds;
      L.rectangle([[-y1, x1], [-y2, x2]], {
        color: '#ff9800',
        weight: 1,
        opacity: 0.28,
        fillColor: '#ff9800',
        fillOpacity: 0.025,
        interactive: false,
        className: 'encounter-zone',
      }).addTo(this._group);
    }
    if (!this._visible) this._map.removeLayer(this._group);
    if (zones.length === 1 && this._visible) this._select(zones[0]);
  }

  clear(): void {
    this._group.clearLayers();
    this._zones = [];
    this._selectedId = null;
    this._highlight = null;
    this._onZoneChange(null);
  }

  setVisible(visible: boolean): void {
    this._visible = visible;
    if (visible) {
      if (!this._map.hasLayer(this._group)) this._group.addTo(this._map);
      if (this._zones.length === 1) this._select(this._zones[0]);
    } else {
      if (this._map.hasLayer(this._group)) this._map.removeLayer(this._group);
      this._selectedId = null;
      this._onZoneChange(null);
    }
  }

  toggle(): boolean {
    this.setVisible(!this._visible);
    return this._visible;
  }

  get visible(): boolean {
    return this._visible;
  }

  private readonly _handleMouseMove = (event: L.LeafletMouseEvent): void => {
    if (!this._visible || this._zones.length <= 1) return;
    const x = event.latlng.lng;
    const y = -event.latlng.lat;
    const zone = this._zones.find((candidate) => {
      const [[x1, y1], [x2, y2]] = candidate.bounds;
      return x >= x1 && x < x2 && y >= y1 && y < y2;
    }) ?? null;
    this._select(zone);
  };

  private _select(zone: EncounterZoneDef | null): void {
    const nextId = zone?.id ?? null;
    if (nextId === this._selectedId) return;
    if (this._highlight) {
      this._group.removeLayer(this._highlight);
      this._highlight = null;
    }
    this._selectedId = nextId;
    if (zone) {
      const [[x1, y1], [x2, y2]] = zone.bounds;
      this._highlight = L.rectangle([[-y1, x1], [-y2, x2]], {
        color: '#ffc107',
        weight: 2,
        opacity: 0.9,
        fillColor: '#ff9800',
        fillOpacity: 0.1,
        interactive: false,
        className: 'encounter-zone-selected',
      }).addTo(this._group);
    }
    this._onZoneChange(zone);
  }
}
