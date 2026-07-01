import L from 'leaflet';
import { i18n } from '../i18n/index.js';
import type { PoiDef } from '../types';

/**
 * PoiLayer - Renders points of interest (treasure chests, etc.) as small marker
 * glyphs with hover tooltips. The actual chest sprite is baked into the map image
 * by the decoder; these markers are just fixed-size location pointers (a star for
 * treasure, a money bag for gold). Positions are full-resolution pixels (tile
 * top-left).
 */
export class PoiLayer {
  private _map: L.Map;
  private _layerGroup: L.LayerGroup;
  private _pois: PoiDef[] = [];
  private _tileSize = 16;
  private _visible = true;
  private _markers = new Map<string, L.Marker>();

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
    this._markers.clear();
    const half = this._tileSize / 2;

    for (const poi of this._pois) {
      const [x, y] = poi.pos;
      // Pixel (x, y) tile top-left → tile centre → LatLng(-y, x) in Simple CRS.
      const center: L.LatLngTuple = [-(y + half), x + half];
      const glyph = poi.kind === 'gold' ? '💰' : poi.kind === 'treasure' ? '⭐' : '📍';
      const icon = L.divIcon({
        className: `poi-marker poi-${poi.kind}`,
        html: `<span class="poi-glyph">${glyph}</span>`,
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
      this._markers.set(poi.id, marker);
    }
  }

  /** Pan to a POI (keeping zoom) and briefly flash its marker. */
  focusPoi(poiId: string): void {
    const poi = this._pois.find(p => p.id === poiId);
    if (!poi) return;
    const half = this._tileSize / 2;
    this._map.panTo([-(poi.pos[1] + half), poi.pos[0] + half]);
    const glyph = this._markers.get(poiId)?.getElement()?.querySelector('.poi-glyph') as HTMLElement | null;
    if (glyph) {
      glyph.classList.remove('poi-flash');
      void glyph.offsetWidth; // restart the animation
      glyph.classList.add('poi-flash');
      setTimeout(() => glyph.classList.remove('poi-flash'), 1600);
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
    this._markers.clear();
    this._pois = [];
  }
}
