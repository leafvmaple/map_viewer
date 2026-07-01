import L from 'leaflet';
import { i18n } from '../i18n/index.js';
import type { PoiDef } from '../types';

/**
 * PoiLayer - Renders a map's treasure/gold points of interest.
 *
 * Two modes (chosen by the caller):
 *  - glyph mode (the huge overworld): a visible star / money-bag marker, since a
 *    baked-in 16px chest is a needle in a haystack there.
 *  - hover mode (scene maps): the chest sprite is baked into the map image itself,
 *    so we add only an invisible, tile-sized hover zone that shows the item name on
 *    hover — no marker glyph cluttering the map.
 */
export class PoiLayer {
  private _map: L.Map;
  private _layerGroup: L.LayerGroup;
  private _pois: PoiDef[] = [];
  private _tileSize = 16;
  private _visible = true;
  private _showGlyphs = true;
  private _markers = new Map<string, L.Layer>();

  constructor(leafletMap: L.Map) {
    this._map = leafletMap;
    this._layerGroup = L.layerGroup().addTo(this._map);
  }

  /** Load and render POIs. `showGlyphs` → visible markers (overworld) vs hover-only. */
  setPois(pois: PoiDef[], tileSize = 16, showGlyphs = true): void {
    this._tileSize = tileSize;
    this._showGlyphs = showGlyphs;
    this._pois = pois ?? [];
    this._render();
  }

  private _render(): void {
    this._layerGroup.clearLayers();
    this._markers.clear();
    const t = this._tileSize;
    const half = t / 2;

    for (const poi of this._pois) {
      const [x, y] = poi.pos;
      let layer: L.Layer;
      if (this._showGlyphs) {
        // Visible marker (star for a chest, money bag for gold).
        const glyph = poi.kind === 'gold' ? '💰' : poi.kind === 'treasure' ? '⭐' : '📍';
        const icon = L.divIcon({
          className: `poi-marker poi-${poi.kind}`,
          html: `<span class="poi-glyph">${glyph}</span>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        layer = L.marker([-(y + half), x + half], { icon, interactive: true, keyboard: false });
      } else {
        // Invisible, tile-sized hover zone over the baked chest sprite.
        layer = L.rectangle([[-y, x], [-(y + t), x + t]], {
          stroke: false,
          fill: true,
          fillOpacity: 0,
          className: 'poi-hover',
          interactive: true,
        });
      }
      layer.bindTooltip(this._label(poi), {
        direction: 'top',
        className: 'poi-tooltip',
        offset: [0, -6],
      });
      this._layerGroup.addLayer(layer);
      this._markers.set(poi.id, layer);
    }
  }

  /** Pan to a POI (keeping zoom) and briefly flash it. */
  focusPoi(poiId: string): void {
    const poi = this._pois.find(p => p.id === poiId);
    if (!poi) return;
    const half = this._tileSize / 2;
    this._map.panTo([-(poi.pos[1] + half), poi.pos[0] + half]);

    const layer = this._markers.get(poiId);
    if (!layer) return;

    const glyph = (layer as L.Marker).getElement?.()?.querySelector('.poi-glyph') as HTMLElement | null;
    if (glyph) {
      glyph.classList.remove('poi-flash');
      void glyph.offsetWidth; // restart the animation
      glyph.classList.add('poi-flash');
      setTimeout(() => glyph.classList.remove('poi-flash'), 1600);
    } else if (layer instanceof L.Rectangle) {
      // Hover-zone POI: flash a highlight border so the chest is easy to spot.
      layer.setStyle({ stroke: true, color: '#ffb300', weight: 2, fillColor: '#ffb300', fillOpacity: 0.3 });
      setTimeout(() => layer.setStyle({ stroke: false, fillOpacity: 0 }), 1600);
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
