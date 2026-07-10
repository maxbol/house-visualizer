// Deterministic plan JSON -> THREE.Group builder. All decisions live in the
// plan file; this module only converts geometry. Plan cm -> world metres,
// plan (x, y) -> world (x, -z), so plan-north faces away from the camera.
import * as THREE from "three";
import { makeFloorLabel } from "./labels.js";

const S = 0.01; // cm -> m

const MAT = {
  wall: new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.92 }),
  slab: new THREE.MeshStandardMaterial({ color: 0xcfc8bb, roughness: 0.95 }),
  glass: new THREE.MeshStandardMaterial({
    color: 0x9fc4d8, roughness: 0.05, metalness: 0.1,
    transparent: true, opacity: 0.32, side: THREE.DoubleSide,
  }),
  frame: new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.7 }),
  step: new THREE.MeshStandardMaterial({ color: 0x9a7b52, roughness: 0.8 }),
  pole: new THREE.MeshStandardMaterial({ color: 0x4a4a4e, roughness: 0.5, metalness: 0.6 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.95, side: THREE.DoubleSide }),
  column: new THREE.MeshStandardMaterial({ color: 0xc7b9a5, roughness: 0.9 }),
  fixture: new THREE.MeshStandardMaterial({ color: 0x5c6064, roughness: 0.6 }),
  fixtureFront: new THREE.MeshStandardMaterial({ color: 0x4f5357, roughness: 0.55 }),
  porcelain: new THREE.MeshStandardMaterial({ color: 0xf1f1eb, roughness: 0.3 }),
  tubInner: new THREE.MeshStandardMaterial({ color: 0xdce3e6, roughness: 0.4 }),
  swing: new THREE.MeshBasicMaterial({
    color: 0xd9b83a, transparent: true, opacity: 0.4,
    depthWrite: false, side: THREE.DoubleSide,
  }),
};

const FACING = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }; // world (x, z) toward the front

function buildToilet(f, group) {
  const w = f.w * S, d = f.d * S, h = f.h * S;
  const cx = (f.x + f.w / 2) * S, cz = -(f.y + f.d / 2) * S;
  const [fx, fz] = FACING[f.facing ?? "s"];
  const depth = fx ? w : d; // extent along the facing axis
  const across = fx ? d : w;
  // cistern against the back edge
  group.add(box(fx ? 0.16 : across * 0.9, h, fx ? across * 0.9 : 0.16, MAT.porcelain,
    cx - fx * (depth / 2 - 0.08), h / 2, cz - fz * (depth / 2 - 0.08)));
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(across * 0.3, across * 0.2, h * 0.52, 20), MAT.porcelain);
  bowl.scale.set(fx ? 1.4 : 1, 1, fz ? 1.4 : 1);
  bowl.position.set(cx + fx * depth * 0.12, h * 0.26, cz + fz * depth * 0.12);
  bowl.castShadow = true;
  group.add(bowl);
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(across * 0.33, across * 0.33, 0.035, 20), MAT.porcelain);
  seat.scale.copy(bowl.scale);
  seat.position.set(bowl.position.x, h * 0.52, bowl.position.z);
  group.add(seat);
}

function buildSink(f, group) {
  const w = f.w * S, d = f.d * S, h = f.h * S;
  const cx = (f.x + f.w / 2) * S, cz = -(f.y + f.d / 2) * S;
  group.add(box(w, 0.12, d, MAT.porcelain, cx, h - 0.06, cz)); // basin
  group.add(box(w * 0.3, h - 0.12, d * 0.3, MAT.porcelain, cx, (h - 0.12) / 2, cz)); // pedestal
}

function buildBathtub(f, group) {
  const w = f.w * S, d = f.d * S, h = f.h * S;
  const cx = (f.x + f.w / 2) * S, cz = -(f.y + f.d / 2) * S;
  group.add(box(w, h, d, MAT.porcelain, cx, h / 2, cz));
  const inner = h - 0.1;
  group.add(box(w - 0.14, inner, d - 0.14, MAT.tubInner, cx, h + 0.004 - inner / 2, cz));
}

