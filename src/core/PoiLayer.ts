import L from 'leaflet';
import { i18n } from '../i18n/index.js';
import type { PoiDef } from '../types';

/**
 * PoiLayer - Renders points of interest (treasure chests, etc.) as icon markers
 * with hover tooltips. Positions come in full-resolution pixels (tile top-left).
 */
export class PoiLayer {
  private _map: L.Map;
  private _layerGroup: L.LayerGroup;
  private _pois: PoiDef[] = [];
  private _tileSize = 16;
  private _visible = true;

  constructor(leafletMap: L.Map) {
    this._map = leafletMap;
    this._layerGroup = L.layerGroup().addTo(this._map);
  }

  /** Load and render POIs for a map. */
  setPois(pois: PoiDef[], tileSize = 16): void {
    this._tileSize = tileSize;
    this._pois = pois ?? [];
    this._render();
  }

  private _render(): void {
    this._layerGroup.clearLayers();
    const half = this._tileSize / 2;

    for (const poi of this._pois) {
      const [x, y] = poi.pos;
      // Pixel (x, y) tile top-left → tile centre → LatLng(-y, x) in Simple CRS.
      const center: L.LatLngTuple = [-(y + half), x + half];
      const icon = L.divIcon({
        className: `poi-marker poi-${poi.kind}`,
        html: poi.kind === 'treasure' ? '📦' : '📍',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const marker = L.marker(center, { icon, interactive: true, keyboard: false });
      marker.bindTooltip(this._label(poi), {
        direction: 'top',
        className: 'poi-tooltip',
        offset: [0, -6],
      });
      this._layerGroup.addLayer(marker);
    }
  }

  private _label(poi: PoiDef): string {
    const base = poi.label ? i18n.localize(poi.label) : '';
    if (base) return base;
    return poi.item ? `${poi.kind} ${poi.item}` : poi.kind;
  }

  /** Show or hide POIs. */
  setVisible(visible: boolean): void {
    this._visible = visible;
    if (visible) {
      if (!this._map.hasLayer(this._layerGroup)) this._map.addLayer(this._layerGroup);
    } else {
      this._map.removeLayer(this._layerGroup);
    }
  }

  get visible(): boolean {
    return this._visible;
  }

  /** Toggle POI visibility. Returns new state. */
  toggle(): boolean {
    this.setVisible(!this._visible);
    return this._visible;
  }

  /** Re-render labels after a language change. */
  refreshLabels(): void {
    this._render();
  }

  /** Remove all POI markers. */
  clear(): void {
    this._layerGroup.clearLayers();
    this._pois = [];
  }
}
