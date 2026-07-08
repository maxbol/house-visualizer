# house-visualizer

Turns the architectural drawing of the house (Robertshöjd, Göteborg — block
26-29, hustyp BAS, 1960, skala 1:50) into a browser-based 3D scene per floor,
with to-scale furniture placement.

```
nix develop          # node, pdftoppm, python3, chromium, jq
npm run validate     # geometry-check the plan JSONs (the pipeline gate)
npm run serve        # http://127.0.0.1:8741/web/
```

## Phase 1 — PDF → plan pipeline

The source drawing is a raster scan of a 1960 hand drawing, so the pipeline
deliberately splits into a lossy human/AI tracing step and a deterministic
rest. Reliability comes from the validator, not from trusting OCR/vectorizing
a 60-year-old scan.

```
assets/*.pdf
   │  tools/rasterize.sh          (pdftoppm, 300 dpi -> assets/raster/)
   ▼
raster reference images
   │  tracing: dimension chains on the drawing -> coordinates
   ▼
plans/bottenplan.json  plans/overplan.json     (schema: plans/schema.md)
   │  tools/validate.mjs          (axis-alignment, envelope containment,
   ▼                               opening bounds/overlap, room polygons)
web/src/buildFloor.js             (deterministic JSON -> three.js geometry)
```

- All plan coordinates are **centimetres**, origin at the SW exterior corner,
  x east, y north — exactly like the dimension chains on the drawing
  (626 exterior width, 910 depth, 20 cm exterior walls, 7 cm partitions).
- Everything the drawing does not state (ceiling height 240 — confirmed by
  owner, sill heights, the
  slightly slanted hall/kök wall made orthogonal, …) is listed per plan under
  `assumptions`.
- Re-run `npm run validate` after editing a plan; the viewer builds blindly
  from whatever the JSON says.

## Phase 2 — viewer

`web/` is a no-build static app (three.js vendored in `web/vendor/`).

- Starts at a fixed ¾ view; left mouse rotates, right mouse pans, scroll zooms.
- **Ovanifrån** gives a straight floor-plan view (north up).
- **Fritt läge** (or `F`): pointer-lock free look at 1.6 m eye height,
  WASD + mouse, Shift to run, Esc to leave.
- Floor switcher (bottenplan/överplan — separate scenes, same envelope),
  ceiling and room-label toggles.
- URL params: `?floor=overplan`, `?view=top`, `?demo=1` (sample furnishing
  on an empty floor).

## Phase 3 — furniture

Preset furniture (bokhylla, garderob, sängar, soffa, fåtölj, bord, stolar,
skrivbord, sideboard, egen låda) built parametrically from its W×D×H in cm —
edit the dimensions of a selected piece and it rebuilds to scale. A 202 cm
bookshelf visibly nearly reaches the 240 cm ceiling.

- Click a preset, then click the floor to place (ghost preview follows the
  cursor). Pieces are structurally locked to floor level.
- Click to select, drag to move, `R`/⟳ rotates 15° (Shift+R reverses),
  `Del` removes, Duplicera copies.
- Layouts persist per floor in `localStorage`.

## Repo layout

| path | |
|---|---|
| `assets/` | source PDF (+ `raster/`, generated, git-ignored) |
| `plans/` | schema doc + traced floor plan JSONs (the source of truth) |
| `tools/` | `rasterize.sh`, `validate.mjs` |
| `web/` | static three.js app (`src/`, vendored libs in `vendor/`) |
