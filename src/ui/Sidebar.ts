import { i18n } from '../i18n/index.js';
import { escapeHtml } from '../utils.js';
import { floorLabel } from '../core/Floors.js';
import type { LocalizedString, MapJumpDef, MapListItem, RegistryEntry } from '../types';

interface SidebarOptions {
  onGameSelect: (gameId: string) => void;
  onMapSelect: (mapId: string) => void;
  onToggle: (collapsed: boolean) => void;
  onMapRename: (mapId: string, name: LocalizedString) => void;
  onMapAdd: (mapId: string, name: LocalizedString, imagePath: string) => void;
  onJumpSelect?: (target: string) => void | Promise<void>;
  /** A POI search result was clicked: jump to it on its map. */
  onPoiSelect?: (mapId: string, poiId: string) => void;
  /** A service/shop search result was clicked: open its detail panel. */
  onServiceSelect?: (serviceId: string) => void;
}

/** One row in the sidebar's item-search results. */
export interface PoiSearchRow {
  mapId: string;
  poiId: string;
  kind: string;
  name: string;
  mapName: string;
}

/** One row in the sidebar's service/shop search results. */
export interface ServiceSearchRow {
  serviceId: string;
  kind: string;
  name: string;
  detail?: string;
}

/**
 * Sidebar - Left panel with game selector, searchable map list,
 * inline rename (double-click), and add-map dialog.
 */
export class Sidebar {
  private _el: HTMLElement;
  private _collapsed = false;
  private _options: SidebarOptions;
  private _mapListEl!: HTMLElement;
  private _searchEl!: HTMLInputElement;
  private _gameSelectEl!: HTMLSelectElement;
  private _toggleBtn!: HTMLButtonElement;
  private _addMapBtn!: HTMLButtonElement;
  private _addMapDialog!: HTMLElement;
  private _mapItems: MapListItem[] = [];
  private _jumpItems: MapJumpDef[] = [];
  private _currentMapId: string | null = null;
  /** Set of map IDs that already exist (for duplicate check in add dialog). */
  private _existingMapIds = new Set<string>();
  /** Game-wide item search (provided by main once the game is loaded). */
  private _poiSearcher: ((query: string) => PoiSearchRow[]) | null = null;
  /** Game-wide shop/service search (provided by main once the game is loaded). */
  private _serviceSearcher: ((query: string) => ServiceSearchRow[]) | null = null;
  private _poiResultsEl!: HTMLElement;
  private _serviceResultsEl!: HTMLElement;
  private _jumpListEl!: HTMLElement;

  constructor(container: HTMLElement, options: SidebarOptions) {
    this._el = container;
    this._options = options;
    this._render();
  }

