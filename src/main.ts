import 'leaflet/dist/leaflet.css';
import { GameLoader } from './core/GameLoader.js';
import { MapViewer } from './core/MapViewer.js';
import { NavigationStack } from './core/NavigationStack.js';
import { TriggerEditor } from './editor/TriggerEditor.js';
import { Sidebar } from './ui/Sidebar.js';
import { Breadcrumb } from './ui/Breadcrumb.js';
import { Toolbar } from './ui/Toolbar.js';
import { TreasureList } from './ui/TreasureList.js';
import { ServicePanel } from './ui/ServicePanel.js';
import { EventPanel } from './ui/EventPanel.js';
import { EncounterPanel } from './ui/EncounterPanel.js';
import { TriggerStorage } from './core/TriggerStorage.js';
import { MapConfigStorage } from './core/MapConfigStorage.js';
import { Prefs } from './core/Prefs.js';
import { parseHash, formatHash } from './core/hashRoute.js';
import { userStore } from './core/UserStore.js';
import { MarkStorage } from './core/MarkStorage.js';
import { interpretSave } from './core/SaveImport.js';
import { buildPoiIndex, searchPois, poiItemName, isMarkable, type PoiIndexEntry } from './core/PoiIndex.js';
import { buildServiceIndex, searchServices, serviceDisplayName, serviceEntryName, type ServiceIndexEntry } from './core/ServiceIndex.js';
import { floorSiblings, floorSwitchViewState } from './core/Floors.js';
import { FloorSwitcher } from './ui/FloorSwitcher.js';
import { UserMenu } from './ui/UserMenu.js';
import { PoiFilter } from './ui/PoiFilter.js';
import { Checklist } from './ui/Checklist.js';
import { i18n } from './i18n/index.js';
import type { GameConfig, LangCode, LocalizedString, MapConfig, PoiDef, TriggerDef, ViewState } from './types';

// ─── Application State ─────────────────────────────────────

const gameLoader = new GameLoader();
const navStack = new NavigationStack();
const lastView = new Map<string, ViewState>();

let currentGameConfig: GameConfig | null = null;
/**
 * The game that owns the map currently DISPLAYED. During a game switch,
 * `currentGameConfig` is already the new game while the old game's map is
 * still on screen — saving views under the new game's key would leak one
 * game's pan/zoom into another.
 */
let displayedGameId: string | null = null;
let mapViewer: MapViewer;
let triggerEditor: TriggerEditor;
let sidebar: Sidebar;
let breadcrumb: Breadcrumb;
let toolbar: Toolbar;
let treasureList: TreasureList;   // current map (top-right, clickable)
let servicePanel: ServicePanel;   // shop/service details (right)
let eventPanel: EventPanel;       // terrain-event toggles (bottom-left)
let encounterPanel: EncounterPanel; // random encounter details (bottom-right)
let userMenu: UserMenu;           // profile switcher (toolbar)
let poiFilter: PoiFilter;         // POI category legend (bottom-left)
let checklist: Checklist;         // game-wide collectible drawer (right)
let floorSwitcher: FloorSwitcher; // building floor pills (top-left)
let versionEl: HTMLDivElement | null = null; // build/data identifier chip (bottom-right)

/** Current game's marked ("collected") POI ids for the CURRENT user. */
let markedPois = new Set<string>();
/** POI kinds the CURRENT user hides on the current game's maps. */
let hiddenKinds = new Set<string>();
/** Whether the CURRENT user hides collected POIs on the map. */
let hideMarked = false;
/** Game-wide POI index (search + checklist), rebuilt per game load. */
let poiIndex: PoiIndexEntry[] = [];
/** Game-wide shop/service index (search + detail panel), rebuilt per game load. */
let serviceIndex: ServiceIndexEntry[] = [];
/** POI the current view is anchored to (kept in the URL hash until we leave its map). */
let currentPoiAnchor: { mapId: string; poiId: string } | null = null;

interface PoiFilterState {
  kinds: string[];
  hideMarked: boolean;
}

