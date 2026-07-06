import L from 'leaflet';
import { i18n } from '../i18n/index.js';
import { escapeHtml } from '../utils.js';
import { poiItemName } from './PoiIndex.js';
import type { CatalogItemDef, GameDataCatalogs, TriggerDef, PoiDef } from '../types';

interface TriggerLayerOptions {
  onTriggerClick?: (trigger: TriggerDef) => void;
  onTriggerHover?: (trigger: TriggerDef) => void;
  onTriggerHoverOut?: () => void;
}

interface TriggerRectangle extends L.Rectangle {
  _triggerData?: TriggerDef;
}

/** Everything the layer needs to know about a trigger's target map. */
export interface TargetMapInfo {
  /** Localized display name. */
  name: string;
  /** Preview image URL (thumbnail if available), or null if none. */
  image: string | null;
  /** The target map's POIs (for the hover chest list). */
  pois: PoiDef[];
  /** Tile size in pixels (for tile-coordinate display). */
  tileSize: number;
  /** POI ids the current user marked as collected (dimmed in the list). */
  marked?: Set<string>;
  /** Item catalog for resolving POI itemRefs in the hover chest list. */
  items?: Record<string, CatalogItemDef>;
  /** Full catalogs for resolving item/currency reward refs in the hover chest list. */
  catalogs?: GameDataCatalogs;
}

/**
 * TriggerLayer - Manages the visual trigger overlay on the map.
 * Renders trigger zones as interactive rectangles with tooltips, an optional
 * always-on label mode, and a hover preview of the target map.
 */