function box(w, h, d, mat, cx, cy, cz, castShadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(cx, cy, cz);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

// One wall: split its elevation into solid boxes around the openings.
function buildWall(wall, defaultHeight, group) {
  const [x1, y1] = wall.from;
  const [x2, y2] = wall.to;
  const height = (wall.height ?? defaultHeight) * S;
  const t = wall.thickness * S;
  const len = Math.hypot(x2 - x1, y2 - y1) * S;
  const ux = (x2 - x1) * S / len; // unit vector along the wall (world x)
  const uz = -(y2 - y1) * S / len; // world z (plan y flips)
  const ox = x1 * S;
  const oz = -y1 * S;
  const angle = Math.atan2(-uz, ux); // yaw so the box length follows the wall

  // segment [a, b] along the wall (m), vertical band [v0, v1] (m)
  const wallInfo = `${wall.id} — ${Math.round(len / S)}×${wall.thickness} cm, h ${wall.height ?? defaultHeight}`;
  const seg = (a, b, v0, v1, mat = MAT.wall, thick = t, info = wallInfo) => {
    if (b - a < 1e-4 || v1 - v0 < 1e-4) return;
    const mid = (a + b) / 2;
    const mesh = box(b - a, v1 - v0, thick, mat, ox + ux * mid, (v0 + v1) / 2, oz + uz * mid);
    mesh.rotation.y = angle;
    mesh.userData.info = info;
    if (mat === MAT.glass) mesh.castShadow = false; // windows let the sun through
    group.add(mesh);
  };

  const openings = [...(wall.openings ?? [])]
    .map((o) => ({ ...o, a: o.offset * S, b: (o.offset + o.width) * S, sillM: o.sill * S, headM: o.head * S }))
    .sort((p, q) => p.a - q.a);

  let cursor = 0;
  for (const o of openings) {
    seg(cursor, o.a, 0, height); // solid piece before the opening
    if (o.sillM > 0) seg(o.a, o.b, 0, o.sillM); // below the sill
    if (o.headM < height) seg(o.a, o.b, o.headM, height); // lintel above
    if (o.type === "window") {
      const openInfo = `${o.label ?? o.type} — ${o.width} cm bred, höjd ${o.sill}–${o.head}`;
      seg(o.a, o.b, o.sillM, o.headM, MAT.glass, Math.min(t * 0.25, 0.03), openInfo);
      // slim frame strips left/right of the glass
      seg(o.a, o.a + 0.04, o.sillM, o.headM, MAT.frame);
      seg(o.b - 0.04, o.b, o.sillM, o.headM, MAT.frame);
    } else if (o.type === "door") {
      seg(o.a, o.a + 0.035, o.sillM, o.headM, MAT.frame);
      seg(o.b - 0.035, o.b, o.sillM, o.headM, MAT.frame);
      if (o.swing) {
        // yellow quarter-disc on the floor showing the door's swept area
        const radius = o.b - o.a;
        const hingeU = o.swing.hinge === "end" ? o.b : o.a;
        const cdx = o.swing.hinge === "end" ? -ux : ux; // closed leaf, toward the other jamb
        const cdz = o.swing.hinge === "end" ? -uz : uz;
        const sdx = o.swing.opens === "left" ? uz : -uz; // plan-left of from->to is world (uz, -ux)
        const sdz = o.swing.opens === "left" ? -ux : ux;
        const thC = Math.atan2(-cdz, cdx);
        const ccw = cdx * -sdz - -cdz * sdx > 0; // is the open side CCW from the closed leaf?
        const geo = new THREE.CircleGeometry(radius, 20, ccw ? thC : thC - Math.PI / 2, Math.PI / 2);
        geo.rotateX(-Math.PI / 2);
        const disc = new THREE.Mesh(geo, MAT.swing);
        disc.position.set(ox + ux * hingeU, 0.008, oz + uz * hingeU);
        disc.renderOrder = 1;
        disc.userData.info = `${o.label ?? "dörr"} — uppställningsyta, dörrblad ${Math.round(radius / S)} cm`;
        group.add(disc);
      }
    }
    cursor = o.b;
  }
  seg(cursor, len, 0, height); // solid piece after the last opening
}

function buildSpiralStair(stair, group) {
  const cx = stair.center[0] * S;
  const cz = -stair.center[1] * S;
  const r = stair.radius * S;
  const rise = stair.rise * S;
  const n = stair.steps;

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, rise, 16), MAT.pole);
  pole.position.set(cx, rise / 2, cz);
  pole.castShadow = true;
  group.add(pole);

  const sweep = THREE.MathUtils.degToRad(stair.sweepDeg ?? 300);
  const start = THREE.MathUtils.degToRad(stair.startDeg ?? 0);
  for (let i = 0; i < n; i++) {
    const angle = start + (i / (n - 1)) * sweep;
    const y = ((i + 1) * rise) / n - 0.02;
    const tread = box(r - 0.08, 0.04, 0.26, MAT.step, 0, 0, 0);
    tread.geometry.translate((r - 0.08) / 2 + 0.06, 0, 0); // inner edge at the pole
    tread.position.set(cx, y, cz);
    tread.rotation.y = angle;
    group.add(tread);
  }
}