/** Read the user's filter state; tolerates the older plain-array format. */
function loadFilterState(gameId: string): { kinds: Set<string>; hideMarked: boolean } {
  const raw = userStore.getItem<string[] | PoiFilterState>(`poi_filters_${gameId}`);
  if (Array.isArray(raw)) return { kinds: new Set(raw), hideMarked: false };
  return { kinds: new Set(raw?.kinds ?? []), hideMarked: raw?.hideMarked ?? false };
}

function saveFilterState(gameId: string): void {
  userStore.setItem(`poi_filters_${gameId}`, { kinds: [...hiddenKinds], hideMarked });
}

// ─── Bootstrap ──────────────────────────────────────────────

async function init(): Promise<void> {
  // Initialize UI components
  sidebar = new Sidebar(document.getElementById('sidebar')!, {
    onGameSelect: handleGameSelect,
    onMapSelect: handleMapSelect,
    onToggle: handleSidebarToggle,
    onMapRename: handleMapRename,
    onMapAdd: handleMapAdd,
    onJumpSelect: handleJumpSelect,
    onPoiSelect: (mapId, poiId) => { void navigateToPoi(mapId, poiId); },
    onServiceSelect: (serviceId) => {
      servicePanel.show(serviceId);
      toolbar.setServicesOpen(true);
    },
  });
  sidebar.setPoiSearcher((query) =>
    searchPois(poiIndex, query, 20).map(entry => ({
      mapId: entry.mapId,
      poiId: entry.poi.id,
      kind: entry.poi.kind,
      name: poiItemName(entry.poi, entry.catalogs ?? entry.items),
      mapName: resolveMapName(entry.mapId),
    })),
  );
  sidebar.setServiceSearcher((query) =>
    searchServices(serviceIndex, query, 20).map(result => ({
      serviceId: result.entry.serviceId,
      kind: result.entry.service.kind,
      name: serviceDisplayName(result.entry.service),
      detail: result.matchedEntry
        ? serviceEntryName(result.matchedEntry, result.entry.items)
        : result.entry.bindings.length > 0
          ? result.entry.bindings.map(binding => resolveMapName(binding.mapId)).join(' / ')
          : i18n.t('service.unbound'),
    })),
  );

  breadcrumb = new Breadcrumb(document.getElementById('breadcrumb')!, {
    onNavigate: handleBreadcrumbNavigate,
  });

  mapViewer = new MapViewer('map', {
    onTriggerClick: handleTriggerClick,
    onTriggerHover: handleTriggerHover,
    onTriggerHoverOut: handleTriggerHoverOut,
    onMapLoaded: handleMapLoaded,
    onImageError: (url) => showError(url),
    onPoiClick: handlePoiClick,
    onEncounterZoneChange: (zone) => encounterPanel?.selectZone(zone),
  });

  encounterPanel = new EncounterPanel(document.getElementById('map')!);

  triggerEditor = new TriggerEditor(mapViewer.leafletMap, {
    onTriggersChanged: handleTriggersChanged,
    // Esc with nothing selected → leave edit mode (keep the toolbar button in sync).
    onExitRequest: () => toolbar.setEditMode(handleEditModeToggle()),
  });

  checklist = new Checklist({
    onNavigate: (mapId, poiId) => { void navigateToPoi(mapId, poiId); },
    onToggleMark: handlePoiToggle,
    isMarked: (poiId) => markedPois.has(poiId),
    resolveMapName,
    onClose: () => toolbar.setChecklistOpen(false),
  });

  toolbar = new Toolbar(document.getElementById('toolbar')!, {
    onLanguageChange: handleLanguageChange,
    onChecklistToggle: () => checklist.toggle(),
    onServicesToggle: () => servicePanel.toggleDirectory(),
    onTriggersToggle: () => mapViewer.triggerLayer.toggle(),
    onLabelsToggle: () =>
      mapViewer.triggerLayer.setLabelsPermanent(!mapViewer.triggerLayer.labelsPermanent),
    onTreasuresToggle: () => {
      const visible = mapViewer.poiLayer.toggle();
      treasureList.setVisible(visible);
      poiFilter.setVisible(visible);
      return visible;
    },
    onEncountersToggle: () => {
      const visible = mapViewer.encounterLayer.toggle();
      encounterPanel.setVisible(visible);
      return visible;
    },
    onGridToggle: () => mapViewer.toggleGrid(),
    onEditModeToggle: handleEditModeToggle,
    onBack: handleBack,
  });

  treasureList = new TreasureList({
    onSelect: (poi) => mapViewer.poiLayer.focusPoi(poi.id),
    onToggleMark: handlePoiToggle,
  });

  servicePanel = new ServicePanel({
    onNavigateToPoi: (mapId, poiId) => { void navigateToPoi(mapId, poiId); },
    onOpen: () => toolbar.setServicesOpen(true),
    onClose: () => toolbar.setServicesOpen(false),
  });

  eventPanel = new EventPanel({
    onToggle: (event, active) => mapViewer.setEventOverlay(event, active),
    onFocus: (event) => mapViewer.focusEvent(event),
  });

  userMenu = new UserMenu(document.getElementById('toolbar')!, { onImportSave: importSaveFile });

  floorSwitcher = new FloorSwitcher({
    onSelect: (mapId) => {
      if (!currentGameConfig) return;
      // Reuse the camera only when both floors share a compatible pixel space.
      const currentMapId = mapViewer.currentMapId;
      const view = currentMapId
        ? floorSwitchViewState(currentGameConfig, currentMapId, mapId, mapViewer.getViewState())
        : undefined;
      void navigateToMap(currentGameConfig.id, mapId, view);
    },
  });

  // Build identifier (bottom-right): app version + build date, and — once a
  // game is loaded — that game's export stamp. Together they answer "is this
  // deployment running the new image AND the fresh data?" at a glance.
  versionEl = document.createElement('div');
  versionEl.className = 'app-version';
  document.getElementById('map')?.appendChild(versionEl);
  updateVersionChip();

  poiFilter = new PoiFilter({
    onChange: (hidden) => {
      hiddenKinds = hidden;
      if (currentGameConfig) saveFilterState(currentGameConfig.id);
      mapViewer.poiLayer.setKindFilter(hidden);
    },
    onHideMarkedChange: (hide) => {
      hideMarked = hide;
      if (currentGameConfig) saveFilterState(currentGameConfig.id);
      mapViewer.poiLayer.setHideMarked(hide);
    },
  });

  // Switching (or importing/creating) a user re-applies everything personal:
  // language, layer toggles, saved views, chest marks, and category filters.
  userStore.onChange(() => {
    loadViews();
    reloadMarks();
    reloadFilters();
    toolbar.syncPrefs();
    applyLayerPrefs();
    i18n.reload(); // notifies (→ refreshAllLabels) only if the language differs
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
    loadViews(); // per-user saved views, before the first navigation
    const games = await gameLoader.fetchRegistry();

    // Deep link (URL hash) selects the initial game/map/view when present.
    const target = parseHash(location.hash);
    const initialGame = target && games.some(g => g.id === target.gameId)
      ? target
      : games.length > 0 ? { gameId: games[0].id, mapId: undefined, view: undefined } : null;

    sidebar.setGames(games, initialGame?.gameId);
    if (initialGame) {
      // replace (not push): the initial URL is already the current history entry.
      await handleGameSelect(initialGame.gameId, initialGame.mapId, initialGame.view, false);
      // POI deep link on first load: pan to and flash the marker.
      if (target?.poi && mapViewer.currentMapId === target.mapId) {
        currentPoiAnchor = { mapId: target.mapId, poiId: target.poi };
        mapViewer.poiLayer.focusPoi(target.poi);
        updateHash();
      }
    }

    // The dropdown shows names straight from the registry. Only configs of
    // games whose registry entry predates the `name` field still need a
    // background fetch — a full-config prefetch would cost megabytes of JSON
    // as the game list grows.
    const unnamed = games.filter(g => !g.name);
    if (unnamed.length > 0) {
      void Promise.allSettled(unnamed.map(g => gameLoader.loadGame(g.id))).then(() => {
        if (currentGameConfig) refreshGameNames(currentGameConfig.id);
      });
    }

    // Keep the URL hash in sync with pan/zoom so links are shareable & survive refresh.
    mapViewer.leafletMap.on('moveend', () => updateHash());
    // Browser back/forward (and manually edited hashes) navigate the app.
    window.addEventListener('hashchange', () => { void applyHashTarget(); });
  } catch (err) {
    console.error('Failed to initialize:', err);
    showError(String(err));
  }
}

// ─── Event Handlers ─────────────────────────────────────────

async function handleGameSelect(
  gameId: string,
  initialMapId?: string,
  initialView?: ViewState,
  pushHistory = true,
): Promise<void> {
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

    // Apply saved trigger edits from localStorage once, up front, so every
    // consumer (viewer, editor, hover previews, export) sees the same data.
    const triggerOverrides = TriggerStorage.loadGame(gameId);
    for (const [mapId, triggers] of Object.entries(triggerOverrides)) {
      if (currentGameConfig.maps[mapId]) {
        currentGameConfig.maps[mapId].triggers = triggers;
      }
    }

    // This game's marks/filters must be in place BEFORE the first loadMap —
    // its initial render reads them (poi ids may collide across games).
    markedPois = MarkStorage.markedIds(gameId);
    const filters = loadFilterState(gameId);
    hiddenKinds = filters.kinds;
    hideMarked = filters.hideMarked;
    mapViewer.poiLayer.setKindFilter(hiddenKinds);
    mapViewer.poiLayer.setHideMarked(hideMarked);

    // Optional external catalogs: item definitions, trainer/party/species facts,
    // and static shop/service lists.
    const catalogs = await gameLoader.loadGameData(currentGameConfig);

    // Game-wide POI index: sidebar item search + the collectible checklist.
    // Build after catalogs load so itemRefs resolve through items.json from the
    // first render/search, not after a second refresh.
    poiIndex = buildPoiIndex(currentGameConfig, catalogs);
    checklist.setEntries(poiIndex);

    serviceIndex = buildServiceIndex(currentGameConfig, catalogs);
    servicePanel.setEntries(serviceIndex);

    // Update UI
    const mapList = gameLoader.getMapList(currentGameConfig);
    sidebar.setMaps(mapList);
    refreshGameNames(gameId);

    // Configure MapViewer
    mapViewer.setGameConfig(
      currentGameConfig,
      (path) => gameLoader.resolveImagePath(currentGameConfig!, path),
      (poiId) => markedPois.has(poiId),
    );
    mapViewer.setCatalogs(catalogs);
    encounterPanel.setCatalogs(
      catalogs,
      (path) => gameLoader.resolveImagePath(currentGameConfig!, path),
    );
    // Item mini-icons in the treasure panel / checklist share the same resolver.
    treasureList.setIconResolver((path) => gameLoader.resolveImagePath(currentGameConfig!, path));
    treasureList.setCatalogs(catalogs);
    checklist.setIconResolver((path) => gameLoader.resolveImagePath(currentGameConfig!, path));
    servicePanel.setIconResolver((path) => gameLoader.resolveImagePath(currentGameConfig!, path));
    // Game-provided POI-kind names/glyphs (legend + checklist).
    poiFilter.setKindMeta(currentGameConfig.poiKinds);
    checklist.setKindMeta(currentGameConfig.poiKinds);
    updateVersionChip(); // reflect this game's export stamp

    // Configure editor and breadcrumb
    triggerEditor.setGameConfig(currentGameConfig);
    breadcrumb.setGameConfig(currentGameConfig);

    // Navigate to the requested map (deep link) or the default map
    navStack.clear();
    const startMap = initialMapId && currentGameConfig.maps[initialMapId]
      ? initialMapId
      : currentGameConfig.defaultMap;
    await navigateToMap(gameId, startMap, initialView, pushHistory);
  } catch (err) {
    console.error('Failed to load game:', err);
    showError(String(err));
  }
}