export class TriggerLayer {
  private _map: L.Map;
  private _onTriggerClick: (trigger: TriggerDef) => void;
  private _onTriggerHover: (trigger: TriggerDef) => void;
  private _onTriggerHoverOut: () => void;
  private _layerGroup: L.LayerGroup;
  private _triggers: TriggerDef[] = [];
  private _visible = true;
  private _targetResolver: ((mapId: string) => TargetMapInfo | null) | null = null;
  private _permanentLabels = false;
  private _previewEl: HTMLElement | null = null;

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
    this._onTriggerHover = options.onTriggerHover ?? (() => {});
    this._onTriggerHoverOut = options.onTriggerHoverOut ?? (() => {});
    this._layerGroup = L.layerGroup().addTo(this._map);
    this._previewEl = this._createPreviewEl();
  }

  /** Create the (hidden) hover-preview panel inside the map container. */
  private _createPreviewEl(): HTMLElement {
    const el = L.DomUtil.create('div', 'trigger-preview');
    el.style.display = 'none';
    el.innerHTML =
      '<img class="trigger-preview-img" alt="" />' +
      '<div class="trigger-preview-name"></div>' +
      '<div class="trigger-preview-list"></div>';
    this._map.getContainer().appendChild(el);
    return el;
  }

  /** Load and render triggers for a map. */
  setTriggers(triggers: TriggerDef[]): void {
    this.clear();
    this._triggers = triggers ?? [];
    const overlapCounts = this._overlapCounts(this._triggers);
    const overlapSeen = new Map<string, number>();

    for (const trigger of this._triggers) {
      const key = this._boundsKey(trigger.bounds);
      const count = overlapCounts.get(key) ?? 1;
      const index = overlapSeen.get(key) ?? 0;
      overlapSeen.set(key, index + 1);
      const displayBounds = this._splitBounds(trigger.bounds, index, count);
      const bounds: L.LatLngBoundsExpression = [
        this._pixelToLatLng(displayBounds[0]),
        this._pixelToLatLng(displayBounds[1]),
      ];

      const rect: TriggerRectangle = L.rectangle(bounds, { ...this._defaultStyle });

      const label = this._resolveLabel(trigger);
      rect.bindTooltip(escapeHtml(label), this._tooltipOptions());

      rect.on('mouseover', () => {
        rect.setStyle(this._hoverStyle);
        rect.openTooltip();
        this._showPreview(trigger);
        this._onTriggerHover(trigger);
      });
      rect.on('mouseout', () => {
        rect.setStyle(this._defaultStyle);
        this._hidePreview();
        this._onTriggerHoverOut();
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

  private _boundsKey(bounds: TriggerDef['bounds']): string {
    return `${bounds[0][0]},${bounds[0][1]},${bounds[1][0]},${bounds[1][1]}`;
  }

  private _overlapCounts(triggers: TriggerDef[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const trigger of triggers) {
      const key = this._boundsKey(trigger.bounds);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  private _splitBounds(bounds: TriggerDef['bounds'], index: number, count: number): TriggerDef['bounds'] {
    if (count <= 1) return bounds;
    const [[x1, y1], [x2, y2]] = bounds;
    const w = x2 - x1;
    const h = y2 - y1;
    if (w >= h) {
      const a = x1 + (w * index) / count;
      const b = x1 + (w * (index + 1)) / count;
      return [[a, y1], [b, y2]];
    }
    const a = y1 + (h * index) / count;
    const b = y1 + (h * (index + 1)) / count;
    return [[x1, a], [x2, b]];
  }

  /** Update tooltip labels (e.g. after language change). */
  refreshLabels(): void {
    // Rebuild layers so labels — and the permanent/hover tooltip mode — stay in sync.
    this.setTriggers(this._triggers);
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
      this._hidePreview();
    }
  }

  get visible(): boolean {
    return this._visible;
  }

  /** Set a function that resolves a target mapId to its display info. */
  setTargetMapResolver(resolver: (mapId: string) => TargetMapInfo | null): void {
    this._targetResolver = resolver;
  }

  /** Toggle always-on labels (permanent tooltips) vs hover-only. Returns new state. */
  setLabelsPermanent(on: boolean): boolean {
    if (on === this._permanentLabels) return this._permanentLabels; // no rebuild needed
    this._permanentLabels = on;
    this.setTriggers(this._triggers); // rebuild with the new tooltip mode
    return this._permanentLabels;
  }

  get labelsPermanent(): boolean {
    return this._permanentLabels;
  }

  private _tooltipOptions(): L.TooltipOptions {
    return this._permanentLabels
      ? { permanent: true, className: 'trigger-tooltip trigger-tooltip-perm', direction: 'center', opacity: 0.92 }
      : { sticky: true, className: 'trigger-tooltip', direction: 'top', offset: [0, -8] };
  }

  /** Show the hover preview of a trigger's target map: thumbnail + name + chest list. */
  private _showPreview(trigger: TriggerDef): void {
    if (!this._previewEl || !trigger.target) return;
    const isReturn = trigger.kind === 'return' || trigger.target === '__return__';
    const info = this._targetResolver ? this._targetResolver(trigger.target) : null;

    const img = this._previewEl.querySelector('.trigger-preview-img') as HTMLImageElement | null;
    const name = this._previewEl.querySelector('.trigger-preview-name') as HTMLElement | null;
    const listEl = this._previewEl.querySelector('.trigger-preview-list') as HTMLElement | null;

    const url = isReturn ? null : info?.image ?? null;
    if (img) {
      img.src = url ?? '';
      img.style.display = url ? 'block' : 'none';
    }
    if (name) {
      name.textContent = isReturn ? this._resolveLabel(trigger) : info?.name ?? trigger.target;
    }
    if (listEl) {
      if (isReturn) {
        listEl.innerHTML = '';
        listEl.style.display = 'none';
        this._previewEl.style.display = 'block';
        return;
      }
      const tileSize = info?.tileSize ?? 16;
      const chests = (info?.pois ?? []).filter((p) => p.kind === 'treasure' || p.kind === 'gold');
      listEl.innerHTML = chests
        .map((p, i) => {
          const tx = Math.round(p.pos[0] / tileSize);
          const ty = Math.round(p.pos[1] / tileSize);
          const marked = info?.marked?.has(p.id) ?? false;
          return (
            `<div class="trigger-preview-row${marked ? ' marked' : ''}">` +
            `<span class="trigger-preview-item">${marked ? '✓' : `${i + 1}.`} ${escapeHtml(poiItemName(p, info?.catalogs ?? info?.items))}</span>` +
            `<span class="trigger-preview-coord">${tx},${ty}</span>` +
            `</div>`
          );
        })
        .join('');
      listEl.style.display = chests.length ? 'block' : 'none';
    }
    this._previewEl.style.display = 'block';
  }

  private _hidePreview(): void {
    if (this._previewEl) this._previewEl.style.display = 'none';
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
    if (trigger.target && this._targetResolver) {
      const mapName = this._targetResolver(trigger.target)?.name;
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
    this._hidePreview();
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
