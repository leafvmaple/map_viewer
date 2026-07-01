import 'leaflet/dist/leaflet.css';
import { GameLoader } from './core/GameLoader.js';
import { MapViewer } from './core/MapViewer.js';
import { NavigationStack } from './core/NavigationStack.js';
import { TriggerEditor } from './editor/TriggerEditor.js';
import { Sidebar } from './ui/Sidebar.js';
import { Breadcrumb } from './ui/Breadcrumb.js';
import { Toolbar } from './ui/Toolbar.js';
import { TriggerStorage } from './core/TriggerStorage.js';
import { MapConfigStorage } from './core/MapConfigStorage.js';
import { i18n } from './i18n/index.js';
import type { GameConfig, LangCode, LocalizedString, MapConfig, TriggerDef, ViewState } from './types';

// ─── Application State ─────────────────────────────────────

const gameLoader = new GameLoader();
const navStack = new NavigationStack();
const lastView = new Map<string, ViewState>();

let currentGameConfig: GameConfig | null = null;
let mapViewer: MapViewer;
let triggerEditor: TriggerEditor;
let sidebar: Sidebar;
let breadcrumb: Breadcrumb;
let toolbar: Toolbar;

// ─── Bootstrap ──────────────────────────────────────────────

async function init(): Promise<void> {
  // Initialize UI components
  sidebar = new Sidebar(document.getElementById('sidebar')!, {
    onGameSelect: handleGameSelect,
    onMapSelect: handleMapSelect,
    onToggle: handleSidebarToggle,
    onMapRename: handleMapRename,
    onMapAdd: handleMapAdd,
  });

  breadcrumb = new Breadcrumb(document.getElementById('breadcrumb')!, {
    onNavigate: handleBreadcrumbNavigate,
  });

  mapViewer = new MapViewer('map', {
    onTriggerClick: handleTriggerClick,
    onMapLoaded: handleMapLoaded,
  });

  triggerEditor = new TriggerEditor(mapViewer.leafletMap, {
    onTriggersChanged: handleTriggersChanged,
  });

  toolbar = new Toolbar(document.getElementById('toolbar')!, {
    onLanguageChange: handleLanguageChange,
    onTriggersToggle: () => mapViewer.triggerLayer.toggle(),
    onLabelsToggle: () =>
      mapViewer.triggerLayer.setLabelsPermanent(!mapViewer.triggerLayer.labelsPermanent),
    onGridToggle: () => mapViewer.toggleGrid(),
    onEditModeToggle: handleEditModeToggle,
    onBack: handleBack,
  });

  // Subscribe to nav stack changes
  navStack.onChange((path) => {
    breadcrumb.update(path);
    toolbar.setBackEnabled(navStack.canGoBack);
  });

  // Subscribe to language changes
  i18n.onChange(() => {
    refreshAllLabels();
  });

  // Load registry and default game
  try {
    const games = await gameLoader.fetchRegistry();
    sidebar.setGames(games);

    // Deep link (URL hash) selects the initial game/map/view when present.
    const target = parseHash();
    if (target && games.some(g => g.id === target.gameId)) {
      await handleGameSelect(target.gameId, target.mapId, target.view);
    } else if (games.length > 0) {
      await handleGameSelect(games[0].id);
    }

    // Keep the URL hash in sync with pan/zoom so links are shareable & survive refresh.
    mapViewer.leafletMap.on('moveend', updateHash);
  } catch (err) {
    console.error('Failed to initialize:', err);
    showError(String(err));
  }
}

// ─── Event Handlers ─────────────────────────────────────────

