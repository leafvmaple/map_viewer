import L from 'leaflet';
import { i18n } from '../i18n/index.js';
import type { TriggerDef } from '../types';

interface TriggerLayerOptions {
  onTriggerClick?: (trigger: TriggerDef) => void;
}

interface TriggerRectangle extends L.Rectangle {
  _triggerData?: TriggerDef;
}

/**
 * TriggerLayer - Manages the visual trigger overlay on the map.
 * Renders trigger zones as interactive rectangles with tooltips.
 */
export class TriggerLayer {
  private _map: L.Map;
  private _onTriggerClick: (trigger: TriggerDef) => void;
  private _layerGroup: L.LayerGroup;
  private _triggers: TriggerDef[] = [];
  private _visible = true;
  private _mapNameResolver: ((mapId: string) => string) | null = null;

  private readonly _defaultStyle: L.PathOptions = {
    color: '#00e5ff',
    weight: 2,
    opacity: 0.8,
    fillColor: '#00e5ff',
    fillOpacity: 0.2,
    interactive: true,
  };

  private readonly _hoverStyle: L.PathOptions = {
    color: '#ffeb3b',
    weight: 3,
    fillColor: '#ffeb3b',
    fillOpacity: 0.35,
  };

  constructor(leafletMap: L.Map, options: TriggerLayerOptions = {}) {
    this._map = leafletMap;
    this._onTriggerClick = options.onTriggerClick ?? (() => {});
    this._layerGroup = L.layerGroup().addTo(this._map);
  }

  /** Load and render triggers for a map. */
  setTriggers(triggers: TriggerDef[]): void {
    this.clear();
    this._triggers = triggers ?? [];

    for (const trigger of this._triggers) {
      const bounds: L.LatLngBoundsExpression = [
        this._pixelToLatLng(trigger.bounds[0]),
        this._pixelToLatLng(trigger.bounds[1]),
      ];

      const rect: TriggerRectangle = L.rectangle(bounds, { ...this._defaultStyle });

      const label = this._resolveLabel(trigger);
      rect.bindTooltip(label, {
        sticky: true,
        className: 'trigger-tooltip',
        direction: 'top',
        offset: [0, -8],
      });

      rect.on('mouseover', () => {
        rect.setStyle(this._hoverStyle);
        rect.openTooltip();
      });
      rect.on('mouseout', () => {
        rect.setStyle(this._defaultStyle);
      });
      rect.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e.originalEvent);
        this._onTriggerClick(trigger);
      });

      rect._triggerData = trigger;
      this._layerGroup.addLayer(rect);
    }
  }

  /**
   * Convert pixel coordinates [x, y] to Leaflet LatLng in Simple CRS.
   * Pixel (x, y) → LatLng(-y, x) so (0,0) is top-left.
   */
  private _pixelToLatLng([x, y]: [number, number]): L.LatLngTuple {
    return [-y, x];
  }

  /** Update tooltip labels (e.g. after language change). */
  refreshLabels(): void {
    this._layerGroup.eachLayer(layer => {
      const rect = layer as TriggerRectangle;
      if (rect._triggerData) {
        const label = this._resolveLabel(rect._triggerData);
        rect.unbindTooltip();
        rect.bindTooltip(label, {
          sticky: true,
          className: 'trigger-tooltip',
          direction: 'top',
          offset: [0, -8],
        });
      }
    });
  }

  /** Show or hide triggers. */
  setVisible(visible: boolean): void {
    this._visible = visible;
    if (visible) {
      if (!this._map.hasLayer(this._layerGroup)) {
        this._map.addLayer(this._layerGroup);
      }
    } else {
      this._map.removeLayer(this._layerGroup);
    }
  }

  get visible(): boolean {
    return this._visible;
  }

  /** Set a function that resolves a mapId to its localized display name. */
  setMapNameResolver(resolver: (mapId: string) => string): void {
    this._mapNameResolver = resolver;
  }

  /**
   * Resolve the display label for a trigger:
   * 1. Use the trigger's own label if non-empty.
   * 2. Fall back to the target map's name via the resolver.
   * 3. Fall back to the generic "unnamed" i18n key.
   */
  private _resolveLabel(trigger: TriggerDef): string {
    const explicit = i18n.localize(trigger.label);
    if (explicit) return explicit;
    if (trigger.target && this._mapNameResolver) {
      const mapName = this._mapNameResolver(trigger.target);
      if (mapName) return mapName;
    }
    return i18n.t('trigger.unnamed');
  }

  /** Toggle trigger visibility. */
  toggle(): boolean {
    this.setVisible(!this._visible);
    return this._visible;
  }

  /** Remove all trigger layers. */
  clear(): void {
    this._layerGroup.clearLayers();
    this._triggers = [];
  }

  /** Get all current trigger definitions. */
  getTriggers(): TriggerDef[] {
    return this._triggers;
  }

  /** Get all Leaflet rectangle layers. */
  getLayers(): L.Layer[] {
    return this._layerGroup.getLayers();
  }
}
