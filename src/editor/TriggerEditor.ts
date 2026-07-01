import L from 'leaflet';
import { i18n } from '../i18n/index.js';
import type { GameConfig, TriggerDef } from '../types';

interface TriggerEditorOptions {
  /** Called when triggers are modified (add/edit/move/resize/delete/undo). */
  onTriggersChanged?: (triggers: TriggerDef[]) => void;
}

type BoundsPx = [[number, number], [number, number]];
type EditMode = 'idle' | 'draw' | 'move' | 'resize';

/**
 * TriggerEditor - Edit mode for creating and editing trigger zones on the map.
 * Supports:
 *   - Click-drag on empty space to draw new trigger rectangles
 *   - Drag an existing zone to move it (grid-snapped)
 *   - Drag a corner handle to resize it
 *   - Click a zone to edit properties (target, label) / delete it
 *   - Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) to undo / redo
 *   - Export triggers as JSON
 */
export class TriggerEditor {
  private _map: L.Map;
  private _active = false;
  private _gameConfig: GameConfig | null = null;
  private _currentMapId: string | null = null;
  private _currentTileSize = 16;
  private _editLayer: L.LayerGroup;
  private _handleLayer: L.LayerGroup;
  private _triggers: TriggerDef[] = [];
  private _options: TriggerEditorOptions;
  private _selectedId: string | null = null;

  // Interaction state
  private _mode: EditMode = 'idle';
  private _drawStart: L.LatLng | null = null;
  private _drawRect: L.Rectangle | null = null;
  private _dragTrigger: TriggerDef | null = null;
  private _dragStartLatLng: L.LatLng | null = null;
  private _dragOrigBounds: BoundsPx | null = null;
  private _resizeCorner = 0; // 0=TL 1=TR 2=BR 3=BL
  private _preDrag: TriggerDef[] | null = null;
  private _dirtied = false;

  // Undo / redo (snapshots of the trigger list)
  private _undo: TriggerDef[][] = [];
  private _redo: TriggerDef[][] = [];

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
    this._handleLayer = L.layerGroup();

    // Bind handlers
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  /** Set the game config (needed for target map dropdown). */
  setGameConfig(gameConfig: GameConfig): void {
    this._gameConfig = gameConfig;
  }

  /** Set the currently displayed map. Resets undo history + selection. */
  setCurrentMap(mapId: string, triggers: TriggerDef[], tileSize?: number): void {
    this._currentMapId = mapId;
    this._currentTileSize = tileSize ?? 16;
    this._triggers = triggers.map(t => this._cloneTrigger(t));
    this._selectedId = null;
    this._undo = [];
    this._redo = [];
    if (this._active) {
      this._renderEditTriggers();
    }
  }

  /** Activate edit mode. */
  activate(): void {
    if (this._active) return;
    this._active = true;
    this._editLayer.addTo(this._map);
    this._handleLayer.addTo(this._map);
    this._renderEditTriggers();
    this._map.dragging.disable();

    this._map.getContainer().style.cursor = 'crosshair';
    this._map.on('mousedown', this._onMouseDown);
    this._map.on('mousemove', this._onMouseMove);
    this._map.on('mouseup', this._onMouseUp);
    document.addEventListener('keydown', this._onKeyDown);

    this._showPanel();
  }

