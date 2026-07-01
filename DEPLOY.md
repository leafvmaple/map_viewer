# Deploying map_viewer on the intranet (Docker)

Same model as `vn-resource-vault`: **the image contains only the built frontend;
the game data lives on the NAS and is mounted read-only at runtime.** CI builds
and pushes the image to the Gitea container registry; the NAS just pulls.

```
┌────────────┐  push   ┌──────────────┐  build+push  ┌──────────────────┐
│  git main  │────────▶│ Gitea Actions│─────────────▶│ Gitea registry   │
└────────────┘         └──────────────┘              │ 10.0.0.20:42197  │
                                                      └────────┬─────────┘
                                              compose pull      │
                                          ┌───────────────────▼─────────┐
   browser ──http://<NAS>:42199──▶ nginx │  NAS: docker compose up -d   │
                                          │  /data (ro) ◀── res/ + games/│
                                          └──────────────────────────────┘
```

## Why nginx (not uvicorn like vn-resource-vault)

map_viewer is a **pure static frontend** (Vite build, no backend), so it's served
by nginx. The intranet-critical change was removing the public Leaflet CDN `<link>`
from `index.html` — Leaflet's CSS is already bundled via `import 'leaflet/dist/leaflet.css'`
in `src/main.ts`, so nothing is fetched from the internet.

## NAS data layout

Point `MAP_DATA_ROOT` at a directory laid out exactly like the repo's dev data:

```
<MAP_DATA_ROOT>/
  res/
    metal_max/{game.json, world_map/*.png, scene_maps/*.png}
    tenchi2/{game.json, ...}
  games/
    registry.json
```

The easiest way to produce it: run the `nes_decoder` export with `viewer_root`
pointing at `<MAP_DATA_ROOT>`'s parent (it writes `res/` and `games/registry.json`).

## First deploy (on the NAS)

```sh
cp .env.example .env      # edit MAP_IMAGE + MAP_DATA_ROOT
docker compose pull
docker compose up -d
# open http://<NAS-IP>:42199
```

## Updating

- **New maps / data** (from a fresh nes_decoder export): overwrite the files under
  `<MAP_DATA_ROOT>` — no image rebuild, just refresh the browser.
- **App/code changes**: push to `main` → CI rebuilds → `docker compose pull && up -d`.

## Test the production image locally

```powershell
scripts\run_local.ps1     # builds the image, mounts the repo's res/ + public/games
```
Then open http://localhost:42199. (Plain dev is still `npm run dev`.)
