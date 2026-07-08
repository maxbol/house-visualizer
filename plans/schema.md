# Floor plan JSON schema

The interchange format between the PDF tracing step and the 3D builder.
One JSON file per floor. All lengths in **centimetres**, all coordinates in
the plan's own 2D system:

- Origin: the **south-west exterior corner** of the house envelope.
- `x`: eastwards (rightwards on the drawing).
- `y`: northwards (upwards on the drawing).

The 3D builder maps plan `(x, y)` to world `(x, -z)` with metres = cm / 100,
so north points away from the default camera.

## Top-level object

| field           | type     | meaning                                            |
|-----------------|----------|----------------------------------------------------|
| `id`            | string   | slug, used for storage keys and file name          |
| `name`          | string   | human readable floor name                          |
| `units`         | `"cm"`   | must be `"cm"` (validator enforces)                |
| `source`        | object   | provenance: pdf file, page, scale, tracing notes   |
| `envelope`      | object   | `{ width, depth }` exterior bounding box           |
| `wallHeight`    | number   | default floor-to-ceiling height for this floor     |
| `walls`         | Wall[]   | every wall segment, exterior and interior          |
| `rooms`         | Room[]   | floor polygons, used for coloring + labels         |
| `stairs`        | Stair[]  | stair objects (rendered, non-structural)           |
| `columns`       | Box[]    | solid full-height blocks (chimney etc.)            |
| `assumptions`   | string[] | every place the tracing deviates from the drawing  |

## Wall

Straight centreline segment. Usually axis-aligned, but any angle is allowed
(the drawing has a slanted hall/kök wall).

```json
{
  "id": "ext-south",
  "from": [0, 10],
  "to": [626, 10],
  "thickness": 20,
  "height": 250,          // optional, defaults to wallHeight
  "openings": [
    { "type": "door",    "offset": 188, "width": 94, "sill": 0,  "head": 210, "label": "YDIV" },
    { "type": "window",  "offset": 346, "width": 144, "sill": 90, "head": 210, "label": "F9V" },
    { "type": "opening", "offset": 130, "width": 130, "sill": 0,  "head": 210 }
  ]
}
```

- `offset` is measured **along the wall from the `from` point** to the start
  of the opening.
- `door` = hole, no glass. `window` = hole + glass pane. `opening` = plain
  hole (doorless passage).
- Doors may carry a `swing` when the leaf arc is visible on the drawing:
  `{ "hinge": "start" | "end", "opens": "left" | "right" }` — hinge jamb
  measured along the wall from `from`, and the side the leaf sweeps into when
  walking `from` → `to`. Rendered as a translucent yellow quarter-disc on the
  floor (the area the door needs to clear).
- Walls may overlap at corners; the builder renders overlapping solids with
  the same material so joints are invisible.

## Room

```json
{ "name": "KÖK", "poly": [[350,20],[606,20],[606,340],[350,340]], "color": "#c8b89a" }
```

Polygon of interior floor area (CCW or CW, not self-intersecting). Only used
for the tinted floor overlay and the label, never for wall generation.

## Stair

```json
{ "type": "spiral", "center": [150, 360], "radius": 80, "rise": 240, "steps": 12,
  "sweepDeg": 180, "startDeg": 90 }
```

`sweepDeg` (default 300) is the total rotation over the climb; `startDeg`
(default 0, measured counterclockwise from plan-east) is where the lowest
tread points. The Robertshöjd stair is a semi-circle: flat side toward the
landing, treads fanning west.

## Column

```json
{ "x": 560, "y": 400, "w": 45, "d": 65, "label": "murstock" }
```

`(x, y)` is the south-west corner of the block. Columns are full wall height.

## Fixture

Built-ins that are part of the house, as opposed to placeable furniture.

```json
{ "type": "storage", "x": 137, "y": 20, "w": 51, "d": 132, "h": 210, "label": "G/G/EL" }
{ "type": "counter", "x": 546, "y": 25, "w": 60, "d": 345, "h": 90 }
{ "type": "toilet",  "x": 22, "y": 35, "w": 70, "d": 40, "h": 78, "facing": "e" }
{ "type": "sink",    "x": 170, "y": 148, "w": 45, "d": 55, "h": 85, "facing": "w" }
{ "type": "bathtub", "x": 22, "y": 95, "w": 75, "d": 163, "h": 55 }
```

`(x, y)` south-west corner, `w` along x, `d` along y, `h` in cm (must not
exceed `wallHeight`). `storage` renders as cabinetry with recessed fronts,
`counter` adds a worktop, `toilet`/`sink`/`bathtub` render as porcelain.
`facing` (n/s/e/w) is the direction the front points, for oriented types.

## Pipeline

1. `tools/rasterize.sh` — renders `assets/*.pdf` to 300 dpi PNGs in
   `assets/raster/` (the tracing reference).
2. Trace / update `plans/<floor>.json` against the raster and the printed
   dimension chains. Record every guess in `assumptions`.
3. `node tools/validate.mjs` — deterministic geometry checks; must pass
   before the plan is considered usable. The web app refuses nothing at
   runtime; the validator is the gate.
