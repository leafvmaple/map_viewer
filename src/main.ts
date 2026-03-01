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

    if (games.length > 0) {
      await handleGameSelect(games[0].id);
    }
  } catch (err) {
    console.error('Failed to initialize:', err);
    showError(String(err));
  }
}

// ─── Event Handlers ─────────────────────────────────────────

async function handleGameSelect(gameId: string): Promise<void> {
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
      const config = gameLoader['_cache'].get(g.id) as GameConfig | undefined;
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

    // Navigate to default map
    navStack.clear();
    await navigateToMap(gameId, currentGameConfig.defaultMap);
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
  // Save current view state before leaving
  if (navStack.current) {
    navStack.saveViewState(mapViewer.getViewState());
  }
  const entry = navStack.goTo(index);
  if (entry && currentGameConfig) {
    mapViewer.loadMap(entry.mapId, entry.viewState);
    sidebar.setActiveMap(entry.mapId);
  }
}

function handleBack(): void {
  // Save current view state before leaving
  if (navStack.current) {
    navStack.saveViewState(mapViewer.getViewState());
  }
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

async function navigateToMap(gameId: string, mapId: string): Promise<void> {
  // Save current view state before leaving
  if (navStack.current) {
    navStack.saveViewState(mapViewer.getViewState());
  }

  // World map is always the root — reset stack when navigating back to it
  if (currentGameConfig && mapId === currentGameConfig.defaultMap) {
    navStack.clear();
  }
  navStack.push(gameId, mapId);
  await mapViewer.loadMap(mapId);
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
      const config = gameLoader['_cache'].get(g.id) as GameConfig | undefined;
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
