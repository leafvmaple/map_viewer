import L from 'leaflet';
import { TriggerLayer } from './TriggerLayer.js';
import { PoiLayer } from './PoiLayer.js';
import { i18n } from '../i18n/index.js';
import type { GameConfig, MapConfig, PoiDef, TriggerDef, ViewState, EventDef } from '../types';

interface MapViewerOptions {
  onTriggerClick?: (trigger: TriggerDef) => void;
  onTriggerHover?: (trigger: TriggerDef) => void;
  onTriggerHoverOut?: () => void;
  onMapLoaded?: (mapId: string, mapConfig: MapConfig) => void;
  /** Called when a map/event image fails to load (bad path, missing file). */
  onImageError?: (url: string) => void;
  /** Click on a POI marker/zone (used to toggle its collected mark). */
  onPoiClick?: (poi: PoiDef) => void;
}

interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * MapViewer - Core Leaflet map rendering engine.
 * Handles loading map images, managing zoom, and coordinating trigger layers.
 */
export class MapViewer {
  private _map: L.Map;
  private _triggerLayer: TriggerLayer;
  private _poiLayer: PoiLayer;
  private _onTriggerClick: (trigger: TriggerDef) => void;
  private _onMapLoaded: (mapId: string, mapConfig: MapConfig) => void;
  private _onImageError: (url: string) => void;

  private _currentMapId: string | null = null;
  private _currentMapConfig: MapConfig | null = null;
  private _currentDims: ImageDimensions | null = null;
  private _gameConfig: GameConfig | null = null;
  private _resolveImagePath: ((relativePath: string) => string) | null = null;
  private _isPoiMarked: ((poiId: string) => boolean) | null = null;

  private _imageOverlay: L.ImageOverlay | null = null;
  private _tileLayer: L.TileLayer | null = null;
  private _eventOverlays = new Map<string, L.ImageOverlay>();
  private _gridLayer: L.Polyline | null = null;
  private _showGrid = false;
  private _coordControl: L.Control;
  private _coordValueEl: HTMLElement | null = null;

  constructor(containerId: string, options: MapViewerOptions = {}) {
    this._onTriggerClick = options.onTriggerClick ?? (() => {});
    this._onMapLoaded = options.onMapLoaded ?? (() => {});
    this._onImageError = options.onImageError ?? (() => {});

    // Initialize Leaflet
    this._map = L.map(containerId, {
      crs: L.CRS.Simple,
      zoomSnap: 0,
      zoomDelta: 0.5,
      minZoom: -5,
      maxZoom: 8,
      wheelPxPerZoomLevel: 120,
      attributionControl: false,
      zoomControl: true,
    });

    // Trigger layer
    this._triggerLayer = new TriggerLayer(this._map, {
      onTriggerClick: (trigger) => this._onTriggerClick(trigger),
      onTriggerHover: options.onTriggerHover,
      onTriggerHoverOut: options.onTriggerHoverOut,
    });

    // Points of interest (treasure chests, etc.)
    this._poiLayer = new PoiLayer(this._map, { onPoiClick: options.onPoiClick });

    // Pixel coordinate display
    this._coordControl = new L.Control({ position: 'bottomleft' });
    this._coordControl.onAdd = () => {
      const div = L.DomUtil.create('div', 'coord-display');
      div.innerHTML = `<span class="coord-label">${i18n.t('map.pixelCoords')}:</span> <span class="coord-value">0, 0</span>`;
      this._coordValueEl = div.querySelector('.coord-value');
      return div;
    };
    this._coordControl.addTo(this._map);

    this._map.on('mousemove', (e: L.LeafletMouseEvent) => {
      if (!this._coordValueEl) return;
      const x = Math.round(e.latlng.lng);
      const y = Math.round(-e.latlng.lat);
      this._coordValueEl.textContent = `${x}, ${y}`;
    });

    // Sprite POIs are world objects: match their visual size to the map scale
    // (2^zoom), floored so they remain findable when zoomed far out. One CSS
    // variable drives every sprite — no per-marker work on zoom.
    // `zoomanim` fires at animation START with the TARGET zoom: setting the
    // variable there lets the sprites' CSS transition (same duration/curve as
    // Leaflet's own zoom animation) resize them in sync with the map instead
    // of snapping at zoomend. zoomend still covers non-animated zooms.
    this._map.on('zoomanim', (e) => this._updateSpriteScale((e as L.ZoomAnimEvent).zoom));
    this._map.on('zoomend', () => this._updateSpriteScale());
  }