export function buildFloor(plan) {
  const group = new THREE.Group();
  group.name = `floor:${plan.id}`;
  const W = plan.envelope.width * S;
  const D = plan.envelope.depth * S;

  // floor slab, top face at y=0
  const slab = box(W, 0.1, D, MAT.slab, W / 2, -0.05, -D / 2, false);
  group.add(slab);

  for (const wall of plan.walls ?? []) buildWall(wall, plan.wallHeight, group);
  for (const stair of plan.stairs ?? []) buildSpiralStair(stair, group);

  for (const c of plan.columns ?? []) {
    const h = plan.wallHeight * S;
    const mesh = box(c.w * S, h, c.d * S, MAT.column, (c.x + c.w / 2) * S, h / 2, -(c.y + c.d / 2) * S);
    mesh.userData.info = `${c.label ?? "pelare"} — ${c.w}×${c.d} cm`;
    group.add(mesh);
  }

  // built-in fixtures: cabinetry (carcass + recessed front), counters (+ worktop),
  // and sanitary ware with dedicated shapes
  for (const f of plan.fixtures ?? []) {
    const fg = new THREE.Group();
    if (f.type === "toilet") buildToilet(f, fg);
    else if (f.type === "bathtub") buildBathtub(f, fg);
    else if (f.type === "sink") buildSink(f, fg);
    else {
      const h = f.h * S;
      const cx = (f.x + f.w / 2) * S;
      const cz = -(f.y + f.d / 2) * S;
      fg.add(box(f.w * S, h, f.d * S, MAT.fixture, cx, h / 2, cz));
      fg.add(box(f.w * S + 0.012, h - 0.14, f.d * S + 0.012, MAT.fixtureFront, cx, (h - 0.06) / 2, cz));
      if (f.type === "counter")
        fg.add(box(f.w * S + 0.02, 0.035, f.d * S + 0.02, MAT.step, cx, h, cz)); // worktop
    }
    const info = `${f.label ?? f.type} — ${f.w}×${f.d} cm, h ${f.h}`;
    fg.traverse((o) => o.isMesh && (o.userData.info = info));
    group.add(fg);
  }

  // tinted per-room floor overlays + labels
  const labels = new THREE.Group();
  labels.name = "room-labels";
  for (const room of plan.rooms ?? []) {
    const shape = new THREE.Shape(room.poly.map(([x, y]) => new THREE.Vector2(x * S, y * S)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2); // (x, y, 0) -> (x, 0, -y): plan coords to world
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(room.color ?? "#c0b8a8"),
      roughness: 0.9,
      transparent: true,
      opacity: 0.85,
    });
    const overlay = new THREE.Mesh(geo, mat);
    overlay.position.y = 0.004;
    overlay.receiveShadow = true;
    group.add(overlay);

    // centroid of the polygon bbox is good enough for a label anchor
    const xs = room.poly.map((p) => p[0] * S);
    const ys = room.poly.map((p) => p[1] * S);
    const roomMinDim = Math.min(
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys)
    );
    const label = makeFloorLabel(room.name, roomMinDim * 0.92);
    label.position.set(
      (Math.min(...xs) + Math.max(...xs)) / 2,
      0.012,
      -(Math.min(...ys) + Math.max(...ys)) / 2
    );
    labels.add(label);
  }
  group.add(labels);

  // ceiling slab, hidden by default (toggle in the UI)
  const ceiling = box(W, 0.08, D, MAT.ceiling, W / 2, plan.wallHeight * S + 0.04, -D / 2, false);
  ceiling.name = "ceiling";
  ceiling.visible = false;
  group.add(ceiling);

  // shadow-only roof: invisible to the camera but always blocks the sun, so
  // interiors are lit through windows instead of straight through the roof
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(W, 0.08, D),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
  );
  roof.position.set(W / 2, plan.wallHeight * S + 0.04, -D / 2);
  roof.castShadow = true;
  roof.name = "roof-shadow";
  group.add(roof);

  group.userData.bounds = { width: W, depth: D, height: plan.wallHeight * S };
  return group;
}
