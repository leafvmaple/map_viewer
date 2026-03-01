import L from 'leaflet';
import { i18n } from '../i18n/index.js';
import type { GameConfig, MapConfig, TriggerDef, LocalizedString } from '../types';

interface TriggerEditorOptions {
  /** Called when triggers are modified (add/edit/delete). */
  onTriggersChanged?: (triggers: TriggerDef[]) => void;
}

/**
 * TriggerEditor - Edit mode for creating and editing trigger zones on the map.
 * Supports:
 *   - Click-drag to draw new trigger rectangles
 *   - Click existing trigger to edit properties (target, label)
 *   - Delete triggers
 *   - Export triggers as JSON
 */
export class TriggerEditor {
  private _map: L.Map;
  private _active = false;
  private _gameConfig: GameConfig | null = null;
  private _currentMapId: string | null = null;
  private _currentTileSize = 16;
  private _editLayer: L.LayerGroup;
  private _triggers: TriggerDef[] = [];
  private _options: TriggerEditorOptions;

  // Drawing state
  private _drawing = false;
  private _drawStart: L.LatLng | null = null;
  private _drawRect: L.Rectangle | null = null;

  // Panel
  private _panelEl: HTMLElement | null = null;

  // Styles
  private readonly _editStyle: L.PathOptions = {
    color: '#ff5722',
    weight: 2,
    opacity: 0.9,
    fillColor: '#ff5722',
    fillOpacity: 0.25,
    interactive: true,
  };

  private readonly _drawingStyle: L.PathOptions = {
    color: '#4caf50',
    weight: 2,
    dashArray: '6 4',
    fillColor: '#4caf50',
    fillOpacity: 0.15,
  };

  private readonly _selectedStyle: L.PathOptions = {
    color: '#ffc107',
    weight: 3,
    fillColor: '#ffc107',
    fillOpacity: 0.3,
  };

  constructor(map: L.Map, options: TriggerEditorOptions = {}) {
    this._map = map;
    this._options = options;
    this._editLayer = L.layerGroup();

    // Bind handlers
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
  }

  /** Set the game config (needed for target map dropdown). */
  setGameConfig(gameConfig: GameConfig): void {
    this._gameConfig = gameConfig;
  }

  /** Set the currently displayed map. */
  setCurrentMap(mapId: string, triggers: TriggerDef[], tileSize?: number): void {
    this._currentMapId = mapId;
    this._currentTileSize = tileSize ?? 16;
    this._triggers = triggers.map(t => ({ ...t })); // deep-ish copy
    if (this._active) {
      this._renderEditTriggers();
    }
  }

  /** Activate edit mode. */
  activate(): void {
    if (this._active) return;
    this._active = true;
    this._editLayer.addTo(this._map);
    this._renderEditTriggers();
    this._map.dragging.disable();

    this._map.getContainer().style.cursor = 'crosshair';
    this._map.on('mousedown', this._onMouseDown);
    this._map.on('mousemove', this._onMouseMove);
    this._map.on('mouseup', this._onMouseUp);

    this._showPanel();
  }

  /** Deactivate edit mode. */
  deactivate(): void {
    if (!this._active) return;
    this._active = false;
    this._map.removeLayer(this._editLayer);
    this._editLayer.clearLayers();

    this._map.dragging.enable();
    this._map.getContainer().style.cursor = '';
    this._map.off('mousedown', this._onMouseDown);
    this._map.off('mousemove', this._onMouseMove);
    this._map.off('mouseup', this._onMouseUp);

    this._hidePanel();
  }

  get active(): boolean {
    return this._active;
  }

  /** Toggle edit mode. Returns new state. */
  toggle(): boolean {
    if (this._active) {
      this.deactivate();
    } else {
      this.activate();
    }
    return this._active;
  }

  // ─── Grid Snapping ──────────────────────────────────────────

  /**
   * Snap a Leaflet LatLng to the tile grid.
   * In CRS.Simple: lng = pixel X, lat = -pixel Y.
   * Snaps to the nearest tileSize boundary.
   */
  private _snapToGrid(latlng: L.LatLng): L.LatLng {
    const ts = this._currentTileSize;
    const snappedX = Math.round(latlng.lng / ts) * ts;
    const snappedY = Math.round(latlng.lat / ts) * ts;
    return L.latLng(snappedY, snappedX);
  }