  private _updateSpriteScale(zoom = this._map.getZoom()): void {
    const scale = Math.max(Math.pow(2, zoom), 0.35);
    this._map.getContainer().style.setProperty('--poi-sprite-scale', scale.toFixed(3));
  }

  /** Set the active game configuration. Call before loadMap(). */
  setGameConfig(
    gameConfig: GameConfig,
    resolveImagePath: (path: string) => string,
    isPoiMarked?: (poiId: string) => boolean,
  ): void {
    this._gameConfig = gameConfig;
    this._resolveImagePath = resolveImagePath;
    this._isPoiMarked = isPoiMarked ?? null;
    this._poiLayer.setIconResolver(resolveImagePath);

    // Resolve a trigger's target map to everything the hover UI needs
    // (localized name, preview image, chest list + collected state, tile size).
    // Runs per hover, so the marked set is always current.
    this._triggerLayer.setTargetMapResolver((mapId: string) => {
      const mc = gameConfig.maps[mapId];
      if (!mc) return null;
      const pois = mc.pois ?? [];
      return {
        name: i18n.localize(mc.name) || mapId,
        image: mc.image ? resolveImagePath(mc.thumbnail ?? mc.image) : null,
        pois,
        tileSize: mc.tileSize ?? 16,
        marked: isPoiMarked
          ? new Set(pois.filter(p => isPoiMarked(p.id)).map(p => p.id))
          : undefined,
      };
    });
  }

  /** Load and display a map by ID. Optionally restore a previous view state. */
  async loadMap(mapId: string, viewState?: ViewState): Promise<void> {
    if (!this._gameConfig) throw new Error('No game config set');
    if (!this._resolveImagePath) throw new Error('No image path resolver set');

    const mapConfig = this._gameConfig.maps[mapId];
    if (!mapConfig) throw new Error(`Map "${mapId}" not found in game config`);

    this._clearCurrentMap();

    this._currentMapId = mapId;
    this._currentMapConfig = mapConfig;

    if (mapConfig.type === 'tiles') {
      await this._loadTileMap(mapConfig, viewState);
    } else {
      await this._loadImageMap(mapConfig, viewState);
    }

    this._triggerLayer.setTriggers(mapConfig.triggers ?? []);
    // Star/gold glyphs only on the (huge) overworld; scene maps show the baked-in
    // chest sprite and just get invisible hover zones for the info tooltip.
    const showGlyphs = mapId === this._gameConfig?.defaultMap;
    const pois = mapConfig.pois ?? [];
    // Include the user's collected marks in the FIRST render — a later
    // setMarks() with the same set is then a no-op diff (no double render).
    const marked = this._isPoiMarked
      ? new Set(pois.filter(p => this._isPoiMarked!(p.id)).map(p => p.id))
      : undefined;
    this._poiLayer.setPois(pois, mapConfig.tileSize ?? 16, showGlyphs, marked);
    this._onMapLoaded(mapId, mapConfig);
  }

  /** Load a single-image map. */
  private async _loadImageMap(mapConfig: MapConfig, viewState?: ViewState): Promise<void> {
    const fullUrl = this._resolveImagePath!(mapConfig.image);

    // Dimensions define the bounds. Prefer the values declared in game.json
    // (skips a probe of the full-res image); otherwise fall back to probing it.
    const { width, height } =
      mapConfig.width != null && mapConfig.height != null
        ? { width: mapConfig.width, height: mapConfig.height }
        : await this._getImageDimensions(fullUrl);

    // CRS.Simple: bounds = [[-height, 0], [0, width]] so (0,0) is top-left
    const bounds: L.LatLngBoundsExpression = [[-height, 0], [0, width]];

    // Progressive load: if a thumbnail is provided (and we know the dimensions),
    // paint it instantly, then swap to the full-res image once it finishes loading.
    const canUseThumb = !!mapConfig.thumbnail && mapConfig.width != null && mapConfig.height != null;
    const initialUrl = canUseThumb ? this._resolveImagePath!(mapConfig.thumbnail!) : fullUrl;

    this._imageOverlay = L.imageOverlay(initialUrl, bounds, {
      className: 'map-image pixelated',
    }).addTo(this._map);
    this._imageOverlay.on('error', () => this._onImageError(initialUrl));

    // Position the view FIRST (no animation), then size maxBounds around it.
    if (viewState) {
      this._map.setView(viewState.center, viewState.zoom, { animate: false });
    } else {
      this._map.fitBounds(bounds, { animate: false });
    }
    this._updateSpriteScale(); // in case the zoom did not change (no zoomend)

    // maxBounds must stay larger than the viewport — otherwise Leaflet's
    // panInsideBounds keeps yanking the view back and forth (visible jitter,
    // especially on tall/narrow maps that fit at a low zoom). Size the margin to
    // at least half a viewport in map pixels so the viewport always fits inside.
    const scale = Math.pow(2, this._map.getZoom());
    const size = this._map.getSize();
    const marginX = Math.max(200, (size.x / scale) * 0.5);
    const marginY = Math.max(200, (size.y / scale) * 0.5);
    this._map.setMaxBounds([
      [-height - marginY, -marginX],
      [marginY, width + marginX],
    ]);

    this._currentDims = { width, height };

    // Upgrade the placeholder to full resolution in the background. Guard against
    // the user navigating away before the full image finishes loading.
    if (canUseThumb) {
      const overlayRef = this._imageOverlay;
      const full = new Image();
      full.onload = () => {
        if (this._imageOverlay === overlayRef) overlayRef.setUrl(fullUrl);
      };
      full.onerror = () => this._onImageError(fullUrl);
      full.src = fullUrl;
    }

    if (this._showGrid && mapConfig.tileSize) {
      this._addGrid(mapConfig.tileSize, width, height);
    }
  }