  /** Deactivate edit mode. */
  deactivate(): void {
    if (!this._active) return;
    this._active = false;
    this._map.removeLayer(this._editLayer);
    this._map.removeLayer(this._handleLayer);
    this._editLayer.clearLayers();
    this._handleLayer.clearLayers();
    this._selectedId = null;
    this._mode = 'idle';

    this._map.dragging.enable();
    this._map.getContainer().style.cursor = '';
    this._map.off('mousedown', this._onMouseDown);
    this._map.off('mousemove', this._onMouseMove);
    this._map.off('mouseup', this._onMouseUp);
    document.removeEventListener('keydown', this._onKeyDown);

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

  // ─── Grid Snapping & Pixel Helpers ──────────────────────────

  /**
   * Snap a Leaflet LatLng to the tile grid.
   * In CRS.Simple: lng = pixel X, lat = -pixel Y.
   */
  private _snapToGrid(latlng: L.LatLng): L.LatLng {
    const ts = this._currentTileSize;
    const snappedX = Math.round(latlng.lng / ts) * ts;
    const snappedY = Math.round(latlng.lat / ts) * ts;
    return L.latLng(snappedY, snappedX);
  }

  /** Pixel [x, y] → Leaflet LatLng tuple (top-left origin). */
  private _pxToLatLng([x, y]: [number, number]): L.LatLngTuple {
    return [-y, x];
  }

  /** Normalise pixel bounds so [0] is the top-left (min) and [1] the bottom-right (max). */
  private _normBounds(b: BoundsPx): BoundsPx {
    return [
      [Math.min(b[0][0], b[1][0]), Math.min(b[0][1], b[1][1])],
      [Math.max(b[0][0], b[1][0]), Math.max(b[0][1], b[1][1])],
    ];
  }

  // ─── Pointer Interaction ────────────────────────────────────

  private _onMouseDown(e: L.LeafletMouseEvent): void {
    if (!this._active) return;
    if ((e.originalEvent as MouseEvent).button !== 0) return;
    if (this._mode !== 'idle') return; // a zone/handle already grabbed the pointer

    // Empty-space press starts drawing a new zone.
    this._mode = 'draw';
    const snapped = this._snapToGrid(e.latlng);
    this._drawStart = snapped;
    const start: L.LatLngTuple = [snapped.lat, snapped.lng];
    this._drawRect = L.rectangle([start, start], { ...this._drawingStyle }).addTo(this._editLayer);

    L.DomEvent.preventDefault(e.originalEvent);
  }

  private _onMouseMove(e: L.LeafletMouseEvent): void {
    if (this._mode === 'draw') {
      if (!this._drawStart || !this._drawRect) return;
      const snapped = this._snapToGrid(e.latlng);
      this._drawRect.setBounds(L.latLngBounds(this._drawStart, snapped));
    } else if (this._mode === 'move') {
      this._doMove(e);
    } else if (this._mode === 'resize') {
      this._doResize(e);
    }
  }

  private _onMouseUp(e: L.LeafletMouseEvent): void {
    if (this._mode === 'draw') {
      this._finishDraw(e);
    } else if (this._mode === 'move' || this._mode === 'resize') {
      if (this._dragTrigger) {
        this._dragTrigger.bounds = this._normBounds(this._dragTrigger.bounds);
        if (this._dirtied) this._notifyChange();
      }
      this._mode = 'idle';
      this._dragTrigger = null;
      this._dragStartLatLng = null;
      this._dragOrigBounds = null;
      this._preDrag = null;
      this._renderEditTriggers();
    }
  }

  private _doMove(e: L.LeafletMouseEvent): void {
    if (!this._dragTrigger || !this._dragStartLatLng || !this._dragOrigBounds) return;
    const cur = this._snapToGrid(e.latlng);
    const dx = cur.lng - this._dragStartLatLng.lng;
    const dy = -(cur.lat - this._dragStartLatLng.lat);
    if (dx === 0 && dy === 0) return;
    this._markDirty();
    const b = this._dragOrigBounds;
    this._dragTrigger.bounds = [
      [b[0][0] + dx, b[0][1] + dy],
      [b[1][0] + dx, b[1][1] + dy],
    ];
    this._renderEditTriggers();
  }

  private _doResize(e: L.LeafletMouseEvent): void {
    if (!this._dragTrigger || !this._dragOrigBounds) return;
    const cur = this._snapToGrid(e.latlng);
    const cx = cur.lng;
    const cy = -cur.lat;
    let [[x1, y1], [x2, y2]] = this._dragOrigBounds;
    switch (this._resizeCorner) {
      case 0: x1 = cx; y1 = cy; break; // TL
      case 1: x2 = cx; y1 = cy; break; // TR
      case 2: x2 = cx; y2 = cy; break; // BR
      default: x1 = cx; y2 = cy; break; // BL
    }
    const nb: BoundsPx = [[x1, y1], [x2, y2]];
    if (JSON.stringify(nb) !== JSON.stringify(this._dragOrigBounds)) this._markDirty();
    this._dragTrigger.bounds = nb;
    this._renderEditTriggers();
  }

  /** Push the pre-drag snapshot to the undo stack on the first real change. */
  private _markDirty(): void {
    if (this._dirtied) return;
    if (this._preDrag) {
      this._undo.push(this._preDrag);
      this._redo = [];
      this._capUndo();
    }
    this._dirtied = true;
  }

  private _finishDraw(e: L.LeafletMouseEvent): void {
    this._mode = 'idle';
    if (!this._drawStart || !this._drawRect) return;

    const snappedEnd = this._snapToGrid(e.latlng);
    const bounds = L.latLngBounds(this._drawStart, snappedEnd);
    this._editLayer.removeLayer(this._drawRect);
    this._drawRect = null;
    this._drawStart = null;

    const ts = this._currentTileSize;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    if (Math.abs(ne.lng - sw.lng) < ts && Math.abs(ne.lat - sw.lat) < ts) return;

    // Pixel bounds (already grid-snapped): lng = x, lat = -y
    const pixelBounds: BoundsPx = [
      [sw.lng, -ne.lat],
      [ne.lng, -sw.lat],
    ];

    this._pushUndo();
    const newTrigger: TriggerDef = {
      id: this._generateId(),
      bounds: pixelBounds,
      target: '',
      label: { en: '', zh: '', ja: '' },
    };
    this._triggers.push(newTrigger);
    this._selectedId = newTrigger.id;
    this._renderEditTriggers();
    this._showTriggerForm(newTrigger);
    this._notifyChange();
  }

  // ─── Undo / Redo ────────────────────────────────────────────

  private _onKeyDown(e: KeyboardEvent): void {
    if (!this._active || !e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === 'z') {
      if (e.shiftKey) this._redoAction();
      else this._undoAction();
      e.preventDefault();
    } else if (k === 'y') {
      this._redoAction();
      e.preventDefault();
    }
  }

  private _snapshot(): TriggerDef[] {
    return this._triggers.map(t => this._cloneTrigger(t));
  }

  private _cloneTrigger(t: TriggerDef): TriggerDef {
    return {
      ...t,
      bounds: [[t.bounds[0][0], t.bounds[0][1]], [t.bounds[1][0], t.bounds[1][1]]],
      label: { ...t.label },
    };
  }

  private _pushUndo(): void {
    this._undo.push(this._snapshot());
    this._redo = [];
    this._capUndo();
  }

  private _capUndo(): void {
    if (this._undo.length > 50) this._undo.shift();
  }

  private _undoAction(): void {
    if (!this._undo.length) return;
    this._redo.push(this._snapshot());
    this._triggers = this._undo.pop()!;
    this._selectedId = null;
    this._renderEditTriggers();
    this._resetForm();
    this._notifyChange();
  }

  private _redoAction(): void {
    if (!this._redo.length) return;
    this._undo.push(this._snapshot());
    this._triggers = this._redo.pop()!;
    this._selectedId = null;
    this._renderEditTriggers();
    this._resetForm();
    this._notifyChange();
  }

  // ─── Rendering ──────────────────────────────────────────────

  private _renderEditTriggers(): void {
    this._editLayer.clearLayers();
    this._handleLayer.clearLayers();
    // keep the in-progress draw rectangle if present
    if (this._drawRect) this._editLayer.addLayer(this._drawRect);

    for (const trigger of this._triggers) {
      const bounds: L.LatLngBoundsExpression = [
        this._pxToLatLng(trigger.bounds[0]),
        this._pxToLatLng(trigger.bounds[1]),
      ];
      const selected = trigger.id === this._selectedId;
      const rect = L.rectangle(bounds, {
        ...(selected ? this._selectedStyle : this._editStyle),
        className: 'trigger-edit-rect',
      });
      const label = i18n.localize(trigger.label) || trigger.id;
      rect.bindTooltip(label, { sticky: true, direction: 'top' });

      rect.on('mousedown', (e: L.LeafletMouseEvent) => {
        if (!this._active || (e.originalEvent as MouseEvent).button !== 0) return;
        L.DomEvent.stop(e.originalEvent);
        this._mode = 'move';
        this._dragTrigger = trigger;
        this._dragStartLatLng = this._snapToGrid(e.latlng);
        this._dragOrigBounds = [[...trigger.bounds[0]], [...trigger.bounds[1]]];
        this._preDrag = this._snapshot();
        this._dirtied = false;
        this._selectedId = trigger.id;
        this._renderEditTriggers();
      });
      rect.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stop(e);
        this._selectTrigger(trigger);
      });

      this._editLayer.addLayer(rect);
    }