/** Localized display name of a map in the current game (falls back to the id). */
function resolveMapName(mapId: string): string {
  const mapConfig = currentGameConfig?.maps[mapId];
  return mapConfig ? i18n.localize(mapConfig.name) || mapId : mapId;
}

/** Compose the build-identifier chip: app version/build date, plus the current
 *  game's export stamp (when its producer wrote one) — full detail on hover. */
function updateVersionChip(): void {
  if (!versionEl) return;
  const build = `v${__APP_VERSION__} · ${__BUILD_DATE__.slice(0, 10)}`;
  const stamp = currentGameConfig?.export;
  versionEl.textContent = stamp ? `${build} ⏐ data ${stamp.exportedAt.slice(0, 10)}` : build;
  const detail = [`build ${__BUILD_DATE__}`];
  if (stamp) {
    detail.push(`data ${stamp.exportedAt}`);
    if (stamp.producer) detail.push(stamp.producer);
    if (stamp.rom) detail.push(`rom ${stamp.rom}`);
  }
  versionEl.title = detail.join('\n');
}

/** Sync the sidebar's game dropdown: localized names + the active selection.
 *  Prefers the registry's own `name`; falls back to a loaded config, then id. */
function refreshGameNames(currentGameId: string): void {
  const gameNames = gameLoader.registry.map(g => {
    const name = g.name ?? gameLoader.getCached(g.id)?.name;
    return {
      id: g.id,
      name: name ? i18n.localize(name) : g.id,
    };
  });
  sidebar.setGameNames(gameNames, currentGameId);
}

