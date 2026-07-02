import L from 'leaflet';
import { i18n } from '../i18n/index.js';
import { escapeHtml } from '../utils.js';
import type { PoiDef } from '../types';

interface PoiLayerOptions {
  /** Click on a POI (used to toggle its per-user "collected" mark). */
  onPoiClick?: (poi: PoiDef) => void;
}

/**
 * PoiLayer - Renders a map's points of interest (chests, trainers, signs…).
 *
 * Rendering modes per POI:
 *  - sprite marker (`poi.icon`): shown on every map, feet anchored on the tile.
 *  - glyph mode (the huge overworld): a visible star / money-bag marker, since a
 *    baked-in 16px chest is a needle in a haystack there.
 *  - hover mode (scene maps): the chest sprite is baked into the map image itself,
 *    so we add only an invisible, tile-sized hover zone that shows the item name on
 *    hover — no marker glyph cluttering the map.
 *
 * POIs marked as collected by the current user render dimmed (glyphs/sprites) or
 * get a translucent shade + check glyph over the baked sprite (hover zones).
 *
 * Scaling notes: marks apply INCREMENTALLY (only the toggled POI's layers are
 * rebuilt — O(changed), not O(n)), and whole categories can be hidden via
 * setKindFilter. Full rebuilds only happen on map load / filter change /
 * language change.
 */
export class PoiLayer {
  private _map: L.Map;
  private _layerGroup: L.LayerGroup;
  private _pois: PoiDef[] = [];
  private _poisById = new Map<string, PoiDef>();
  private _tileSize = 16;
  private _visible = true;
  private _showGlyphs = true;
  /** poi id → its live layers (main marker/zone [+ check glyph]). */
  private _markers = new Map<string, L.Layer[]>();
  private _marked = new Set<string>();
  private _hiddenKinds = new Set<string>();
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

  /**
   * Load and render POIs. `showGlyphs` → visible markers (overworld) vs
   * hover-only. Pass `marked` so the first render already reflects the current
   * user's collected marks (no second render needed).
   */
  setPois(pois: PoiDef[], tileSize = 16, showGlyphs = true, marked?: Set<string>): void {
    this._tileSize = tileSize;
    this._showGlyphs = showGlyphs;
    this._pois = pois ?? [];
    if (marked) this._marked = new Set(marked);
    this._render();
  }

  /**
   * Set which POI ids the current user has marked as collected. Applies as a
   * diff: only POIs whose state changed get their layers rebuilt.
   */
  setMarks(marked: Set<string>): void {
    const old = this._marked;
    this._marked = new Set(marked);

    const changed: string[] = [];
    for (const id of this._marked) if (!old.has(id)) changed.push(id);
    for (const id of old) if (!this._marked.has(id)) changed.push(id);
    if (changed.length === 0) return;

    // Bulk change (user switch, import): one full render beats many small ones.
    if (changed.length > 50) {
      this._render();
      return;
    }
    for (const id of changed) {
      const poi = this._poisById.get(id);
      if (!poi) continue; // mark for a POI not on this map
      this._removePoi(id);
      this._addPoi(poi);
    }
  }

  /** Hide/show whole POI categories (legend checkboxes). Full re-render. */
  setKindFilter(hiddenKinds: Set<string>): void {
    this._hiddenKinds = new Set(hiddenKinds);
    this._render();
  }

  private _render(): void {
    this._layerGroup.clearLayers();
    this._markers.clear();
    this._poisById.clear();
    for (const poi of this._pois) {
      this._poisById.set(poi.id, poi);
      this._addPoi(poi);
    }
  }

  /** Create and add the layer(s) for one POI (respects the kind filter). */
  private _addPoi(poi: PoiDef): void {
    if (this._hiddenKinds.has(poi.kind)) return;
    const t = this._tileSize;
    const half = t / 2;
    const [x, y] = poi.pos;
    const isMarked = this._marked.has(poi.id);
    const layers: L.Layer[] = [];
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
    layers.push(layer);

    // Check glyph on top of the shaded tile so the state is legible at a glance.
    if (isMarked && !this._showGlyphs && !(poi.icon && this._resolveIcon)) {
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
      layers.push(check);
    }

    this._markers.set(poi.id, layers);
  }

  /** Remove one POI's live layers. */
  private _removePoi(poiId: string): void {
    const layers = this._markers.get(poiId);
    if (!layers) return;
    for (const layer of layers) this._layerGroup.removeLayer(layer);
    this._markers.delete(poiId);
  }

  /** Pan to a POI (keeping zoom) and briefly flash it. */
  focusPoi(poiId: string): void {
    const poi = this._poisById.get(poiId);
    if (!poi) return;
    const half = this._tileSize / 2;
    this._map.panTo([-(poi.pos[1] + half), poi.pos[0] + half]);

    const layer = this._markers.get(poiId)?.[0];
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
    this._poisById.clear();
    this._pois = [];
  }
}