  /**
   * Tile-pyramid map (huge full-res maps, e.g. HGSS Johto+Kanto at 16 px/tile).
   *
   * The pyramid keeps latlng = full-resolution pixels (same coordinate space as
   * triggers/POIs): zoom 0 tiles are native resolution, negative zooms are
   * pre-downscaled halvings down to `minNativeZoom`. Missing tiles = empty map
   * regions (their 404s are expected and left silent).
   */
  private async _loadTileMap(mapConfig: MapConfig, viewState?: ViewState): Promise<void> {
    if (!mapConfig.tilesPath || mapConfig.width == null || mapConfig.height == null) {
      console.warn('type=tiles needs tilesPath + width/height; falling back to image mode');
      if (mapConfig.image) await this._loadImageMap(mapConfig, viewState);
      return;
    }
    const { width, height } = mapConfig;
    const bounds: L.LatLngBoundsExpression = [[-height, 0], [0, width]];

    // Blur-to-sharp loading (Google-Maps style): a low-res whole-map underlay
    // paints instantly and shows through wherever tiles haven't arrived yet;
    // tiles fade in sharp on top (same pane, higher zIndex). Smoothly scaled
    // on purpose — a blurry ground reads as "loading", a pixelated one as
    // wrong data. Reuses _imageOverlay, so _clearCurrentMap tears it down.
    if (mapConfig.thumbnail) {
      this._imageOverlay = L.imageOverlay(this._resolveImagePath!(mapConfig.thumbnail), bounds, {
        className: 'map-image',
        pane: 'tilePane',
        zIndex: 0,
      }).addTo(this._map);
    }

    this._tileLayer = L.tileLayer(this._resolveImagePath!(mapConfig.tilesPath), {
      tileSize: 256,
      bounds,
      minNativeZoom: mapConfig.minNativeZoom ?? -5,
      maxNativeZoom: 0,
      minZoom: this._map.getMinZoom(),
      maxZoom: this._map.getMaxZoom(),
      noWrap: true,
      keepBuffer: 4,
      className: 'map-image pixelated',
    }).addTo(this._map);

    if (viewState) {
      this._map.setView(viewState.center, viewState.zoom, { animate: false });
    } else {
      this._map.fitBounds(bounds, { animate: false });
    }
    this._updateSpriteScale();

    const scale = Math.pow(2, this._map.getZoom());
    const size = this._map.getSize();
    const marginX = Math.max(200, (size.x / scale) * 0.5);
    const marginY = Math.max(200, (size.y / scale) * 0.5);
    this._map.setMaxBounds([
      [-height - marginY, -marginX],
      [marginY, width + marginX],
    ]);

    this._currentDims = { width, height };
    if (this._showGrid && mapConfig.tileSize) {
      this._addGrid(mapConfig.tileSize, width, height);
    }
  }

