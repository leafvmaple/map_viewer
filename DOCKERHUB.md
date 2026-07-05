# map-viewer

An interactive, zoomable viewer for retro game maps (NES / GBA / NDS), built
on Leaflet. Maps link to each other through doors/warps, with POI markers
(chests with item icons, trainers with battle-party cards, floor switchers for
multi-floor buildings), per-user collection marks, and a trilingual UI
(English / 中文 / 日本語).

Source & docs: <https://github.com/leafvmaple/map_viewer>

## ⚠️ No game data included

**This image contains only the viewer app (static frontend + nginx).**
It ships **no game maps, sprites, or any ROM-derived content whatsoever.**

You must produce the game data yourself — from game cartridges/ROMs you
legally own — with the companion extractor
([`nes_decoder`](https://github.com/leafvmaple/nes_decoder)), and mount it
into the container at runtime. The expected layout of the mounted directory:

```
<data-root>/
├─ public/games/registry.json     # list of your exported games
└─ res/
   └─ {gameId}/                   # one folder per game
      ├─ game.json                # maps + triggers + POIs (see CONTRACT.md)
      ├─ world_map/ …             # rendered map images
      ├─ scene_maps/ …
      ├─ world_tiles/ …           # optional tile pyramid
      └─ sprites/ …               # optional POI icons
```

The data contract is documented in
[CONTRACT.md](https://github.com/leafvmaple/map_viewer/blob/main/CONTRACT.md).

## Run

```bash
docker run -d --name map-viewer \
  -p 8080:80 \
  -v /path/to/your/data:/data:ro \
  leafvmaple/map-viewer:latest
```

Then open `http://localhost:8080`.

Or with compose:

```yaml
services:
  map-viewer:
    image: leafvmaple/map-viewer:latest
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - /path/to/your/data:/data:ro
```

Notes:

- The mount is read-only; the container only serves it. Re-exporting data
  needs no image rebuild — refresh the browser.
- nginx workers run as root inside the container so that NAS/SMB-owned mounts
  are always readable. The mount being `:ro` limits the blast radius; run on a
  trusted network or front it with your own proxy.
- User progress (collected chests, defeated trainers, profiles) lives in the
  browser's localStorage — nothing is written server-side.

---

**中文简述**：本镜像只含查看器前端，**不含任何游戏地图/素材数据**。数据需用配套的
[`nes_decoder`](https://github.com/leafvmaple/nes_decoder) 从你自己合法持有的
ROM 导出，然后以只读方式挂载到容器的 `/data`（目录结构见上）。