  // ─── Drawing ────────────────────────────────────────────────

  private _onMouseDown(e: L.LeafletMouseEvent): void {
    if (!this._active) return;
    // Only start drawing on left click on empty area
    if ((e.originalEvent as MouseEvent).button !== 0) return;

    this._drawing = true;
    const snapped = this._snapToGrid(e.latlng);
    this._drawStart = snapped;
    const start: L.LatLngTuple = [snapped.lat, snapped.lng];
    this._drawRect = L.rectangle(
      [start, start],
      { ...this._drawingStyle },
    ).addTo(this._editLayer);

    L.DomEvent.preventDefault(e.originalEvent);
  }

  private _onMouseMove(e: L.LeafletMouseEvent): void {
    if (!this._drawing || !this._drawStart || !this._drawRect) return;
    const snapped = this._snapToGrid(e.latlng);
    this._drawRect.setBounds(L.latLngBounds(this._drawStart, snapped));
  }

  private _onMouseUp(e: L.LeafletMouseEvent): void {
    if (!this._drawing || !this._drawStart || !this._drawRect) return;
    this._drawing = false;

    const snappedEnd = this._snapToGrid(e.latlng);
    const bounds = L.latLngBounds(this._drawStart, snappedEnd);
    this._editLayer.removeLayer(this._drawRect);
    this._drawRect = null;
    this._drawStart = null;

    const ts = this._currentTileSize;

    // Minimum size: at least one tile
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const dx = Math.abs(ne.lng - sw.lng);
    const dy = Math.abs(ne.lat - sw.lat);
    if (dx < ts && dy < ts) return;

    // Convert to pixel bounds (already snapped to grid)
    const pixelBounds: [[number, number], [number, number]] = [
      [sw.lng, -ne.lat],
      [ne.lng, -sw.lat],
    ];

    // Create new trigger
    const newTrigger: TriggerDef = {
      id: this._generateId(),
      bounds: pixelBounds,
      target: '',
      label: { en: '', zh: '', ja: '' },
    };

    this._triggers.push(newTrigger);
    this._renderEditTriggers();
    this._showTriggerForm(newTrigger);
    this._notifyChange();
  }

  // ─── Rendering ──────────────────────────────────────────────

  private _renderEditTriggers(): void {
    this._editLayer.clearLayers();

    for (const trigger of this._triggers) {
      const bounds: L.LatLngBoundsExpression = [
        [-trigger.bounds[0][1], trigger.bounds[0][0]],
        [-trigger.bounds[1][1], trigger.bounds[1][0]],
      ];

      const rect = L.rectangle(bounds, { ...this._editStyle });
      const label = i18n.localize(trigger.label) || trigger.id;
      rect.bindTooltip(label, { sticky: true, direction: 'top' });

      rect.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        this._showTriggerForm(trigger);
        // Highlight selected
        this._editLayer.eachLayer(l => {
          if (l instanceof L.Rectangle) l.setStyle(this._editStyle);
        });
        rect.setStyle(this._selectedStyle);
      });