async function handleMapSelect(mapId: string): Promise<void> {
  if (!currentGameConfig) return;
  // Picking a map from the sidebar list is a direct jump, not a door: start a
  // fresh path instead of pushing onto the door-entry back-stack.
  await navigateToMap(currentGameConfig.id, mapId, undefined, true, true);
}

async function handleJumpSelect(target: string): Promise<void> {
  if (!currentGameConfig || !currentGameConfig.maps[target]) return;
  await navigateToMap(currentGameConfig.id, target);
}

function handleTriggerClick(trigger: TriggerDef): void {
  if (triggerEditor.active) return; // Don't navigate in edit mode
  if (!currentGameConfig || !trigger.target) return;
  if (trigger.kind === 'return' || trigger.target === '__return__') {
    void handleReturnTrigger(trigger);
    return;
  }
  void navigateToTriggerTarget(trigger.target, trigger.focus);
}

/** Navigate through a trigger and apply its arrival point after the target map
 * has established its image bounds/zoom. Same-map doors only move the camera:
 * reloading would lose the arrival focus and create misleading history. */
async function navigateToTriggerTarget(target: string, focus?: [number, number]): Promise<void> {
  if (!currentGameConfig || !currentGameConfig.maps[target]) return;
  const sourceMapId = mapViewer.currentMapId;
  const sourceMapName = sourceMapId ? resolveMapName(sourceMapId) : '';
  currentPoiAnchor = null;
  if (target !== mapViewer.currentMapId) {
    await navigateToMap(currentGameConfig.id, target);
  }
  if (focus && mapViewer.currentMapId === target) {
    mapViewer.focusPixel(focus);
    mapViewer.showArrival(focus, sourceMapName);
    updateHash();
  }
}

