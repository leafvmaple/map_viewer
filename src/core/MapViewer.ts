import L from 'leaflet';
import { TriggerLayer } from './TriggerLayer.js';
import { PoiLayer } from './PoiLayer.js';
import { i18n } from '../i18n/index.js';
import type { GameConfig, MapConfig, TriggerDef, ViewState } from '../types';

interface MapViewerOptions {
  onTriggerClick?: (trigger: TriggerDef) => void;
  onTriggerHover?: (trigger: TriggerDef) => void;
  onTriggerHoverOut?: () => void;
  onMapLoaded?: (mapId: string, mapConfig: MapConfig) => void;
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

  private _currentMapId: string | null = null;
  private _currentMapConfig: MapConfig | null = null;
  private _currentDims: ImageDimensions | null = null;
  private _gameConfig: GameConfig | null = null;
  private _resolveImagePath: ((relativePath: string) => string) | null = null;

  private _imageOverlay: L.ImageOverlay | null = null;
  private _gridLayer: L.LayerGroup | null = null;
  private _showGrid = false;
  private _coordControl: L.Control;

  constructor(containerId: string, options: MapViewerOptions = {}) {
    this._onTriggerClick = options.onTriggerClick ?? (() => {});
    this._onMapLoaded = options.onMapLoaded ?? (() => {});

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
    this._poiLayer = new PoiLayer(this._map);

    // Pixel coordinate display
    this._coordControl = new L.Control({ position: 'bottomleft' });
    this._coordControl.onAdd = () => {
      const div = L.DomUtil.create('div', 'coord-display');
      div.innerHTML = `<span class="coord-label">${i18n.t('map.pixelCoords')}:</span> <span class="coord-value">0, 0</span>`;
      return div;
    };
    this._coordControl.addTo(this._map);

    this._map.on('mousemove', (e: L.LeafletMouseEvent) => {
      const x = Math.round(e.latlng.lng);
      const y = Math.round(-e.latlng.lat);
      const el = this._coordControl.getContainer();
      if (el) {
        const span = el.querySelector('.coord-value');
        if (span) span.textContent = `${x}, ${y}`;
      }
    });
  }

  /** Set the active game configuration. Call before loadMap(). */
  setGameConfig(gameConfig: GameConfig, resolveImagePath: (path: string) => string): void {
    this._gameConfig = gameConfig;
    this._resolveImagePath = resolveImagePath;

    // Provide a map-name resolver so trigger tooltips can show the target map name
    this._triggerLayer.setMapNameResolver((mapId: string) => {
      const mc = gameConfig.maps[mapId];
      return mc ? i18n.localize(mc.name) : mapId;
    });

    // Provide a target-image resolver so hovering a trigger can preview its destination.
    this._triggerLayer.setMapImageResolver((mapId: string) => {
      const mc = gameConfig.maps[mapId];
      if (!mc) return null;
      return resolveImagePath(mc.thumbnail ?? mc.image);
    });

    // Provide a target-POIs resolver so the preview can list the destination's chests.
    this._triggerLayer.setMapPoisResolver((mapId: string) => gameConfig.maps[mapId]?.pois ?? []);
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
      await this._loadTileMap(mapConfig);
    } else {
      await this._loadImageMap(mapConfig, viewState);
    }

    this._triggerLayer.setTriggers(mapConfig.triggers ?? []);
    this._poiLayer.setPois(mapConfig.pois ?? [], mapConfig.tileSize ?? 16);
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

    // Position the view FIRST (no animation), then size maxBounds around it.
    if (viewState) {
      this._map.setView(viewState.center, viewState.zoom, { animate: false });
    } else {
      this._map.fitBounds(bounds, { animate: false });
    }

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
      full.src = fullUrl;
    }

    if (this._showGrid && mapConfig.tileSize) {
      this._addGrid(mapConfig.tileSize, width, height);
    }
  }

  /** Placeholder for tile-based map loading (future extension). */
  private async _loadTileMap(mapConfig: MapConfig): Promise<void> {
    console.warn('Tile-based maps not yet implemented, falling back to image mode');
    if (mapConfig.image) {
      await this._loadImageMap(mapConfig);
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
    if (this._imageOverlay) {
      this._map.removeLayer(this._imageOverlay);
      this._imageOverlay = null;
    }
    this._triggerLayer.clear();
    this._poiLayer.clear();
    this._removeGrid();
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

    this._gridLayer = L.layerGroup(
      lines.map(coords =>
        L.polyline(coords, {
          color: '#ffffff',
          weight: 0.5,
          opacity: 0.3,
          interactive: false,
        })
      )
    ).addTo(this._map);
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

  get triggerLayer(): TriggerLayer {
    return this._triggerLayer;
  }

  get poiLayer(): PoiLayer {
    return this._poiLayer;
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