      this._editLayer.addLayer(rect);
    }
  }

  // ─── Edit Panel ─────────────────────────────────────────────

  private _showPanel(): void {
    if (this._panelEl) return;

    this._panelEl = document.createElement('div');
    this._panelEl.className = 'editor-panel';
    this._panelEl.innerHTML = `
      <div class="editor-panel-header">
        <h3>${i18n.t('toolbar.editMode')}</h3>
      </div>
      <div class="editor-panel-body">
        <p class="editor-instructions">${i18n.t('editor.instructions')}</p>
        <div class="editor-form-area"></div>
      </div>
      <div class="editor-panel-footer">
        <button class="btn btn-export-json">${i18n.t('editor.exportJson')}</button>
        <button class="btn btn-export-all">${i18n.t('editor.exportAll')}</button>
      </div>
    `;

    document.getElementById('app')?.appendChild(this._panelEl);

    this._panelEl.querySelector('.btn-export-json')!.addEventListener('click', () => {
      this._exportTriggersJson();
    });
    this._panelEl.querySelector('.btn-export-all')!.addEventListener('click', () => {
      this._exportGameJson();
    });
  }

  private _hidePanel(): void {
    if (this._panelEl) {
      this._panelEl.remove();
      this._panelEl = null;
    }
  }

  /** Show form to edit a specific trigger. */
  private _showTriggerForm(trigger: TriggerDef): void {
    const formArea = this._panelEl?.querySelector('.editor-form-area');
    if (!formArea) return;

    const mapOptions = this._gameConfig
      ? Object.entries(this._gameConfig.maps)
          .filter(([id]) => id !== this._currentMapId)
          .map(([id, m]) => `<option value="${id}" ${id === trigger.target ? 'selected' : ''}>${i18n.localize(m.name)} (${id})</option>`)
          .join('')
      : '';

    formArea.innerHTML = `
      <div class="trigger-form">
        <h4>${trigger.target ? i18n.t('editor.editTrigger') : i18n.t('editor.newTrigger')}</h4>
        <div class="form-group">
          <label>ID</label>
          <input type="text" class="form-input" value="${trigger.id}" data-field="id" readonly />
        </div>
        <div class="form-group">
          <label>${i18n.t('editor.selectTarget')}</label>
          <select class="form-input" data-field="target">
            <option value="">-- select --</option>
            ${mapOptions}
          </select>
        </div>
        <div class="form-group">
          <label>${i18n.t('editor.label')} (EN)</label>
          <input type="text" class="form-input" data-field="label_en" value="${trigger.label.en ?? ''}" />
        </div>
        <div class="form-group">
          <label>${i18n.t('editor.label')} (中文)</label>
          <input type="text" class="form-input" data-field="label_zh" value="${trigger.label.zh ?? ''}" />
        </div>
        <div class="form-group">
          <label>${i18n.t('editor.label')} (日本語)</label>
          <input type="text" class="form-input" data-field="label_ja" value="${trigger.label.ja ?? ''}" />
        </div>
        <div class="form-group">
          <label>Bounds (px)</label>
          <input type="text" class="form-input" value="${JSON.stringify(trigger.bounds)}" readonly />
        </div>
        <div class="form-actions">
          <button class="btn btn-save">${i18n.t('editor.save')}</button>
          <button class="btn btn-delete btn-danger">${i18n.t('editor.delete')}</button>
        </div>
      </div>
    `;

    // Save handler
    formArea.querySelector('.btn-save')!.addEventListener('click', () => {
      const targetSelect = formArea.querySelector('[data-field="target"]') as HTMLSelectElement;
      const labelEn = (formArea.querySelector('[data-field="label_en"]') as HTMLInputElement).value;
      const labelZh = (formArea.querySelector('[data-field="label_zh"]') as HTMLInputElement).value;
      const labelJa = (formArea.querySelector('[data-field="label_ja"]') as HTMLInputElement).value;

      trigger.target = targetSelect.value;
      trigger.label = { en: labelEn, zh: labelZh, ja: labelJa };

      this._renderEditTriggers();
      formArea.innerHTML = `<p class="editor-instructions">${i18n.t('editor.instructions')}</p>`;
      this._notifyChange();
    });

    // Delete handler
    formArea.querySelector('.btn-delete')!.addEventListener('click', () => {
      this._triggers = this._triggers.filter(t => t.id !== trigger.id);
      this._renderEditTriggers();
      formArea.innerHTML = `<p class="editor-instructions">${i18n.t('editor.instructions')}</p>`;
      this._notifyChange();
    });
  }

  // ─── Export ─────────────────────────────────────────────────

  private _exportTriggersJson(): void {
    const json = JSON.stringify(this._triggers, null, 2);
    this._downloadJson(json, `triggers_${this._currentMapId ?? 'unknown'}.json`);
  }

  private _exportGameJson(): void {
    if (!this._gameConfig || !this._currentMapId) return;

    // Merge current triggers back into a copy of game config
    const copy = JSON.parse(JSON.stringify(this._gameConfig)) as GameConfig;
    delete copy._basePath;
    if (copy.maps[this._currentMapId]) {
      copy.maps[this._currentMapId].triggers = this._triggers;
    }

    const json = JSON.stringify(copy, null, 2);
    this._downloadJson(json, `game.json`);
  }

  private _downloadJson(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Helpers ────────────────────────────────────────────────

  private _generateId(): string {
    const prefix = this._currentMapId ?? 'trg';
    const idx = this._triggers.length + 1;
    return `${prefix}_t${String(idx).padStart(2, '0')}`;
  }

  private _notifyChange(): void {
    this._options.onTriggersChanged?.(this._triggers);
  }
}