async function handleReturnTrigger(trigger: TriggerDef): Promise<void> {
  if (!currentGameConfig) return;
  const candidates = trigger.returnTargets ?? [];
  const path = navStack.path;
  const previous = path.length >= 2 ? path[path.length - 2] : undefined;
  if (previous && (candidates.length === 0 || candidates.some(rt => rt.target === previous.mapId))) {
    await handleBack();
    return;
  }
  if (candidates.length === 1 && currentGameConfig.maps[candidates[0].target]) {
    await navigateToTriggerTarget(candidates[0].target, candidates[0].focus);
    return;
  }
  const names = candidates.map(rt => resolveMapName(rt.target)).join(' / ');
  showError(names ? `返回目标不确定：${names}` : '返回目标不确定');
}

/**
 * Hovering a trigger: hide the current-map chest list so it doesn't collide with
 * the hover card. The card itself (thumbnail + target-map chest list) is rendered
 * by TriggerLayer. Restored on mouse-out.
 */
function handleTriggerHover(_trigger: TriggerDef): void {
  if (triggerEditor.active) return;
  treasureList.setVisible(false);
}

function handleTriggerHoverOut(): void {
  treasureList.setVisible(mapViewer.poiLayer.visible && !triggerEditor.active);
}

function handleMapLoaded(mapId: string, _mapConfig: unknown): void {
  sidebar.setActiveMap(mapId);
  displayedGameId = currentGameConfig?.id ?? null;

  if (currentGameConfig) {
    const mapConfig = currentGameConfig.maps[mapId];
    if (mapConfig) {
      // Saved trigger edits were merged into the config at game load, so
      // mapConfig.triggers is already the authoritative list here.
      triggerEditor.setCurrentMap(mapId, mapConfig.triggers ?? [], mapConfig.tileSize);
      treasureList.setPois(mapConfig.pois ?? [], mapConfig.tileSize ?? 16);
      eventPanel.setEvents(mapConfig.events ?? []);
      sidebar.setJumps((mapConfig.jumps ?? []).filter(j => Boolean(currentGameConfig?.maps[j.target])));
      poiFilter.setPois(mapConfig.pois ?? [], hiddenKinds, hideMarked, markedPois);
      floorSwitcher.setFloors(floorSiblings(currentGameConfig, mapId), mapId);
      reloadMarks();
    }
  }

  // Re-apply persisted layer toggles so they survive a refresh / map change.
  applyLayerPrefs();
}

