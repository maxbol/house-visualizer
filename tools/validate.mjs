#!/usr/bin/env node
// Phase 1, step 3: deterministic geometry validator for plans/*.json.
// Exits non-zero with a list of violations; a plan that passes here renders
// without surprises in the viewer (the builder makes no further decisions).
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const plansDir = join(dirname(fileURLToPath(import.meta.url)), "..", "plans");
const EPS = 0.01;

let failures = 0;
const fail = (plan, msg) => {
  failures++;
  console.error(`  ✗ [${plan}] ${msg}`);
};

function validatePlan(file) {
  const plan = JSON.parse(readFileSync(join(plansDir, file), "utf8"));
  const id = plan.id ?? file;
  console.log(`plan: ${file}`);

  // --- top level ---
  for (const key of ["id", "name", "units", "envelope", "wallHeight", "walls", "rooms"])
    if (plan[key] === undefined) fail(id, `missing top-level field "${key}"`);
  if (plan.units !== "cm") fail(id, `units must be "cm", got "${plan.units}"`);
  const { width: W, depth: D } = plan.envelope ?? {};
  if (!(W > 0 && D > 0)) fail(id, `envelope must have positive width/depth`);
  if (!(plan.wallHeight > 0)) fail(id, `wallHeight must be positive`);
  const inEnvelope = (x, y) =>
    x >= -EPS && x <= W + EPS && y >= -EPS && y <= D + EPS;

  // --- walls ---
  const ids = new Set();
  for (const wall of plan.walls ?? []) {
    const wid = wall.id ?? "?";
    if (ids.has(wid)) fail(id, `duplicate wall id "${wid}"`);
    ids.add(wid);

    const [x1, y1] = wall.from ?? [];
    const [x2, y2] = wall.to ?? [];
    const horizontal = Math.abs(y1 - y2) < EPS;
    const vertical = Math.abs(x1 - x2) < EPS;
    if (!horizontal && !vertical) {
      fail(id, `wall "${wid}" is not axis-aligned`);
      continue;
    }
    const length = horizontal ? Math.abs(x2 - x1) : Math.abs(y2 - y1);
    if (length < EPS) fail(id, `wall "${wid}" has zero length`);
    if (!(wall.thickness > 0)) fail(id, `wall "${wid}" thickness must be positive`);
    const height = wall.height ?? plan.wallHeight;
    if (!(height > 0)) fail(id, `wall "${wid}" height must be positive`);

    // wall body (centreline ± t/2) must stay inside the envelope
    const t2 = wall.thickness / 2;
    const bx1 = Math.min(x1, x2) - (vertical ? t2 : 0);
    const bx2 = Math.max(x1, x2) + (vertical ? t2 : 0);
    const by1 = Math.min(y1, y2) - (horizontal ? t2 : 0);
    const by2 = Math.max(y1, y2) + (horizontal ? t2 : 0);
    if (!inEnvelope(bx1, by1) || !inEnvelope(bx2, by2))
      fail(id, `wall "${wid}" extends outside the envelope`);

    // openings: inside the wall, vertically sane, mutually non-overlapping
    const spans = [];
    for (const o of wall.openings ?? []) {
      const label = o.label ?? o.type;
      if (!["door", "window", "opening"].includes(o.type))
        fail(id, `wall "${wid}" opening "${label}": bad type "${o.type}"`);
      if (!(o.offset >= -EPS))
        fail(id, `wall "${wid}" opening "${label}": negative offset`);
      if (!(o.width > 0))
        fail(id, `wall "${wid}" opening "${label}": width must be positive`);
      if (o.offset + o.width > length + EPS)
        fail(id, `wall "${wid}" opening "${label}": ends at ${o.offset + o.width} beyond wall length ${length}`);
      if (!(o.sill >= 0 && o.head > o.sill && o.head <= height + EPS))
        fail(id, `wall "${wid}" opening "${label}": bad sill/head ${o.sill}/${o.head} (wall height ${height})`);
      if (o.type !== "window" && o.sill !== 0)
        fail(id, `wall "${wid}" opening "${label}": ${o.type} should have sill 0`);
      spans.push([o.offset, o.offset + o.width, label]);
    }
    spans.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i++)
      if (spans[i][0] < spans[i - 1][1] - EPS)
        fail(id, `wall "${wid}": openings "${spans[i - 1][2]}" and "${spans[i][2]}" overlap`);
  }

  // --- rooms ---
  for (const room of plan.rooms ?? []) {
    if (!Array.isArray(room.poly) || room.poly.length < 3) {
      fail(id, `room "${room.name}" polygon needs >= 3 points`);
      continue;
    }
    for (const [x, y] of room.poly)
      if (!inEnvelope(x, y))
        fail(id, `room "${room.name}" point (${x}, ${y}) outside envelope`);
    // shoelace: degenerate (zero-area) polygons are tracing mistakes
    let area = 0;
    const p = room.poly;
    for (let i = 0; i < p.length; i++) {
      const [ax, ay] = p[i], [bx, by] = p[(i + 1) % p.length];
      area += ax * by - bx * ay;
    }
    if (Math.abs(area / 2) < 100) fail(id, `room "${room.name}" polygon area < 100 cm²`);
  }

  // --- stairs / columns ---
  for (const s of plan.stairs ?? []) {
    if (s.type !== "spiral") fail(id, `stair type "${s.type}" not supported`);
    const [cx, cy] = s.center ?? [];
    if (!inEnvelope(cx - s.radius, cy - s.radius) || !inEnvelope(cx + s.radius, cy + s.radius))
      fail(id, `stair at (${cx}, ${cy}) r=${s.radius} outside envelope`);
    if (!(s.rise > 0 && s.steps >= 3)) fail(id, `stair needs positive rise and >= 3 steps`);
  }
  for (const c of plan.columns ?? [])
    if (!inEnvelope(c.x, c.y) || !inEnvelope(c.x + c.w, c.y + c.d))
      fail(id, `column "${c.label ?? "?"}" outside envelope`);

  // --- summary metrics (eyeball cross-check against the drawing) ---
  const wallArea = (plan.walls ?? []).reduce((sum, w) => {
    const len = Math.abs((w.to[0] - w.from[0]) + (w.to[1] - w.from[1]));
    return sum + len * w.thickness;
  }, 0);
  const roomArea = (plan.rooms ?? []).reduce((sum, r) => {
    let a = 0;
    for (let i = 0; i < r.poly.length; i++) {
      const [ax, ay] = r.poly[i], [bx, by] = r.poly[(i + 1) % r.poly.length];
      a += ax * by - bx * ay;
    }
    return sum + Math.abs(a / 2);
  }, 0);
  console.log(
    `  envelope ${W}×${D} cm | walls: ${plan.walls?.length ?? 0} (${(wallArea / 1e4).toFixed(1)} m² footprint)` +
    ` | rooms: ${plan.rooms?.length ?? 0} (${(roomArea / 1e4).toFixed(1)} m² floor)` +
    ` | openings: ${(plan.walls ?? []).reduce((n, w) => n + (w.openings?.length ?? 0), 0)}`
  );
}

const files = readdirSync(plansDir).filter((f) => f.endsWith(".json"));
if (files.length === 0) {
  console.error("no plan JSONs found in plans/");
  process.exit(1);
}
for (const f of files) validatePlan(f);

if (failures) {
  console.error(`\n${failures} violation(s).`);
  process.exit(1);
}
console.log("\nall plans valid ✓");
