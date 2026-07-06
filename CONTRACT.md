# Data Contract — `nes_decoder` → `map_viewer`

This document is the **interface between the two projects**:

- **Producer:** [`nes_decoder`](../nes_decoder) (Python) extracts ROM assets and writes the files below.
- **Consumer:** `map_viewer` (this repo, a Leaflet web app) reads them and renders the maps.

If the producer honors this contract, the viewer renders correctly with no manual
fix-ups. The machine-readable form lives in [`schema/`](schema/):

| File | Validates |
| --- | --- |
| [`schema/registry.schema.json`](schema/registry.schema.json) | `public/games/registry.json` |
| [`schema/game.schema.json`](schema/game.schema.json) | `res/{gameId}/game.json` |
| [`schema/items.schema.json`](schema/items.schema.json) | `res/{gameId}/data/items.json` |
| [`schema/services.schema.json`](schema/services.schema.json) | `res/{gameId}/data/services.json` |
| [`schema/species.schema.json`](schema/species.schema.json) | `res/{gameId}/data/species.json` |
| [`schema/parties.schema.json`](schema/parties.schema.json) | `res/{gameId}/data/parties.json` |
| [`schema/trainers.schema.json`](schema/trainers.schema.json) | `res/{gameId}/data/trainers.json` |
| [`schema/currencies.schema.json`](schema/currencies.schema.json) | `res/{gameId}/data/currencies.json` |

---

## 1. Directory layout the producer must write

```
map_viewer/
├─ public/games/registry.json          # index of all games
└─ res/
   └─ {gameId}/                         # e.g. metal_max, tenchi2
      ├─ game.json                      # this game's maps + triggers + POIs
      ├─ world_map/
      │  └─ world_map_full.png          # (+ optional world_map_1024.png thumbnail)
      ├─ scene_maps/
      │  └─ *.png                       # one image per scene map
      ├─ world_tiles/                   # OPTIONAL: tile pyramid for type=tiles maps
      │  └─ {z}/{x}_{y}.png             #   z = 0 (native) … minNativeZoom (downscaled)
      ├─ data/                          # OPTIONAL: global catalogs referenced by game.json data
      │  ├─ items.json                   #   item catalog
      │  ├─ services.json                #   shops / services catalog
       │  ├─ species.json                 #   species/entity catalog
       │  ├─ parties.json                 #   battle party catalog
       │  ├─ trainers.json                #   trainer/boss catalog
       │  └─ currencies.json              #   money/token catalog
      └─ sprites/                       # OPTIONAL: POI images referenced by game.json
         ├─ *.png                       #   pois[*].icon (NPC overworld sprites…)
         ├─ mon/*.png                   #   party[*].icon (mini icons)
         └─ item/*.png                  #   pois[*].itemIcon (bag icons)
```

- `{gameId}` must match `id` in `game.json` **and** the registry entry.
- All image paths inside `game.json` are **relative to that game's folder** (`res/{gameId}/`).

## 2. `registry.json`

```json
{
  "games": [
    { "id": "metal_max", "configPath": "/res/metal_max/game.json",
      "name": { "zh": "重装机兵", "en": "Metal Max" } },
    { "id": "tenchi2",   "configPath": "/res/tenchi2/game.json",
      "name": { "zh": "吞食天地II 诸葛孔明传", "en": "Tenchi wo Kurau II" } }
  ]
}
```

- `id` — `^[a-z0-9_]+$`, matches the game.json `id`.
- `configPath` — absolute server path ending in `game.json`.
- `name` — optional localized game name (same shape as game.json `name`).
  **Emit it**: it lets the game picker label every game without downloading
  each game.json up front (megabytes as the list grows). Entries without it
  still work — the viewer falls back to fetching the config.

## 3. `game.json`

```jsonc
{
  "id": "metal_max",
  "version": 1,                        // optional contract version (currently 1)
  "name": { "zh": "重装机兵", "en": "Metal Max", "ja": "メタルマックス" },
  "defaultMap": "world_map",           // key in `maps`; the navigation root
  "maps": {
    "world_map": {
      "name":     { "zh": "世界地图", "en": "World Map" },
      "type":     "image",             // "image" | "tiles" (tile pyramid, needs tilesPath + width/height)
      "image":    "world_map/world_map_full.png",
      "tileSize": 16,                  // px; grid overlay + editor snap. Usually 16.
      "triggers": [
        {
          "id":     "world_map_t00",
          "bounds": [[2336, 2336], [2352, 2352]],  // full-res pixels, top-left origin
          "target": "map_1E",          // key of another map in THIS game
          "label":  { "zh": "→ 地图 1E", "en": "→ 地图 1E" }
        }
      ]
    },
    "map_1E": { "name": { ... }, "type": "image", "image": "scene_maps/map_1E.png", "tileSize": 16, "triggers": [] }
  }
}
```