// ─── Per-user POI marks ─────────────────────────────────────

/** Reload the current user's marks for the current game into all consumers. */
function reloadMarks(): void {
  markedPois = currentGameConfig ? MarkStorage.markedIds(currentGameConfig.id) : new Set();
  mapViewer.poiLayer.setMarks(markedPois);
  treasureList.setMarks(markedPois);
  poiFilter.setMarks(markedPois);
  checklist.refresh();
}

/**
 * Import a battery save into a FRESH profile: parse → confirm → create a
 * carrier user → write the derived marks → refresh. The new user isolates
 * save-derived progress from any hand-tuned profile, exactly as designed.
 */
async function importSaveFile(file: File): Promise<void> {
  if (!currentGameConfig) { alert(i18n.t('save.error.noGame')); return; }
  const game = currentGameConfig;

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    alert(i18n.t('save.error.parse'));
    return;
  }

  const result = interpretSave(game, bytes);
  if (!result.ok) { alert(i18n.t(result.reason ?? 'save.error.parse')); return; }
  if (result.trackable === 0) { alert(i18n.t('save.error.noFlags')); return; }

  const gameName = i18n.localize(game.name);
  const proceed = confirm(i18n.t('save.confirm', {
    marked: result.markedIds.length,
    total: result.trackable,
  }));
  if (!proceed) return;

  // create() switches to the new profile and fires onChange → reloadMarks reads
  // the still-empty namespace; we then write the derived marks and refresh.
  userStore.create(i18n.t('save.userName', { game: gameName }), {
    origin: 'save',
    source: { game: game.id, savedAt: Date.now() },
  });
  MarkStorage.replaceGame(game.id, result.markedIds);
  reloadMarks();
}

/** Map click on a POI: service markers open their shop list; markable POIs toggle state. */
function handlePoiClick(poi: PoiDef): void {
  if (poi.fixedEncounterId) {
    encounterPanel.selectFixedEncounter(poi.fixedEncounterId);
    return;
  }
  if (poi.serviceIds?.length) {
    servicePanel.show(poi.serviceIds[0]);
    toolbar.setServicesOpen(true);
    return;
  }
  handlePoiToggle(poi);
}

/** Toggle a POI's mark: chests collected, trainers/generals defeated (checkbox or non-service map click). */
function handlePoiToggle(poi: PoiDef): void {
  if (!currentGameConfig || triggerEditor.active) return;
  if (!isMarkable(poi)) return;
  MarkStorage.toggle(currentGameConfig.id, poi.id);
  reloadMarks();
}