  /** Get image dimensions by loading into a hidden Image element. */
  private _getImageDimensions(url: string): Promise<ImageDimensions> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  }

  /** Clear current map layers. */
  private _clearCurrentMap(): void {
    // Drop the outgoing map's maxBounds BEFORE the next map positions its view:
    // setView clamps against the active maxBounds, so a small scene map's stale
    // bounds would drag a restored world-map view into its own corner.
    this._map.setMaxBounds(null as unknown as L.LatLngBoundsExpression);
    if (this._imageOverlay) {
      this._map.removeLayer(this._imageOverlay);
      this._imageOverlay = null;
    }
    if (this._tileLayer) {
      this._map.removeLayer(this._tileLayer);
      this._tileLayer = null;
    }
    this._triggerLayer.clear();
    this._poiLayer.clear();
    this._removeGrid();
    this.clearEventOverlays();
    this._currentMapId = null;
    this._currentMapConfig = null;
    this._currentDims = null;
  }

  /** Add a tile grid overlay. */
  private _addGrid(tileSize: number, width: number, height: number): void {
    this._removeGrid();

    const lines: L.LatLngExpression[][] = [];
    for (let x = 0; x <= width; x += tileSize) {
      lines.push([[0, x], [-height, x]]);
    }
    for (let y = 0; y <= height; y += tileSize) {
      lines.push([[-y, 0], [-y, width]]);
    }

    // One multi-polyline = one SVG path element for the whole grid. Separate
    // polylines would be hundreds of DOM nodes, all re-projected on every zoom.
    this._gridLayer = L.polyline(lines, {
      color: '#ffffff',
      weight: 0.5,
      opacity: 0.3,
      interactive: false,
    }).addTo(this._map);
  }

  private _removeGrid(): void {
    if (this._gridLayer) {
      this._map.removeLayer(this._gridLayer);
      this._gridLayer = null;
    }
  }

  /** Toggle grid lines. */
  toggleGrid(): boolean {
    this._showGrid = !this._showGrid;
    if (this._showGrid && this._currentMapConfig?.tileSize && this._currentDims) {
      this._addGrid(
        this._currentMapConfig.tileSize,
        this._currentDims.width,
        this._currentDims.height,
      );
    } else {
      this._removeGrid();
    }
    return this._showGrid;
  }

  get gridVisible(): boolean {
    return this._showGrid;
  }

  get triggerLayer(): TriggerLayer {
    return this._triggerLayer;
  }

  get poiLayer(): PoiLayer {
    return this._poiLayer;
  }

  /** Toggle a map event's changed-tiles overlay (rendered above the base image). */
  setEventOverlay(event: EventDef, active: boolean): void {
    const existing = this._eventOverlays.get(event.id);
    if (active) {
      if (existing || !this._resolveImagePath) return;
      const [[x1, y1], [x2, y2]] = event.bounds;
      const overlayUrl = this._resolveImagePath(event.overlay);
      const overlay = L.imageOverlay(overlayUrl, [[-y1, x1], [-y2, x2]], {
        interactive: false,
        className: 'event-overlay',
      }).addTo(this._map);
      overlay.on('error', () => this._onImageError(overlayUrl));
      overlay.bringToFront(); // sit above the base map image
      this._eventOverlays.set(event.id, overlay);
    } else if (existing) {
      this._map.removeLayer(existing);
      this._eventOverlays.delete(event.id);
    }
  }

  /** Remove all active event overlays (e.g. when changing maps). */
  clearEventOverlays(): void {
    this._eventOverlays.forEach(ov => this._map.removeLayer(ov));
    this._eventOverlays.clear();
  }

  get leafletMap(): L.Map {
    return this._map;
  }

  get currentMapId(): string | null {
    return this._currentMapId;
  }

  get currentMapConfig(): MapConfig | null {
    return this._currentMapConfig;
  }

  /** Refresh coordinate label after language change. */
  refreshCoordLabel(): void {
    const el = this._coordControl.getContainer();
    if (el) {
      const span = el.querySelector('.coord-label');
      if (span) span.textContent = i18n.t('map.pixelCoords') + ':';
    }
  }

  /** Get the current view state (center + zoom) for saving before navigation. */
  getViewState(): ViewState {
    const center = this._map.getCenter();
    return {
      center: [center.lat, center.lng],
      zoom: this._map.getZoom(),
    };
  }

  /** Restore a previously saved view state (center + zoom). */
  restoreViewState(viewState: ViewState): void {
    this._map.setView(viewState.center, viewState.zoom, { animate: false });
  }

  /** Force a map resize (call when container dimensions change, e.g. sidebar toggle). */
  invalidateSize(): void {
    this._map.invalidateSize();
  }
}