async function handleGameSelect(gameId: string, initialMapId?: string, initialView?: ViewState): Promise<void> {
  try {
    currentGameConfig = await gameLoader.loadGame(gameId);

    // Merge user-added maps from localStorage
    const addedMaps = MapConfigStorage.loadAddedMaps(gameId);
    for (const [mapId, config] of Object.entries(addedMaps)) {
      if (!currentGameConfig.maps[mapId]) {
        currentGameConfig.maps[mapId] = config;
      }
    }

    // Apply user map renames from localStorage
    const renames = MapConfigStorage.loadRenames(gameId);
    for (const [mapId, name] of Object.entries(renames)) {
      if (currentGameConfig.maps[mapId]) {
        currentGameConfig.maps[mapId].name = { ...currentGameConfig.maps[mapId].name, ...name };
      }
    }

    // Update UI
    const mapList = gameLoader.getMapList(currentGameConfig);
    sidebar.setMaps(mapList);

    // Update game names in sidebar (localized)
    const gameNames = gameLoader.registry.map(g => {
      const config = gameLoader.getCached(g.id);
      return {
        id: g.id,
        name: config ? i18n.localize(config.name) : g.id,
      };
    });
    sidebar.setGameNames(gameNames);

    // Configure MapViewer
    mapViewer.setGameConfig(currentGameConfig, (path) =>
      gameLoader.resolveImagePath(currentGameConfig!, path)
    );

    // Configure editor and breadcrumb
    triggerEditor.setGameConfig(currentGameConfig);
    breadcrumb.setGameConfig(currentGameConfig);

    // Navigate to the requested map (deep link) or the default map
    navStack.clear();
    const startMap = initialMapId && currentGameConfig.maps[initialMapId]
      ? initialMapId
      : currentGameConfig.defaultMap;
    await navigateToMap(gameId, startMap, initialView);
  } catch (err) {
    console.error('Failed to load game:', err);
    showError(String(err));
  }
}

async function handleMapSelect(mapId: string): Promise<void> {
  if (!currentGameConfig) return;
  await navigateToMap(currentGameConfig.id, mapId);
}

function handleTriggerClick(trigger: TriggerDef): void {
  if (triggerEditor.active) return; // Don't navigate in edit mode
  if (!currentGameConfig || !trigger.target) return;
  navigateToMap(currentGameConfig.id, trigger.target);
}

function handleMapLoaded(mapId: string, _mapConfig: unknown): void {
  sidebar.setActiveMap(mapId);

  if (currentGameConfig) {
    const mapConfig = currentGameConfig.maps[mapId];
    if (mapConfig) {
      // Load trigger overrides from localStorage (if any), otherwise use game.json defaults
      const saved = TriggerStorage.load(currentGameConfig.id, mapId);
      const triggers = saved ?? (mapConfig.triggers ?? []);

      // Sync overrides into in-memory config so everything stays consistent
      if (saved) {
        mapConfig.triggers = saved;
        // Also refresh the display layer with saved data
        mapViewer.triggerLayer.setTriggers(saved);
      }

      triggerEditor.setCurrentMap(mapId, triggers, mapConfig.tileSize);
    }
  }
}

function handleBreadcrumbNavigate(index: number): void {
  saveCurrentView();
  const entry = navStack.goTo(index);
  if (entry && currentGameConfig) {
    mapViewer.loadMap(entry.mapId, entry.viewState);
    sidebar.setActiveMap(entry.mapId);
  }
}

function handleBack(): void {
  saveCurrentView();
  const entry = navStack.back();
  if (entry && currentGameConfig) {
    mapViewer.loadMap(entry.mapId, entry.viewState);
    sidebar.setActiveMap(entry.mapId);
  }
}

function handleLanguageChange(lang: LangCode): void {
  i18n.lang = lang;
}

function handleEditModeToggle(): boolean {
  const active = triggerEditor.toggle();
  // Hide normal trigger layer during edit mode to avoid visual overlap
  mapViewer.triggerLayer.setVisible(!active);
  return active;
}

function handleSidebarToggle(_collapsed: boolean): void {
  // Let the CSS transition finish, then tell Leaflet to re-measure
  setTimeout(() => mapViewer.invalidateSize(), 300);
}

function handleTriggersChanged(triggers: TriggerDef[]): void {
  if (!currentGameConfig || !mapViewer.currentMapId) return;

  const gameId = currentGameConfig.id;
  const mapId = mapViewer.currentMapId;

  // Sync to in-memory config
  if (currentGameConfig.maps[mapId]) {
    currentGameConfig.maps[mapId].triggers = [...triggers];
  }

  // Persist to localStorage
  TriggerStorage.save(gameId, mapId, triggers);

  // Update the visible trigger layer (will show when edit mode exits)
  mapViewer.triggerLayer.setTriggers(triggers);
}

// ─── Map Rename & Add ───────────────────────────────────────

function handleMapRename(mapId: string, name: LocalizedString): void {
  if (!currentGameConfig) return;
  const gameId = currentGameConfig.id;
  const mapConfig = currentGameConfig.maps[mapId];
  if (!mapConfig) return;

  // Merge new name into existing (preserve other languages)
  const merged = { ...mapConfig.name, ...name };
  mapConfig.name = merged;

  // Persist to localStorage
  MapConfigStorage.renameMap(gameId, mapId, merged);

  // Refresh sidebar map list
  sidebar.setMaps(gameLoader.getMapList(currentGameConfig));
  if (mapViewer.currentMapId) {
    sidebar.setActiveMap(mapViewer.currentMapId);
  }
}