/** Re-apply the current user's category filter (user switch / import). */
function reloadFilters(): void {
  if (!currentGameConfig) return;
  const filters = loadFilterState(currentGameConfig.id);
  hiddenKinds = filters.kinds;
  hideMarked = filters.hideMarked;
  mapViewer.poiLayer.setKindFilter(hiddenKinds);
  mapViewer.poiLayer.setHideMarked(hideMarked);
  const mapConfig = mapViewer.currentMapId ? currentGameConfig.maps[mapViewer.currentMapId] : null;
  poiFilter.setPois(mapConfig?.pois ?? [], hiddenKinds, hideMarked, markedPois);
}

/** Navigate to a POI's map (if needed), then pan to it, flash it, and anchor the hash. */
async function navigateToPoi(mapId: string, poiId: string): Promise<void> {
  if (!currentGameConfig?.maps[mapId]) return;
  if (mapViewer.currentMapId !== mapId) {
    await navigateToMap(currentGameConfig.id, mapId);
  }
  currentPoiAnchor = { mapId, poiId };
  mapViewer.poiLayer.focusPoi(poiId);
  updateHash(); // append &poi=… (replaces the entry just pushed)
}

/** Sync the live layers to the persisted toggle prefs (see Prefs / Toolbar). */
function applyLayerPrefs(): void {
  const p = Prefs.load();
  // Labels first — toggling permanent labels rebuilds the trigger rectangles.
  mapViewer.triggerLayer.setLabelsPermanent(p.labels);
  mapViewer.triggerLayer.setVisible(!triggerEditor.active && p.triggers);
  mapViewer.poiLayer.setVisible(p.treasures);
  mapViewer.encounterLayer.setVisible(p.encounters);
  encounterPanel.setVisible(p.encounters);
  treasureList.setVisible(p.treasures && !triggerEditor.active);
  poiFilter.setVisible(p.treasures);
  if (p.grid !== mapViewer.gridVisible) mapViewer.toggleGrid();
}

async function handleBreadcrumbNavigate(index: number): Promise<void> {
  saveCurrentView();
  const entry = navStack.goTo(index);
  if (entry && currentGameConfig) {
    pendingPush = true; // in-app navigation → a real browser-history entry
    await loadMapSafe(entry.mapId, entry.viewState);
    sidebar.setActiveMap(entry.mapId);
    updateHash();
  }
}

async function handleBack(): Promise<void> {
  saveCurrentView();
  const entry = navStack.back();
  if (entry && currentGameConfig) {
    pendingPush = true;
    await loadMapSafe(entry.mapId, entry.viewState);
    sidebar.setActiveMap(entry.mapId);
    updateHash();
  }
}

/** loadMap with user-visible error reporting instead of an unhandled rejection. */
async function loadMapSafe(mapId: string, viewState?: ViewState): Promise<void> {
  try {
    await mapViewer.loadMap(mapId, viewState);
  } catch (err) {
    console.error('Failed to load map:', err);
    showError(String(err));
  }
}

function handleLanguageChange(lang: LangCode): void {
  i18n.lang = lang;
}

function handleEditModeToggle(): boolean {
  const active = triggerEditor.toggle();
  // Hide normal trigger layer during edit mode to avoid visual overlap
  mapViewer.triggerLayer.setVisible(!active);
  // Hide the treasure list in edit mode (it shares the right side with the editor panel)
  treasureList.setVisible(!active && mapViewer.poiLayer.visible);
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
  if (!displayedGameId || !mapViewer.currentMapId) return;
  const vs = mapViewer.getViewState();
  navStack.saveViewState(vs);
  lastView.set(viewKey(displayedGameId, mapViewer.currentMapId), vs);
  userStore.setItem('views', Object.fromEntries(lastView));
}

/** Replace the in-memory view cache with the current user's persisted one. */
function loadViews(): void {
  lastView.clear();
  const saved = userStore.getItem<Record<string, ViewState>>('views');
  if (saved) {
    for (const [key, vs] of Object.entries(saved)) lastView.set(key, vs);
  }
}