  private _render(): void {
    this._el.className = 'sidebar';
    this._el.innerHTML = `
      <div class="sidebar-header">
        <h2 class="sidebar-title">${i18n.t('sidebar.title')}</h2>
        <button class="sidebar-toggle" title="${i18n.t('sidebar.collapse')}">◀</button>
      </div>
      <div class="sidebar-body">
        <div class="sidebar-section">
          <label class="sidebar-label">${i18n.t('sidebar.selectGame')}</label>
          <select class="sidebar-game-select"></select>
        </div>
        <div class="sidebar-section sidebar-search-row">
          <input class="sidebar-search" type="text" placeholder="${i18n.t('sidebar.searchPlaceholder')}" />
          <button class="sidebar-add-map-btn" title="${i18n.t('sidebar.addMap')}">＋</button>
        </div>
        <div class="sidebar-add-map-dialog" style="display:none;"></div>
        <div class="sidebar-poi-results" style="display:none;"></div>
        <div class="sidebar-service-results" style="display:none;"></div>
        <div class="sidebar-jump-list" style="display:none;"></div>
        <div class="sidebar-map-list"></div>
      </div>
    `;

    this._toggleBtn = this._el.querySelector('.sidebar-toggle')!;
    this._gameSelectEl = this._el.querySelector('.sidebar-game-select')!;
    this._searchEl = this._el.querySelector('.sidebar-search')!;
    this._mapListEl = this._el.querySelector('.sidebar-map-list')!;
    this._addMapBtn = this._el.querySelector('.sidebar-add-map-btn')!;
    this._addMapDialog = this._el.querySelector('.sidebar-add-map-dialog')!;
    this._poiResultsEl = this._el.querySelector('.sidebar-poi-results')!;
    this._serviceResultsEl = this._el.querySelector('.sidebar-service-results')!;
    this._jumpListEl = this._el.querySelector('.sidebar-jump-list')!;

    this._poiResultsEl.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.poi-result');
      if (row?.dataset.mapId && row.dataset.poiId) {
        this._options.onPoiSelect?.(row.dataset.mapId, row.dataset.poiId);
      }
    });
    this._serviceResultsEl.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.service-result');
      if (row?.dataset.serviceId) {
        this._options.onServiceSelect?.(row.dataset.serviceId);
      }
    });
    this._jumpListEl.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('.jump-result');
      if (row?.dataset.target) void this._options.onJumpSelect?.(row.dataset.target);
    });

    this._toggleBtn.addEventListener('click', () => this.toggle());
    this._gameSelectEl.addEventListener('change', () => {
      this._options.onGameSelect(this._gameSelectEl.value);
    });
    this._searchEl.addEventListener('input', () => this._filterMaps());
    this._addMapBtn.addEventListener('click', () => this._showAddMapDialog());

    // Delegated events for the map list: two listeners total instead of two per
    // row (the list re-renders on every search keystroke / rename / language change).
    this._mapListEl.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.map-rename-input')) return; // renaming
      const item = (e.target as HTMLElement).closest<HTMLElement>('.map-list-item');
      if (item?.dataset.mapId) this._options.onMapSelect(item.dataset.mapId);
    });
    this._mapListEl.addEventListener('dblclick', (e) => {
      const nameEl = (e.target as HTMLElement).closest<HTMLElement>('.map-list-name');
      const item = nameEl?.closest<HTMLElement>('.map-list-item');
      if (!nameEl || !item?.dataset.mapId) return;
      if (nameEl.querySelector('.map-rename-input')) return; // already renaming
      e.stopPropagation();
      this._startRename(nameEl, item.dataset.mapId, nameEl.textContent ?? item.dataset.mapId);
    });
  }

  // ─── Add Map Dialog ──────────────────────────────────────

  private _showAddMapDialog(): void {
    this._addMapDialog.style.display = 'block';
    this._addMapDialog.innerHTML = `
      <div class="add-map-form">
        <h4 class="add-map-title">${i18n.t('sidebar.addMapTitle')}</h4>
        <div class="form-group">
          <label>${i18n.t('sidebar.mapId')}</label>
          <input class="form-input add-map-id" type="text" placeholder="${i18n.t('sidebar.mapIdPlaceholder')}" />
        </div>
        <div class="form-group">
          <label>${i18n.t('sidebar.mapName')}</label>
          <input class="form-input add-map-name" type="text" placeholder="${i18n.t('sidebar.mapName')}" />
        </div>
        <div class="form-group">
          <label>${i18n.t('sidebar.imagePath')}</label>
          <input class="form-input add-map-image" type="text" value="scene_maps/" placeholder="scene_maps/map_XX.png" />
        </div>
        <div class="add-map-error" style="display:none;"></div>
        <div class="form-actions">
          <button class="btn btn-save add-map-confirm">${i18n.t('sidebar.add')}</button>
          <button class="btn add-map-cancel">${i18n.t('sidebar.cancel')}</button>
        </div>
      </div>
    `;

    const idInput = this._addMapDialog.querySelector('.add-map-id') as HTMLInputElement;
    const nameInput = this._addMapDialog.querySelector('.add-map-name') as HTMLInputElement;
    const imageInput = this._addMapDialog.querySelector('.add-map-image') as HTMLInputElement;
    const errorEl = this._addMapDialog.querySelector('.add-map-error') as HTMLElement;

    // Auto-fill image path when typing map ID
    idInput.addEventListener('input', () => {
      const id = idInput.value.trim();
      if (id && !imageInput.dataset.userEdited) {
        imageInput.value = `scene_maps/${id}.png`;
      }
    });
    imageInput.addEventListener('input', () => {
      imageInput.dataset.userEdited = 'true';
    });

    this._addMapDialog.querySelector('.add-map-confirm')!.addEventListener('click', () => {
      const mapId = idInput.value.trim();
      const mapName = nameInput.value.trim();
      const imagePath = imageInput.value.trim();

      // Validate
      if (!mapId) {
        errorEl.textContent = i18n.t('sidebar.mapIdRequired');
        errorEl.style.display = 'block';
        return;
      }
      if (this._existingMapIds.has(mapId)) {
        errorEl.textContent = i18n.t('sidebar.mapExists');
        errorEl.style.display = 'block';
        return;
      }

      const name: LocalizedString = { [i18n.lang]: mapName || mapId };
      this._options.onMapAdd(mapId, name, imagePath || `scene_maps/${mapId}.png`);
      this._hideAddMapDialog();
    });

    this._addMapDialog.querySelector('.add-map-cancel')!.addEventListener('click', () => {
      this._hideAddMapDialog();
    });

    // Focus the ID input
    idInput.focus();
  }

  private _hideAddMapDialog(): void {
    this._addMapDialog.style.display = 'none';
    this._addMapDialog.innerHTML = '';
  }

  // ─── Inline Rename ───────────────────────────────────────

  private _startRename(el: HTMLElement, mapId: string, currentName: string): void {
    // Create an inline input replacing the name text
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'map-rename-input';
    input.value = currentName;

    const originalText = el.textContent ?? '';
    el.textContent = '';
    el.appendChild(input);
    input.focus();
    input.select();

    const commit = () => {
      const newName = input.value.trim();
      if (newName && newName !== originalText) {
        // Build LocalizedString: set the current language
        const name: LocalizedString = { [i18n.lang]: newName };
        this._options.onMapRename(mapId, name);
        el.textContent = newName;
      } else {
        el.textContent = originalText;
      }
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur(); // triggers commit via blur
      } else if (e.key === 'Escape') {
        // Cancel: restore original without committing
        input.removeEventListener('blur', commit);
        el.textContent = originalText;
      }
    });
  }

  // ─── Public API ──────────────────────────────────────────

  /** Populate the game dropdown. */
  setGames(games: RegistryEntry[], currentGameId?: string): void {
    this._gameSelectEl.innerHTML = games
      .map(g => `<option value="${escapeHtml(g.id)}" ${g.id === currentGameId ? 'selected' : ''}>${escapeHtml(g.id)}</option>`)
      .join('');
  }

  /**
   * Update game options to show localized names. Pass `currentGameId` to set the
   * selection explicitly (deep links can load a game the dropdown never clicked).
   */
  setGameNames(games: Array<{ id: string; name: string }>, currentGameId?: string): void {
    const selectedId = currentGameId ?? this._gameSelectEl.value;
    this._gameSelectEl.innerHTML = games
      .map(g => `<option value="${escapeHtml(g.id)}" ${g.id === selectedId ? 'selected' : ''}>${escapeHtml(g.name)}</option>`)
      .join('');
  }

  /** Populate the map list for the current game. */
  setMaps(maps: MapListItem[]): void {
    this._mapItems = maps;
    this._existingMapIds = new Set(maps.map(m => m.id));
    this._renderMapList(maps);
  }

  /** Highlight the currently active map. */
  setActiveMap(mapId: string): void {
    this._currentMapId = mapId;
    this._mapListEl.querySelectorAll('.map-list-item').forEach(el => {
      const id = (el as HTMLElement).dataset.mapId;
      el.classList.toggle('active', id === mapId);
    });
    const active = Array.from(this._mapListEl.querySelectorAll<HTMLElement>('.map-list-item'))
      .find(item => item.dataset.mapId === mapId);
    const group = active?.closest<HTMLDetailsElement>('.map-list-floor-group');
    if (group) group.open = true;
    active?.scrollIntoView({ block: 'nearest' });
  }

  /** Show the active map's non-spatial jump list. */
  setJumps(jumps: MapJumpDef[]): void {
    this._jumpItems = jumps;
    this._renderJumpList();
  }

  private _renderMapList(maps: MapListItem[]): void {
    // Clicks/dblclicks are handled by the delegated listeners bound in _render().
    const grouped = new Map<string, MapListItem[]>();
    for (const map of maps) {
      if (map.floorGroup) {
        const members = grouped.get(map.floorGroup) ?? [];
        members.push(map);
        grouped.set(map.floorGroup, members);
      }
    }

    const renderItem = (m: MapListItem, floorChild = false): string => {
        const name = escapeHtml(i18n.localize(m.name));
        const triggerBadge = m.hasTriggers
          ? '<span class="map-badge trigger-badge" title="Has triggers">⚡</span>'
          : '';
        const jumpBadge = m.hasJumps
          ? '<span class="map-badge jump-badge" title="Has jumps">↪</span>'
          : '';
        const active = m.id === this._currentMapId ? 'active' : '';
        const label = floorChild
          ? `<span class="map-floor-label" title="${name}">${escapeHtml(floorLabel(m.floor))}</span>`
          : `<span class="map-list-name" title="${i18n.t('sidebar.renameTip')}">${name}</span>`;
        return `<div class="map-list-item${floorChild ? ' floor-map-item' : ''} ${active}" data-map-id="${escapeHtml(m.id)}">
          ${label}
          <span class="map-list-id">${escapeHtml(m.id)}</span>
          ${triggerBadge}
          ${jumpBadge}
        </div>`;
    };

    const emittedGroups = new Set<string>();
    this._mapListEl.innerHTML = maps.map(map => {
      const members = map.floorGroup ? grouped.get(map.floorGroup) ?? [] : [];
      if (!map.floorGroup || members.length < 2) return renderItem(map);
      if (emittedGroups.has(map.floorGroup)) return '';
      emittedGroups.add(map.floorGroup);

      const ordered = [...members].sort((a, b) => (b.floor ?? 1) - (a.floor ?? 1));
      const floors = ordered.map(member => member.floor ?? 1);
      const range = `${floorLabel(Math.min(...floors))}–${floorLabel(Math.max(...floors))}`;
      const current = members.some(member => member.id === this._currentMapId);
      return `<details class="map-list-floor-group" data-floor-group="${escapeHtml(map.floorGroup)}"${current ? ' open' : ''}>
        <summary class="map-floor-group-summary">
          <span class="map-floor-group-name">${escapeHtml(i18n.localize(members[0].name))}</span>
          <span class="map-floor-range">${escapeHtml(range)}</span>
        </summary>
        <div class="map-floor-members">${ordered.map(member => renderItem(member, true)).join('')}</div>
      </details>`;
    }).join('');
  }

  private _renderJumpList(): void {
    if (this._jumpItems.length === 0) {
      this._jumpListEl.style.display = 'none';
      this._jumpListEl.innerHTML = '';
      return;
    }
    this._jumpListEl.innerHTML = `
      <div class="sidebar-label">${i18n.t('sidebar.jumps')} (${this._jumpItems.length})</div>
      ${this._jumpItems.map((j, idx) => {
        const label = escapeHtml(i18n.localize(j.label) || j.target);
        const kind = j.kind ? `<span class="jump-result-kind">${escapeHtml(j.kind)}</span>` : '';
        return `<div class="jump-result" data-target="${escapeHtml(j.target)}" title="${escapeHtml(j.target)}">
          <span class="jump-result-glyph">↪</span>
          <span class="jump-result-name">${label}</span>
          ${kind}
          <span class="jump-result-index">${idx + 1}</span>
        </div>`;
      }).join('')}
    `;
    this._jumpListEl.style.display = 'block';
  }

  private _filterMaps(): void {
    const query = this._searchEl.value.toLowerCase().trim();
    if (!query) {
      this._renderMapList(this._mapItems);
      this._renderPoiResults([]);
      this._renderServiceResults([]);
      return;
    }
    const filtered = this._mapItems.filter(m => {
      const name = i18n.localize(m.name).toLowerCase();
      return name.includes(query) || m.id.toLowerCase().includes(query);
    });
    this._renderMapList(filtered);
    this._renderPoiResults(this._poiSearcher ? this._poiSearcher(query) : []);
    this._renderServiceResults(this._serviceSearcher ? this._serviceSearcher(query) : []);
  }

  /** Provide the game-wide item searcher (query → matching POIs on any map). */
  setPoiSearcher(searcher: (query: string) => PoiSearchRow[]): void {
    this._poiSearcher = searcher;
  }

  /** Provide the game-wide service/shop searcher (query → matching services). */
  setServiceSearcher(searcher: (query: string) => ServiceSearchRow[]): void {
    this._serviceSearcher = searcher;
  }

  private _renderPoiResults(rows: PoiSearchRow[]): void {
    if (rows.length === 0) {
      this._poiResultsEl.style.display = 'none';
      this._poiResultsEl.innerHTML = '';
      return;
    }
    this._poiResultsEl.innerHTML = `
      <div class="sidebar-label">${i18n.t('sidebar.itemResults')} (${rows.length})</div>
      ${rows.map(r => `<div class="poi-result" data-map-id="${escapeHtml(r.mapId)}" data-poi-id="${escapeHtml(r.poiId)}">
        <span class="poi-result-glyph">${r.kind === 'gold' ? '💰' : r.kind === 'treasure' ? '⭐' : '📍'}</span>
        <span class="poi-result-name">${escapeHtml(r.name)}</span>
        <span class="poi-result-map">${escapeHtml(r.mapName)}</span>
      </div>`).join('')}
    `;
    this._poiResultsEl.style.display = 'block';
  }

  private _renderServiceResults(rows: ServiceSearchRow[]): void {
    if (rows.length === 0) {
      this._serviceResultsEl.style.display = 'none';
      this._serviceResultsEl.innerHTML = '';
      return;
    }
    this._serviceResultsEl.innerHTML = `
      <div class="sidebar-label">${i18n.t('sidebar.serviceResults')} (${rows.length})</div>
      ${rows.map(r => `<div class="service-result" data-service-id="${escapeHtml(r.serviceId)}">
        <span class="service-result-glyph">${r.kind === 'vending' ? '🥫' : r.kind === 'inn' ? '🛏️' : r.kind === 'transport' ? '↕' : '🏪'}</span>
        <span class="service-result-main"><span class="service-result-name">${escapeHtml(r.name)}</span>${r.detail ? `<span class="service-result-detail">${escapeHtml(r.detail)}</span>` : ''}</span>
      </div>`).join('')}
    `;
    this._serviceResultsEl.style.display = 'block';
  }

  /** Toggle sidebar collapsed state. */
  toggle(): void {
    this._collapsed = !this._collapsed;
    this._el.classList.toggle('collapsed', this._collapsed);
    this._toggleBtn.textContent = this._collapsed ? '▶' : '◀';
    this._toggleBtn.title = this._collapsed
      ? i18n.t('sidebar.expand')
      : i18n.t('sidebar.collapse');
    this._options.onToggle(this._collapsed);
  }

  /** Refresh all text after language change. */
  refreshLabels(): void {
    const titleEl = this._el.querySelector('.sidebar-title');
    if (titleEl) titleEl.textContent = i18n.t('sidebar.title');

    const labelEl = this._el.querySelector('.sidebar-label');
    if (labelEl) labelEl.textContent = i18n.t('sidebar.selectGame');

    this._searchEl.placeholder = i18n.t('sidebar.searchPlaceholder');
    this._addMapBtn.title = i18n.t('sidebar.addMap');
    this._filterMaps(); // re-render map list AND item results in the new language
    this._renderJumpList();
  }
}
