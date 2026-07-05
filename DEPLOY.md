# Deploying map_viewer (Docker)

Same model as `vn-resource-vault`: **the image contains only the built frontend;
the game data lives on the NAS and is mounted read-only at runtime.** The image
is public on Docker Hub (`leafvmaple/map-viewer`), built and pushed by GitHub
Actions on every push to main; the NAS just pulls. (The self-hosted Gitea
Actions → Gitea registry pipeline still exists as an intranet fallback.)

```
┌────────────┐  push   ┌────────────────┐  build+push  ┌───────────────────────┐
│  git main  │────────▶│ GitHub Actions │─────────────▶│ Docker Hub            │
└────────────┘         └────────────────┘              │ leafvmaple/map-viewer │
                                                        └──────────┬────────────┘
                                                compose pull        │
                                            ┌─────────────────────▼────────┐
   browser ──http://<NAS>:42199──▶ nginx   │  NAS: docker compose up -d   │
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
  public/games/
    registry.json
```

The easiest way to produce it: point the `retro_decoder` export's `viewer_root`
(in `export.ini`) at `<MAP_DATA_ROOT>` — it writes `res/` and `public/games/registry.json` there.

## First deploy (on the NAS)

```sh
cp .env.example .env      # edit MAP_IMAGE + MAP_DATA_ROOT
docker compose pull
docker compose up -d
# open http://<NAS-IP>:42199
```

## Updating

- **New maps / data** (from a fresh retro_decoder export): overwrite the files under
  `<MAP_DATA_ROOT>` — no image rebuild, just refresh the browser.
- **App/code changes**: push to `main` → CI rebuilds → `docker compose pull && up -d`.

## Test the production image locally

```powershell
scripts\run_local.ps1     # builds the image, mounts the repo's res/ + public/games
```
Then open http://localhost:42199. (Plain dev is still `npm run dev`.)