function handleMapAdd(mapId: string, name: LocalizedString, imagePath: string): void {
  if (!currentGameConfig) return;
  const gameId = currentGameConfig.id;

  // Build new MapConfig
  const newMap: MapConfig = {
    name,
    type: 'image',
    image: imagePath,
    tileSize: 16,
    triggers: [],
  };

  // Add to in-memory config
  currentGameConfig.maps[mapId] = newMap;

  // Persist to localStorage
  MapConfigStorage.addMap(gameId, mapId, newMap);

  // Refresh sidebar
  sidebar.setMaps(gameLoader.getMapList(currentGameConfig));
  if (mapViewer.currentMapId) {
    sidebar.setActiveMap(mapViewer.currentMapId);
  }
}

// ─── Navigation ─────────────────────────────────────────────

function viewKey(gameId: string, mapId: string): string {
  return `${gameId}/${mapId}`;
}

/** Persist the current map's view — to the nav stack and the per-map cache. */
function saveCurrentView(): void {
  if (!currentGameConfig || !mapViewer.currentMapId) return;
  const vs = mapViewer.getViewState();
  navStack.saveViewState(vs);
  lastView.set(viewKey(currentGameConfig.id, mapViewer.currentMapId), vs);
}

async function navigateToMap(gameId: string, mapId: string, viewState?: ViewState): Promise<void> {
  saveCurrentView(); // remember where we were on the map we're leaving

  // World map is always the root — reset stack when navigating back to it
  if (currentGameConfig && mapId === currentGameConfig.defaultMap) {
    navStack.clear();
  }
  navStack.push(gameId, mapId);

  // Restore this map's last view when the caller didn't pass one (first visit → fitBounds).
  const view = viewState ?? lastView.get(viewKey(gameId, mapId));
  await mapViewer.loadMap(mapId, view);
  updateHash();
}

// ─── URL Deep Link (hash routing) ───────────────────────────

interface HashTarget {
  gameId: string;
  mapId: string;
  view?: ViewState;
}

let lastHash = '';

/** Parse `#gameId/mapId@lat,lng,zoom` from the URL, or null if absent/invalid. */
function parseHash(): HashTarget | null {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return null;
  const m = raw.match(/^([^/]+)\/([^@]+)(?:@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?))?$/);
  if (!m) return null;
  const [, gameId, mapId, lat, lng, zoom] = m;
  const view: ViewState | undefined = lat != null
    ? { center: [parseFloat(lat), parseFloat(lng)] as [number, number], zoom: parseFloat(zoom) }
    : undefined;
  return { gameId: decodeURIComponent(gameId), mapId: decodeURIComponent(mapId), view };
}

/** Write the current game/map/view into the URL hash (shareable, refresh-safe). */
function updateHash(): void {
  if (!currentGameConfig || !mapViewer?.currentMapId) return;
  const vs = mapViewer.getViewState();
  const g = encodeURIComponent(currentGameConfig.id);
  const mp = encodeURIComponent(mapViewer.currentMapId);
  const hash = `#${g}/${mp}@${vs.center[0].toFixed(1)},${vs.center[1].toFixed(1)},${vs.zoom.toFixed(2)}`;
  if (hash === lastHash) return;
  lastHash = hash;
  history.replaceState(null, '', hash);
}

// ─── Language Refresh ───────────────────────────────────────

function refreshAllLabels(): void {
  sidebar.refreshLabels();
  breadcrumb.refreshLabels(navStack.path);
  toolbar.refreshLabels();
  mapViewer.triggerLayer.refreshLabels();
  mapViewer.refreshCoordLabel();

  // Refresh game names
  if (currentGameConfig) {
    const gameNames = gameLoader.registry.map(g => {
      const config = gameLoader.getCached(g.id);
      return {
        id: g.id,
        name: config ? i18n.localize(config.name) : g.id,
      };
    });
    sidebar.setGameNames(gameNames);
    sidebar.setMaps(gameLoader.getMapList(currentGameConfig));
  }
}

// ─── Error Display ──────────────────────────────────────────

function showError(message: string): void {
  const mapEl = document.getElementById('map');
  if (mapEl) {
    const overlay = document.createElement('div');
    overlay.className = 'map-loading';
    overlay.textContent = `${i18n.t('map.error')}: ${message}`;
    mapEl.appendChild(overlay);
    setTimeout(() => overlay.remove(), 5000);
  }
}

// ─── Start ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