    const sel = this._triggers.find(t => t.id === this._selectedId);
    if (sel) this._renderHandles(sel);
  }

  private _renderHandles(trigger: TriggerDef): void {
    const [[x1, y1], [x2, y2]] = this._normBounds(trigger.bounds);
    const corners: [number, number][] = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
    corners.forEach((pt, i) => {
      const handle = L.circleMarker(this._pxToLatLng(pt), {
        className: 'trigger-handle',
        radius: 5,
        color: '#ffffff',
        weight: 2,
        fillColor: '#ffc107',
        fillOpacity: 1,
        interactive: true,
      });
      handle.on('mousedown', (e: L.LeafletMouseEvent) => {
        if (!this._active || (e.originalEvent as MouseEvent).button !== 0) return;
        L.DomEvent.stop(e.originalEvent);
        this._mode = 'resize';
        this._resizeCorner = i;
        this._dragTrigger = trigger;
        this._dragOrigBounds = this._normBounds(trigger.bounds);
        this._preDrag = this._snapshot();
        this._dirtied = false;
      });
      this._handleLayer.addLayer(handle);
    });
  }

  private _selectTrigger(trigger: TriggerDef): void {
    this._selectedId = trigger.id;
    this._renderEditTriggers();
    this._showTriggerForm(trigger);
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

  /** Clear the form area (the panel already shows the instructions above it). */
  private _resetForm(): void {
    const formArea = this._panelEl?.querySelector('.editor-form-area');
    if (formArea) formArea.innerHTML = '';
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

    formArea.querySelector('.btn-save')!.addEventListener('click', () => {
      const targetSelect = formArea.querySelector('[data-field="target"]') as HTMLSelectElement;
      const labelEn = (formArea.querySelector('[data-field="label_en"]') as HTMLInputElement).value;
      const labelZh = (formArea.querySelector('[data-field="label_zh"]') as HTMLInputElement).value;
      const labelJa = (formArea.querySelector('[data-field="label_ja"]') as HTMLInputElement).value;

      this._pushUndo();
      trigger.target = targetSelect.value;
      trigger.label = { en: labelEn, zh: labelZh, ja: labelJa };

      this._renderEditTriggers();
      this._resetForm();
      this._notifyChange();
    });

    formArea.querySelector('.btn-delete')!.addEventListener('click', () => {
      this._pushUndo();
      this._triggers = this._triggers.filter(t => t.id !== trigger.id);
      this._selectedId = null;
      this._renderEditTriggers();
      this._resetForm();
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