### Field semantics & invariants

| Field | Rule |
| --- | --- |
| `id` | `^[a-z0-9_]+$`; equals the folder name and the registry `id`. |
| `version` | Optional integer (currently `1`): the contract version the file was produced against, so a future breaking change can be detected instead of silently misread. |
| `export` | Provenance stamp, written **automatically** at export time (don't hand-author): `{ "exportedAt": ISO-timestamp, "producer": "nes_decoder@<git sha>", "rom": "sha1:<short>" }` — only `exportedAt` required. The viewer shows it in the bottom-right build chip (`v1.1.0 · 07-06 ⏐ data 07-06`), answering "is this deployment serving the fresh export?". Producers should also stamp `exportedAt` on their registry.json entry so one fetch shows every game's freshness. |
| `name`, `label` | **Localized string**: object keyed by language code (`en`/`zh`/`ja`/…), ≥1 entry. `en` is the fallback. |
| `defaultMap` | Must be a key in `maps`. It is the nav root — returning to it clears the back-stack. |
| `maps[*].type` | `"image"` (single PNG) or `"tiles"` (pre-generated tile pyramid; requires `tilesPath` + `width`/`height`, else falls back to image mode). |
| `maps[*].image` | Non-empty, relative to `res/{gameId}/`. The file must exist. |
| `maps[*].tilesPath` | Tile URL template for `type: "tiles"`, relative to `res/{gameId}/` (e.g. `world_tiles/{z}/{x}_{y}.png`); coordinates stay full-res pixels. Optional `minNativeZoom` sets the lowest pre-rendered level (default -5). |
| `maps[*].tileSize` | Positive integer, usually `16`. Both games use 16px tiles. |
| `maps[*].floorGroup` | Optional building/dungeon key: maps sharing it are floors of one place and get an **in-map floor switcher** (3F/2F/1F/B1F pills; switching keeps the camera). Must be **stable across re-exports** — derive it from map-table facts (e.g. the smallest member map id), not enumeration order. |
| `maps[*].floor` | Floor number within `floorGroup`: `1` = ground, negative = basement (`-1` renders B1F). Drives switcher order (top floor first) and labels. |
| `triggers[*].id` | Unique **within its map**. Convention `{mapId}_t{NN}`. |
| `triggers[*].bounds` | `[[x1,y1],[x2,y2]]` in **full-resolution image pixels**, origin top-left. 1 tile = `tileSize` px. |
| `triggers[*].target` | Usually an existing key in this game's `maps`. For return-stack exits, use `"__return__"` with `kind: "return"`; the viewer then returns to the previous map in the navigation stack. Dangling normal targets should be dropped by the producer. |
| `triggers[*].kind` | Optional trigger semantics. `"return"` means this is a context-sensitive exit from a reused scene; click returns to the map that entered it instead of a fixed target. |
| `triggers[*].returnTargets` | Optional candidate source maps for `kind: "return"`, used for validation and fallback when a reused scene is opened directly with no navigation context. Each entry has `target` plus optional `focus`. |

### Coordinate system (important)

- Bounds are **pixel coordinates of the full-res `image`**, not tiles, not lat/lng.
- Origin is **top-left**; `x` grows right, `y` grows down.
- The viewer maps pixel `(x, y)` → Leaflet `LatLng(-y, x)` in `CRS.Simple` internally — the producer does **not** need to know that; just emit plain pixels.

### Optional POIs (treasure chests etc.)

A map **may** carry points of interest; the viewer renders them as markers /
hover zones with a chest list, and users can mark them as collected:

```jsonc
"pois": [
  {
    "id":    "map_01_chest_00",          // see stability rule below
    "kind":  "treasure",                 // "treasure" | "gold" | anything else = generic pin
    "pos":   [192, 120],                 // px of the tile's TOP-LEFT corner, top-left origin
    "itemRefs": [{ "itemId": "1C" }],    // resolved through data/items.json
    "currencyRefs": [{ "currencyId": "G", "amount": 1000 }],
                                            // resolved through data/currencies.json
    "speciesId": "57",                   // resolved through data/species.json
    "trainerId": "42",                  // resolved through data/trainers.json
    "icon":  "sprites/trainer_05.png",   // optional sprite marker (e.g. an NPC)
    "iconSize": [16, 32],                // native px size of `icon`; default [16, 32]
    "hidden": false                      // true ONLY if invisible in the map image
  }
]
```

| Field | Rule |
| --- | --- |
| `pois[*].id` | Unique within its map — and **STABLE across re-exports**: per-user "collected" marks are keyed by this id, so a re-export that renames ids silently wipes every user's progress. Derive it from stable facts (map + tile position or ROM table index), never from enumeration order of a mutable list. |
| `pois[*].kind` | `treasure` and `gold` get chest UI (list, marks); other kinds render as a generic pin. Game-specific kinds should ship display metadata via top-level `poiKinds` (below). |
| `pois[*].pos` | `[x, y]` in full-res image pixels, top-left corner of the tile. |
| `pois[*].icon` | Optional image path relative to `res/{gameId}/`. When present the POI renders as that sprite on every map (anchored feet-on-tile) instead of a glyph/hover zone. |
| `pois[*].itemRefs` | Canonical item references for treasures/rewards. Each entry has `itemId` plus optional `quantity`; the viewer resolves names/prices/icons from `data/items.json`. New exporters should use this instead of duplicating item facts in POIs. |
| `pois[*].itemIcon` | Deprecated for item POIs; optional fallback mini-icon. Use a relative image path for ROM bag icons (typically 24×24), or `emoji:<glyph>` when the game has no item icon graphics. Shown in the chest tooltip, the treasure panel and the checklist — **not** as a map marker (visible chests keep their baked-in sprite). |
| `pois[*].items` | Deprecated compatibility field for multi-item POIs. New exporters should use `itemRefs`. |
| `pois[*].currencyRefs` | Canonical money/token references for gold piles, coins, prize money, and other currency rewards. Each entry has `currencyId` plus optional `amount`, `amountRange`, `rawCode`, or `random`; the viewer resolves names/icons/formatting from `data/currencies.json`. New exporters should use this instead of encoding money as fake items or pre-formatted POI text. |
| `pois[*].speciesId` | Canonical species/entity reference into `data/species.json` for standalone encounters or static entities that are not trainer/battle-party rows. The viewer resolves display name and optional icon/iconSize from the species catalog. |
| `pois[*].hidden` | Set `true` ONLY when the collectible has **no visible sprite in the rendered map image** (buried items, Itemfinder-style hidden items). The viewer draws an attention glyph (⭐/💰) for hidden chests; visible chests get just an invisible hover/click zone — their baked-in sprite is the marker. Default `false`. |
| `pois[*].party` | Optional structured battle party — **game-agnostic**: a trainer's Pokémon, an enemy general's army, a boss group. When present the viewer renders the tooltip as an icon·name·badge card instead of plain text (so keep `label` a **short title**, don't concatenate the party into it), and the POI becomes user-markable (defeated ✓) regardless of its `kind`. |
| `pois[*].reward` | Deprecated compatibility fallback for localized, pre-formatted defeat rewards. New exporters should use `currencyRefs` on the POI or trainer catalog row. |
| `pois[*].trainerId` | Canonical trainer/boss reference into `data/trainers.json`. New exporters should use this instead of duplicating `party` on every trainer POI. |
| `pois[*].partyId` | Direct battle party reference into `data/parties.json`, for bosses or encounters that do not have a trainer row. |
| `pois[*].serviceIds` | Optional references to game-wide shop/service ids from `data/services.json`. Use this for spatial bindings (NPC/counter/vending machine); don't duplicate a full shop inventory on every POI. |

### Optional catalogs (`data.items`, `data.services`)

Games may ship global item and service catalogs next to `game.json`:

```jsonc
{
  "data": {
    "items": "data/items.json",
    "services": "data/services.json",
    "species": "data/species.json",
    "parties": "data/parties.json",
    "trainers": "data/trainers.json",
    "currencies": "data/currencies.json"
  }
}
```

`items.json` is the authoritative map of stable item ids to item display facts:
localized name, price/currency, category, and optional `itemIcon` (same format as
`pois[*].itemIcon`). `currencies.json` is the authoritative map of stable money
or token ids to localized names, symbols, icons, and formatting. `services.json`
is a map of stable service ids to shop/service definitions. Services are
deliberately separate from POIs: a shop inventory is global data; a POI is only
the map/NPC binding to one or more services.

`species.json`, `parties.json`, and `trainers.json` normalize battle display
facts the same way: species/entity names and icons live once in `species.json`,
party rows reference those species by `speciesId`, and trainer/boss records point
at a party by `partyId`. A map POI should carry only the spatial binding
(`trainerId`, `partyId`, or standalone `speciesId`) plus optional sprite marker
fields.

Service entries are intentionally broad enough for RPG shops, vending machines,
inns, elevators, repair/customize menus, and transports:

```jsonc
{
  "services": {
    "metal_max_player_item_03": {
      "id": "metal_max_player_item_03",
      "kind": "shop",
      "name": { "zh": "人类工具 04", "ja": "人間道具 04" },
      "entries": [
        {
          "type": "item",
          "itemId": "C1",
          "quantity": 6,
          "available": true
        }
      ],
      "award": { "type": "item", "itemId": "D1" },
      "source": { "system": "metal_max.list", "pointer": "0x9DA8" }
    }
  }
}
```

For `type: "item"`, the viewer resolves display fields by `itemId` from
`items.json`; do not duplicate normal item facts in every service entry. Entry
fields such as `name`, `price`, `currency`, `category`, or `itemIcon` are only
fallbacks/overrides for non-catalog options or exceptional service-specific
behavior.

Currency refs point at `data/currencies.json` and carry only reward/value facts:

```jsonc
// data/currencies.json
{ "currencies": {
  "G": { "id": "G", "name": { "en": "Gold" }, "symbol": { "en": "G" },
         "format": { "position": "suffix", "space": false } }
} }

// game.json POI
{ "kind": "gold", "currencyRefs": [{ "currencyId": "G", "amount": 1000 }] }

// random/encoded amount when the exact amount is not decoded yet
{ "currencyRefs": [{ "currencyId": "G", "rawCode": "0xFB", "random": true }] }
```

### Battle party catalogs (`data.species`, `data.parties`, `data.trainers`)

New exporters should prefer catalog refs over inline `pois[*].party`:

```jsonc
// game.json
"pois": [
  { "id": "route_03_t00", "kind": "trainer", "pos": [512, 192],
    "label": { "zh": "短裤小子 カズ", "ja": "たんパンこぞう カズ" },
    "icon": "sprites/f012.png", "iconSize": [32, 32],
    "trainerId": "42" }
]

// data/trainers.json
{ "trainers": {
  "42": { "id": "42", "label": { "ja": "たんパンこぞう カズ" },
          "partyId": "trainer:42",
          "currencyRefs": [{ "currencyId": "money", "amount": 624 }] }
} }

// data/parties.json
{ "parties": {
  "trainer:42": { "id": "trainer:42", "members": [
    { "slot": 0, "speciesId": "57", "value": 39 }
  ] }
} }

// data/species.json
{ "species": {
  "57": { "id": "57", "name": { "zh": "火爆猴", "ja": "オコリザル" },
          "icon": "sprites/mon/057.png" }
} }

// data/currencies.json
{ "currencies": {
  "money": { "id": "money", "name": { "en": "Money" }, "symbol": { "en": "¥" },
             "format": { "position": "prefix", "space": false } }
} }
```

Resolution order is deliberately fallback-friendly: `poi.label`,
`poi.currencyRefs`, `poi.reward`, `poi.icon`, and `poi.iconSize` override trainer
catalog fields; party member `name`, `icon`, and `unit` override species catalog
fields. If a catalog ref is missing, legacy inline `pois[*].party` still renders.

### Legacy Inline Battle Party (`pois[*].party`)

One row per member: mini-icon, localized name, and a right-aligned numeric
badge whose dimmed prefix comes from `unit` (default `Lv`). The same card
serves every game:

```jsonc
// pokemon_frlg — a trainer  (renders 「火爆猴 ⋯⋯ Lv39」)
"party": [
  {
    "name":  { "zh": "火爆猴", "ja": "オコリザル" },  // localized name (required)
    "value": 39,                                      // numeric badge (optional)
    "id":    57,                                      // game-internal id, for debugging (optional)
    "icon":  "sprites/mon/057.png"                    // mini-icon, relative to res/{gameId}/ (optional)
  }
]

// tenchi2 — an enemy general  (renders 「张飞 ⋯⋯ 兵12000」)
"party": [
  {
    "name":  { "zh": "张飞" },
    "value": 12000,
    "unit":  { "zh": "兵", "en": "Troops" }           // badge prefix; omit for the default "Lv"
  }
]
```

- Emit the **full roster in battle order** — the viewer never truncates, so the
  producer shouldn't either ("等N只" summaries are exactly what this replaces).
- `value` is optional: a member without one renders as a name-only row.
- `icon` is optional per entry: a missing icon renders as a ball placeholder
  without breaking the row layout. Mini-icons are typically 32×32 pixel art;
  the viewer displays them at 24×24 with `image-rendering: pixelated`.
- `name`/`unit` follow the usual localized-string rules; the viewer falls back
  current-language → `en` → any value, so `{ "ja": ... }` alone is valid.

### POI kind metadata (`poiKinds`, top level)

New games bring new POI categories (docks, berries, generals…). Instead of
requiring a viewer i18n/glyph update per kind, a game **should** describe its
own kinds next to `maps`:

```jsonc
"poiKinds": {
  "dock":  { "name": { "zh": "码头", "en": "Dock" }, "glyph": "⚓" },
  "route": { "name": { "zh": "路点", "en": "Waypoint" } }   // glyph optional
}
```

The viewer resolves legend names/glyphs as: game `poiKinds` → built-in
i18n/glyph for well-known kinds → raw id / generic pin. Kinds already built
into the viewer (treasure, gold, trainer, sign, heal, cut, rock, boulder,
pokemon, berry, dock, place, route) need no entry.

### Optional map events (terrain changes)

`events` (toggleable terrain-change overlays) follow the same pixel-bounds
conventions; `events[*].id` should be stable for the same reason, though
nothing user-persistent references it yet.

### Optional performance fields (progressive loading)

The viewer can paint a low-res placeholder instantly and swap in the full image
once it loads — useful for large world maps (e.g. 4096×4096). To enable it, the
producer **may** add, on any map:

```jsonc
"width": 4096,                          // intrinsic px size of `image`
"height": 4096,
"thumbnail": "world_map/world_map_1024.png"
```

- All three are optional and **fully backward-compatible**: omit them and the
  viewer behaves exactly as before (probes and paints the full image).
- `thumbnail` only takes effect when `width` **and** `height` are also present
  (they define the bounds, letting the viewer skip probing the full image).
- On `type: "tiles"` maps, `thumbnail` doubles as the **blur-to-sharp underlay**:
  it paints instantly (smoothly scaled) and shows through wherever tiles haven't
  loaded yet — Google-Maps-style. Producers should point it at the low-res
  preview they already render.

## 4. Validating on the producer side

Add this check to `nes_decoder`'s `map_viewer_export` step so a bad export fails
loudly instead of silently breaking the browser. Requires `pip install jsonschema`.

```python
import json
from pathlib import Path
from jsonschema import Draft202012Validator

def validate_game_json(game_json_path: Path, schema_dir: Path) -> list[str]:
    """Return a list of contract violations ([] means valid)."""
    schema = json.loads((schema_dir / "game.schema.json").read_text("utf-8"))
    data = json.loads(Path(game_json_path).read_text("utf-8"))

    errors: list[str] = []

    # 1. Structural validation against the JSON Schema.
    for e in sorted(Draft202012Validator(schema).iter_errors(data), key=lambda e: e.path):
        loc = "/".join(str(p) for p in e.path) or "<root>"
        errors.append(f"{loc}: {e.message}")

    # 2. Referential integrity (targets + defaultMap) — not expressible in JSON Schema.
    maps = data.get("maps", {})
    if data.get("defaultMap") not in maps:
        errors.append(f"defaultMap '{data.get('defaultMap')}' is not a key in maps")
    for map_id, m in maps.items():
        for t in m.get("triggers", []):
            tgt = t.get("target")
            if tgt and tgt not in maps:
                errors.append(f"maps/{map_id}: trigger '{t.get('id')}' targets unknown map '{tgt}'")

    # 3. Referenced image files exist on disk.
    game_dir = Path(game_json_path).parent
    for map_id, m in maps.items():
        for key in ("image", "thumbnail"):
            rel = m.get(key)
            if rel and not (game_dir / rel).exists():
                errors.append(f"maps/{map_id}: {key} '{rel}' does not exist")

    return errors


problems = validate_game_json(Path("res/metal_max/game.json"), Path("schema"))
if problems:
    raise SystemExit("game.json contract violations:\n  - " + "\n  - ".join(problems))
```

The viewer performs the equivalent *soft* checks at load time
([`GameLoader._validate`](src/core/GameLoader.ts)) and logs any dangling targets
or malformed bounds to the browser console — so the same issues surface on both
sides.

## 5. Compatibility rules

- **Additive is safe.** New optional fields (like `width`/`thumbnail`) don't break
  older data. The schemas use `additionalProperties: false`, so *unknown* fields
  are rejected — add them to `schema/game.schema.json` when the producer starts
  emitting them.
- **Names are hand-editable.** Users can rename maps / edit triggers in the viewer
  and export a corrected `game.json`. The producer should **preserve existing
  hand-authored `name` / `label` values** on re-export rather than overwrite them.
