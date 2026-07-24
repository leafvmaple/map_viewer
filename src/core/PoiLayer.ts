import L from 'leaflet';
import { CHEST_KINDS } from './PoiIndex.js';
import { poiDisplayName, resolvePoiBattle, resolvePoiSpecies } from './GameDataResolver.js';
import { kindGlyph } from './PoiKinds.js';
import { hasPartyCard, renderPartyCard, renderPlainTooltip } from './PoiTooltip.js';
import type { CatalogItemDef, GameDataCatalogs, PoiDef } from '../types';

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
  private _hideMarked = false;
  private _onPoiClick: (poi: PoiDef) => void;
  private _resolveIcon: ((relativePath: string) => string) | null = null;
  private _items: Record<string, CatalogItemDef> = {};
  private _catalogs: GameDataCatalogs = { items: {}, services: {}, species: {}, parties: {}, trainers: {}, currencies: {}, encounters: {} };

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

  setItemCatalog(items: Record<string, CatalogItemDef>): void {
    this._items = items;
    this._catalogs = { ...this._catalogs, items };
    this._render();
  }

  setCatalogs(catalogs: GameDataCatalogs): void {
    this._catalogs = catalogs;
    this._items = catalogs.items;
    this._render();
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

  /** Hide collected POIs entirely (declutter while completing a map). */
  setHideMarked(hide: boolean): void {
    if (hide === this._hideMarked) return;
    this._hideMarked = hide;
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

  /** Create and add the layer(s) for one POI (respects the active filters). */
  private _addPoi(poi: PoiDef): void {
    if (this._hiddenKinds.has(poi.kind)) return;
    if (this._hideMarked && this._marked.has(poi.id)) return;
    const t = this._tileSize;
    const half = t / 2;
    const [x, y] = poi.pos;
    const isMarked = this._marked.has(poi.id);
    const battle = resolvePoiBattle(poi, this._catalogs);
    const species = resolvePoiSpecies(poi, this._catalogs);
    const layers: L.Layer[] = [];
    let layer: L.Layer;

    // Visible scene chests are baked into the image, so they only need a hover
    // zone. Non-chest POIs (shops, inns, NPCs without sprites) need an actual
    // marker on scene maps too, otherwise there is no visible entry point.
    const needsGlyph = poi.hidden || !CHEST_KINDS.has(poi.kind);
    let renderedAsZone = false;

    const markerIcon = poi.icon ?? battle.icon ?? species?.icon;
    if (markerIcon && this._resolveIcon) {
      // Sprite marker (e.g. a trainer's NPC sprite) — shown on every map,
      // anchored so the sprite's feet stand on its tile.
      const [w, h] = poi.iconSize ?? battle.iconSize ?? species?.iconSize ?? [16, 32];
      const icon = L.divIcon({
        className: `poi-marker poi-${poi.kind}${isMarked ? ' poi-marked' : ''}`,
        html: `<img class="poi-sprite" src="${this._resolveIcon(markerIcon)}" width="${w}" height="${h}" alt="">`,
        iconSize: [w, h],
        iconAnchor: [w / 2, h - half],
      });
      layer = L.marker([-(y + half), x + half], { icon, interactive: true, keyboard: false });
    } else if (needsGlyph) {
      // Visible marker (star/money/shop/etc.); dimmed when collected.
      const glyph = kindGlyph(undefined, poi.kind);
      const icon = L.divIcon({
        className: `poi-marker poi-${poi.kind}${isMarked ? ' poi-marked' : ''}`,
        html: `<span class="poi-glyph">${glyph}</span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      layer = L.marker([-(y + half), x + half], { icon, interactive: true, keyboard: false });
    } else if (isMarked) {
      // Collected baked-in chest: shade its sprite so it reads as "done".
      renderedAsZone = true;
      layer = L.rectangle([[-y, x], [-(y + t), x + t]], {
        stroke: false,
        fill: true,
        fillColor: '#000000',
        fillOpacity: 0.55,
        className: `poi-hover poi-hover-marked poi-${poi.kind}`,
        interactive: true,
      });
    } else {
      // Invisible, tile-sized hover zone over the baked chest sprite.
      renderedAsZone = true;
      layer = L.rectangle([[-y, x], [-(y + t), x + t]], {
        stroke: false,
        fill: true,
        fillOpacity: 0,
        className: `poi-hover poi-${poi.kind}`,
        interactive: true,
      });
    }

    const isCard = hasPartyCard(poi, this._catalogs);
    layer.bindTooltip(this._tooltip(poi, isMarked), {
      direction: 'top',
      className: `poi-tooltip${isCard ? ' poi-tooltip-card' : ''}${isCard && isMarked ? ' poi-tt-done' : ''}`,
      offset: [0, -6],
    });
    layer.on('click', (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e.originalEvent);
      this._onPoiClick(poi);
    });
    this._layerGroup.addLayer(layer);
    layers.push(layer);

    // Check glyph on top of the shaded tile so the state is legible at a glance.
    if (isMarked && renderedAsZone) {
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
    // Structured trainer party → icon/name/level card instead of plain text.
    if (hasPartyCard(poi, this._catalogs)) {
      return renderPartyCard(poi, this._label(poi), isMarked, this._resolveIcon, this._catalogs);
    }
    return renderPlainTooltip(poi, this._label(poi), isMarked, this._resolveIcon, this._catalogs);
  }

  private _label(poi: PoiDef): string {
    return poiDisplayName(poi, this._catalogs);
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
