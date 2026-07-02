# Game Map Viewer

An interactive, zoomable viewer for game maps extracted from retro (NES/FC) ROMs.
Maps are linked to each other by **triggers** (doors / exits / warps): click a
trigger to travel to the target map, with breadcrumb + back-stack navigation. A
built-in **editor** lets you draw and correct triggers and export a fixed
`game.json`.

The map data is produced by the sibling project [`nes_decoder`](../nes_decoder),
which extracts the images and generates `game.json` directly from the ROM. The
interface between the two projects is documented in **[CONTRACT.md](CONTRACT.md)**.

Game data is **not tracked in git** — `res/` and `public/games/registry.json` are
generated locally by `nes_decoder` (and mounted from the NAS in production, see
[DEPLOY.md](DEPLOY.md)). Games so far: **Metal Max** (重装机兵), **Tenchi wo Kurau II**
(吞食天地II 诸葛孔明传), **Pokémon FireRed/LeafGreen** (宝可梦 火红/叶绿).

## Features

- 🗺️ Pixel-accurate map rendering on Leaflet (`CRS.Simple`), smooth zoom, nearest-neighbour scaling.
- ⚡ **Triggers** — clickable zones that navigate between maps, with hover tooltips.
- 🧭 Navigation stack + breadcrumb; each level remembers its zoom & center.
- ✏️ **Trigger editor** — drag to draw (snaps to the tile grid), set target/label, export `game.json` or a single map's triggers.
- 🌐 Trilingual UI (English / 中文 / 日本語) with per-game/-map localized names.
- 🔍 Searchable map list, inline rename (double-click), add-map dialog.
- 🟦 Optional tile grid overlay and a live pixel-coordinate readout.
- 💾 Edits (triggers, renames, added maps) persist in `localStorage` over the read-only base data.
- 🚀 Progressive image loading (low-res placeholder → full image) when the data provides it.
- 🔗 URL hash deep links; map navigation integrates with browser history (back/forward work).
- 👤 **Local user profiles** (no auth — create by name, switch freely): language,
  layer toggles, and per-map views are stored per user, with JSON export/import.
  Map edits stay global.
- ✅ **Collected marks**: click a chest (on the map or in the list) to mark it
  collected for the current user — the marker dims, the list shows `n/total`
  progress, and hover cards grey out collected chests.
- 🗺 **Category legend** (bottom-right): per-kind checkboxes with counts —
  hide trainers / signs / chests independently, persisted per user + game.

## Tech stack