async function navigateToMap(
  gameId: string,
  mapId: string,
  viewState?: ViewState,
  pushHistory = true,
  resetStack = false,
): Promise<void> {
  saveCurrentView(); // remember where we were on the map we're leaving
  currentPoiAnchor = null; // plain navigation drops any POI anchor

  // Reset the back-stack when this isn't a door step: navigating to the world
  // map (the root), or a direct jump from the sidebar map list (a teleport, not
  // a door). Only door/trigger navigation extends the breadcrumb path.
  if (resetStack || (currentGameConfig && mapId === currentGameConfig.defaultMap)) {
    navStack.clear();
  }
  navStack.push(gameId, mapId);

  // Restore this map's last view when the caller didn't pass one (first visit → fitBounds).
  const view = viewState ?? lastView.get(viewKey(gameId, mapId));
  pendingPush = pushHistory;
  await loadMapSafe(mapId, view);
  updateHash();
}

// ─── URL Deep Link (hash routing + browser history) ────────
//
// Map-to-map navigation PUSHES a history entry (browser back = go back a map);
// pan/zoom only REPLACES the current entry. `pendingPush` bridges the two write
// paths: loadMap's setView fires `moveend` synchronously, so whichever
// updateHash() call runs first consumes the push.

let lastHash = '';
let pendingPush = false;

/** Write the current game/map/view into the URL hash (shareable, refresh-safe). */
function updateHash(): void {
  if (!currentGameConfig || !mapViewer?.currentMapId) return;
  const poi = currentPoiAnchor?.mapId === mapViewer.currentMapId
    ? currentPoiAnchor.poiId
    : undefined;
  const hash = formatHash(currentGameConfig.id, mapViewer.currentMapId, mapViewer.getViewState(), poi);
  const push = pendingPush;
  pendingPush = false;
  if (hash === lastHash) return;
  lastHash = hash;
  if (push) history.pushState(null, '', hash);
  else history.replaceState(null, '', hash);
}

/** React to browser back/forward or a manually edited hash. */
async function applyHashTarget(): Promise<void> {
  const hash = location.hash;
  if (hash === lastHash) return; // echo of our own write
  const target = parseHash(hash);
  if (!target) return;
  lastHash = hash;

  if (!currentGameConfig || target.gameId !== currentGameConfig.id) {
    if (gameLoader.registry.some(g => g.id === target.gameId)) {
      await handleGameSelect(target.gameId, target.mapId, target.view, false);
    }
  } else if (target.mapId !== mapViewer.currentMapId) {
    if (currentGameConfig.maps[target.mapId]) {
      await navigateToMap(target.gameId, target.mapId, target.view, false);
    }
  } else if (target.view) {
    // Same map, different view (e.g. back over a pan boundary).
    mapViewer.restoreViewState(target.view);
  }

  // POI deep link: anchor + flash once the right map is on screen.
  if (target.poi && mapViewer.currentMapId === target.mapId) {
    currentPoiAnchor = { mapId: target.mapId, poiId: target.poi };
    mapViewer.poiLayer.focusPoi(target.poi);
  }
}

// ─── Language Refresh ───────────────────────────────────────

function refreshAllLabels(): void {
  sidebar.refreshLabels();
  breadcrumb.refreshLabels(navStack.path);
  toolbar.refreshLabels();
  userMenu.refreshLabels();
  mapViewer.triggerLayer.refreshLabels();
  mapViewer.poiLayer.refreshLabels();
  treasureList.refreshLabels();
  eventPanel.refreshLabels();
  encounterPanel.refreshLabels();
  servicePanel.refreshLabels();
  poiFilter.refreshLabels();
  checklist.refreshLabels();
  mapViewer.refreshCoordLabel();

  // Refresh game names
  if (currentGameConfig) {
    refreshGameNames(currentGameConfig.id);
    sidebar.setMaps(gameLoader.getMapList(currentGameConfig));
    if (mapViewer.currentMapId) sidebar.setActiveMap(mapViewer.currentMapId);
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
