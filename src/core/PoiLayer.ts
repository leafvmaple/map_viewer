import L from 'leaflet';
import { i18n } from '../i18n/index.js';
import { escapeHtml } from '../utils.js';
import type { PoiDef } from '../types';

interface PoiLayerOptions {
  /** Click on a POI (used to toggle its per-user "collected" mark). */
  onPoiClick?: (poi: PoiDef) => void;
}

/**
 * PoiLayer - Renders a map's treasure/gold points of interest.
 *
 * Two modes (chosen by the caller):
 *  - glyph mode (the huge overworld): a visible star / money-bag marker, since a
 *    baked-in 16px chest is a needle in a haystack there.
 *  - hover mode (scene maps): the chest sprite is baked into the map image itself,
 *    so we add only an invisible, tile-sized hover zone that shows the item name on
 *    hover — no marker glyph cluttering the map.
 *
 * POIs marked as collected by the current user render dimmed (glyphs) or get a
 * translucent shade + check glyph over the baked sprite (hover zones).
 */
export class PoiLayer {
  private _map: L.Map;
  private _layerGroup: L.LayerGroup;
  private _pois: PoiDef[] = [];
  private _tileSize = 16;
  private _visible = true;
  private _showGlyphs = true;
  private _markers = new Map<string, L.Layer>();
  private _marked = new Set<string>();
  private _onPoiClick: (poi: PoiDef) => void;
  private _resolveIcon: ((relativePath: string) => string) | null = null;

  constructor(leafletMap: L.Map, options: PoiLayerOptions = {}) {
    this._map = leafletMap;
    this._onPoiClick = options.onPoiClick ?? (() => {});
    this._layerGroup = L.layerGroup().addTo(this._map);
  }

  /** Set the resolver that turns a POI's relative `icon` path into a URL
   *  (same base as map images). Sprite icons render only when this is set. */
  setIconResolver(resolve: (relativePath: string) => string): void {
    this._resolveIcon = resolve;
  }

  /** Load and render POIs. `showGlyphs` → visible markers (overworld) vs hover-only. */
  setPois(pois: PoiDef[], tileSize = 16, showGlyphs = true): void {
    this._tileSize = tileSize;
    this._showGlyphs = showGlyphs;
    this._pois = pois ?? [];
    this._render();
  }

  /** Set which POI ids the current user has marked as collected, and re-render. */
  setMarks(marked: Set<string>): void {
    this._marked = marked;
    this._render();
  }

  private _render(): void {
    this._layerGroup.clearLayers();
    this._markers.clear();
    const t = this._tileSize;
    const half = t / 2;

    for (const poi of this._pois) {
      const [x, y] = poi.pos;
      const isMarked = this._marked.has(poi.id);
      let layer: L.Layer;
      if (poi.icon && this._resolveIcon) {
        // Sprite marker (e.g. a trainer's NPC sprite) — shown on every map,
        // anchored so the sprite's feet stand on its tile.
        const [w, h] = poi.iconSize ?? [16, 32];
        const icon = L.divIcon({
          className: `poi-marker poi-${poi.kind}${isMarked ? ' poi-marked' : ''}`,
          html: `<img class="poi-sprite" src="${this._resolveIcon(poi.icon)}" width="${w}" height="${h}" alt="">`,
          iconSize: [w, h],
          iconAnchor: [w / 2, h - half],
        });
        layer = L.marker([-(y + half), x + half], { icon, interactive: true, keyboard: false });
      } else if (this._showGlyphs) {
        // Visible marker (star for a chest, money bag for gold); dimmed when collected.
        const glyph = poi.kind === 'gold' ? '💰' : poi.kind === 'treasure' ? '⭐' : '📍';
        const icon = L.divIcon({
          className: `poi-marker poi-${poi.kind}${isMarked ? ' poi-marked' : ''}`,
          html: `<span class="poi-glyph">${glyph}</span>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        layer = L.marker([-(y + half), x + half], { icon, interactive: true, keyboard: false });
      } else if (isMarked) {
        // Collected scene chest: shade the baked sprite so it reads as "done".
        layer = L.rectangle([[-y, x], [-(y + t), x + t]], {
          stroke: false,
          fill: true,
          fillColor: '#000000',
          fillOpacity: 0.55,
          className: 'poi-hover poi-hover-marked',
          interactive: true,
        });
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
      layer.bindTooltip(this._tooltip(poi, isMarked), {
        direction: 'top',
        className: 'poi-tooltip',
        offset: [0, -6],
      });
      layer.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e.originalEvent);
        this._onPoiClick(poi);
      });
      this._layerGroup.addLayer(layer);
      this._markers.set(poi.id, layer);

      // Check glyph on top of the shaded tile so the state is legible at a glance.
      if (isMarked && !this._showGlyphs) {
        const check = L.marker([-(y + half), x + half], {
          icon: L.divIcon({
            className: 'poi-check',
            html: '✓',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
          interactive: false,
          keyboard: false,
        });
        this._layerGroup.addLayer(check);
      }
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

    const glyph = (layer as L.Marker).getElement?.()?.querySelector('.poi-glyph, .poi-sprite') as HTMLElement | null;
    if (glyph) {
      glyph.classList.remove('poi-flash');
      void glyph.offsetWidth; // restart the animation
      glyph.classList.add('poi-flash');
      setTimeout(() => glyph.classList.remove('poi-flash'), 1600);
    } else if (layer instanceof L.Rectangle) {
      // Hover-zone POI: flash a highlight border so the chest is easy to spot.
      const marked = this._marked.has(poiId);
      layer.setStyle({ stroke: true, color: '#ffb300', weight: 2, fillColor: '#ffb300', fillOpacity: 0.3 });
      setTimeout(() => layer.setStyle(
        marked
          ? { stroke: false, fillColor: '#000000', fillOpacity: 0.55 }
          : { stroke: false, fillOpacity: 0 },
      ), 1600);
    }
  }

  private _tooltip(poi: PoiDef, isMarked: boolean): string {
    const base = escapeHtml(this._label(poi));
    return isMarked ? `${base} · ✓ ${escapeHtml(i18n.t('treasure.collected'))}` : base;
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