- [Vite 7](https://vite.dev/) + [TypeScript 5](https://www.typescriptlang.org/) (strict).
- [Leaflet 1.9](https://leafletjs.com/) — the only runtime dependency; no UI framework (plain DOM).
- Persistence via `localStorage`; no backend.

## Getting started

```bash
npm install
npm run dev        # start Vite dev server (opens http://localhost:3000)
```

Other scripts:

```bash
npm run typecheck  # tsc --noEmit
npm run build      # type-check + production build to dist/
npm run preview    # preview the production build
npm test           # vitest unit tests (storage, users, marks, i18n, routing)
npm run test:e2e   # Playwright end-to-end suite (starts its own dev server;
                   #   needs local game data + `npx playwright install chromium`)
```

Unit tests also gate the Docker image build (`RUN npm run test` in the
Dockerfile), so a red suite never ships. The E2E suite drives the real app in
headless Chromium — navigation/history, editor interactions, user profiles,
chest marks — and adapts to whatever games are exported locally.

The dev server also serves the `res/` folder statically (see `vite.config.ts`),
so `game.json` and the map images load from `/res/{gameId}/...`.

On a fresh clone there is no game data (it's git-ignored): run an `nes_decoder`
export pointed at this directory — it writes `res/{gameId}/` and
`public/games/registry.json` — or copy both from the NAS data root.

## Project structure

```
src/
  core/
    GameLoader.ts        Fetch/cache registry.json & game.json; resolve image paths; validate the contract
    MapViewer.ts         Leaflet wrapper: image overlay, zoom, grid, coord readout, progressive load
    TriggerLayer.ts      Read-only trigger rectangles + tooltips + click-to-navigate
    NavigationStack.ts   Visited-map history with per-level saved view state
    TriggerStorage.ts    localStorage persistence for trigger edits
    MapConfigStorage.ts  localStorage persistence for added maps & renames
  editor/
    TriggerEditor.ts     Edit mode: draw/select/edit/delete triggers; export JSON
  ui/
    Sidebar.ts           Game picker, searchable map list, rename, add-map dialog
    Toolbar.ts           Language, trigger/grid toggles, edit mode, back
    Breadcrumb.ts        Clickable path navigation
  i18n/                  Tiny i18n (en/zh/ja JSON) + localized-object resolver
  main.ts                Wires all components together (mediator)
  types.ts               Shared types (GameConfig, MapConfig, TriggerDef, …)
schema/                  JSON Schemas for the data contract (see CONTRACT.md)
res/{gameId}/            Per-game data: game.json + world_map/ + scene_maps/  (generated, git-ignored)
public/games/registry.json   Index of available games (generated, git-ignored)
```

## Where the data comes from

The `res/{gameId}/` folders and `public/games/registry.json` are **generated by
`nes_decoder`**, not authored by hand (and therefore git-ignored — regenerate
them from the ROM rather than versioning the output):

```
ROM ─► nes_decoder (decode CHR/metatiles, render PNGs, parse the door table)
    ─► res/{gameId}/{game.json, world_map/*.png, scene_maps/*.png}
    ─► registry.json
map_viewer ─► reads game.json ─► renders maps + triggers in the browser
```

The exact shape of `game.json` / `registry.json` — fields, coordinate system,
invariants, and a copy-paste Python validator for the producer — is specified in
**[CONTRACT.md](CONTRACT.md)** and enforced by the schemas in
[`schema/`](schema/). The viewer also runs soft checks at load time
(`GameLoader._validate`) and logs dangling trigger targets / malformed bounds to
the console.

## Editing triggers

1. Open a map, click **✏ Edit Mode** in the toolbar.
2. **Drag** on the map to draw a new trigger (it snaps to the `tileSize` grid).
3. Click a trigger to set its **target map** and **labels**, or delete it.
4. **Export game.json** (full config) or **Export JSON** (this map's triggers).

Editor shortcuts: hold **Space** to pan the map, **Delete** removes the selected
zone, **Esc** deselects (then exits edit mode), **Ctrl+Z / Ctrl+Y** undo/redo.

Edits are saved to `localStorage` immediately and layered over the base
`game.json`, so they survive refreshes without touching the source files. Feed the
exported `game.json` back into `res/{gameId}/` (or into `nes_decoder`, which
preserves hand-authored names) to make them permanent.

## Notes & limitations

- `type: "tiles"` is declared in the schema but not yet implemented — it falls back to single-image mode.
- Large world maps load as one image; supply `width`/`height`/`thumbnail` in `game.json`
  (see CONTRACT.md) to enable the progressive low-res-first load path.

## Performance roadmap (marker scaling)

Measured baseline (2026-07, Pokémon FRLG world map: 368 markers incl. 164
sprite `<img>`s + 129 trigger paths): pan ~59 fps, zoom ~56 fps, full POI
rebuild 10 ms, no long tasks. Current safeguards: marks apply **incrementally**
(O(changed), not a full rebuild), the first render already includes marks (no
double render), the treasure list updates rows in place, the grid is a single
multi-polyline, and the category legend keeps marker counts down.

Not needed yet — implement when a single map approaches these thresholds:

1. **Viewport culling** (~2 000+ elements on one map). Only add markers inside
   the current view (+ one screen of margin); diff add/remove on `moveend`.
   Game POIs are static and tile-aligned, so a trivial grid-bucket index (or
   even a flat AABB filter — ~1 ms for 5 000 points) suffices. This caps live
   DOM at a few hundred regardless of data size and also fixes Leaflet's
   O(n) per-marker reposition at zoom end. Prefer culling over clustering:
   guide maps need exact positions.
2. **Canvas rendering** (~10 000+ elements, after culling stops being enough).
   First step: a `L.canvas()` renderer for vector layers (trigger rects, hover
   zones) — thousands of paths stop being DOM nodes. Final step: a custom
   canvas marker layer (draw all glyphs/sprites onto one canvas, hit-test via
   the same grid index) — zero marker DOM, but tooltip/click handling must be
   reimplemented, so only do this under real pressure.
3. **Cheap knobs before either**: zoom-threshold display (below zoom X render
   sprites as dots / hide low-priority kinds), and virtualizing the treasure
   list if a map ever lists 1 000+ chests.
