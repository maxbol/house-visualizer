import * as THREE from "three";
import { OrbitControls } from "../vendor/OrbitControls.js";
import { PointerLockControls } from "../vendor/PointerLockControls.js";
import { buildFloor } from "./buildFloor.js";
import { PRESETS, presetById, buildItem, loadLayout, saveLayout, migrateLegacyStorage } from "./furniture.js";

// Projects and their floors come from plans/index.json.
let manifest = { projects: [] };
let currentProject = null;

// URL params: ?project=stugan / ?floor=overplan pick the start view,
// ?demo=1 furnishes an empty floor with a sample layout (not persisted).
const params = new URLSearchParams(location.search);

function demoLayout(floorId) {
  const mk = (preset, x, z, rot = 0, dims = {}) => {
    const p = presetById(preset);
    return { id: `demo-${preset}-${x}-${z}`, preset, w: p.w, d: p.d, h: p.h, ...dims, x, z, rot };
  };
  if (floorId === "stuga")
    return [mk("bed-single", 2.75, -1.1), mk("table-dining", 1.2, -1.55), mk("chair", 1.2, -0.95, 180)];
  if (floorId === "bottenplan")
    return [
      mk("sofa", 4.35, -7.9, 180),
      mk("table-coffee", 4.35, -6.9),
      mk("armchair", 5.4, -6.9, -90),
      mk("bookshelf", 2.75, -7.4, 90),
      mk("table-dining", 4.8, -2.0),
      mk("chair", 4.4, -1.55, 180), mk("chair", 5.2, -1.55, 180),
      mk("chair", 4.4, -2.45), mk("chair", 5.2, -2.45),
      mk("bed-double", 1.35, -7.7),
      mk("sideboard", 5.75, -5.2, -90),
    ];
  if (floorId === "overplan")
    return [
      mk("bed-double", 1.2, -7.6),
      mk("bed-single", 4.2, -8.2, -90),
      mk("desk", 5.3, -6.2, 180),
      mk("bed-single", 3.2, -1.2, 90),
      mk("bookshelf", 5.5, -3.0, 180),
      mk("wardrobe", 1.0, -3.2, 180),
    ];
  return [];
}

// ---------- renderer / scene ----------
const canvas = document.getElementById("canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x252830);
scene.fog = new THREE.Fog(0x252830, 40, 90);

const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);

const hemi = new THREE.HemisphereLight(0xdfe8f0, 0x8a8272, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.position.set(9, 12, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
sun.shadow.bias = -0.0004;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(60, 48),
  new THREE.MeshStandardMaterial({ color: 0x59614e, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.11;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(30, 30, 0x3c4046, 0x33363c);
grid.position.y = -0.1;
scene.add(grid);

// ---------- controls ----------
const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.maxPolarAngle = Math.PI * 0.495;
orbit.minDistance = 1.5;
orbit.maxDistance = 45;

const freeLook = new PointerLockControls(camera, canvas);
const move = { f: 0, b: 0, l: 0, r: 0, sprint: false };
let freeLookActive = false;

// ---------- state ----------
let currentFloor = null; // { id, plan, group, bounds }
let items = []; // furniture on the current floor
const furnitureRoot = new THREE.Group();
scene.add(furnitureRoot);
let placing = null; // { preset, ghost }
let selectedId = null;
let dragging = null; // { id, group }
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let pointerDownAt = null;
let snapFaces = [];

// ---------- wall snapping ----------
// Faces are world-space segments with outward normals, built from plan data
// (both faces of every wall, plus fixture and column rectangles).
function computeSnapFaces(plan) {
  const faces = [];
  const addRect = (x, y, w, d) => {
    const x1 = x * 0.01, x2 = (x + w) * 0.01;
    const zN = -(y + d) * 0.01, zS = -y * 0.01; // north is -z
    faces.push(
      { ax: x1, az: zS, bx: x2, bz: zS, nx: 0, nz: 1 },
      { ax: x1, az: zN, bx: x2, bz: zN, nx: 0, nz: -1 },
      { ax: x1, az: zN, bx: x1, bz: zS, nx: -1, nz: 0 },
      { ax: x2, az: zN, bx: x2, bz: zS, nx: 1, nz: 0 }
    );
  };
  for (const wall of plan.walls ?? []) {
    const x1 = wall.from[0] * 0.01, z1 = -wall.from[1] * 0.01;
    const x2 = wall.to[0] * 0.01, z2 = -wall.to[1] * 0.01;
    const len = Math.hypot(x2 - x1, z2 - z1);
    const nx = -(z2 - z1) / len, nz = (x2 - x1) / len;
    const t2 = (wall.thickness * 0.01) / 2;
    for (const s of [1, -1])
      faces.push({
        ax: x1 + nx * t2 * s, az: z1 + nz * t2 * s,
        bx: x2 + nx * t2 * s, bz: z2 + nz * t2 * s,
        nx: nx * s, nz: nz * s,
      });
  }
  for (const f of plan.fixtures ?? []) addRect(f.x, f.y, f.w, f.d);
  for (const c of plan.columns ?? []) addRect(c.x, c.y, c.w, c.d);
  return faces;
}

const SNAP_DIST = 0.18;
// Pull the rotated footprint (w × d metres at rotDeg) flush against the
// nearest face within range; a second pass allows corner snaps.
function snapToWalls(px, pz, w, d, rotDeg) {
  const rad = THREE.MathUtils.degToRad(rotDeg ?? 0);
  const c = Math.cos(rad), s = Math.sin(rad);
  let x = px, z = pz;
  let first = null;
  for (let pass = 0; pass < 2; pass++) {
    let best = null;
    for (const f of snapFaces) {
      if (first && Math.abs(f.nx * first.nx + f.nz * first.nz) > 0.7) continue;
      // support radius of the oriented footprint along the face normal
      const support =
        Math.abs((w / 2) * (c * f.nx - s * f.nz)) +
        Math.abs((d / 2) * (s * f.nx + c * f.nz));
      const gap = (x - f.ax) * f.nx + (z - f.az) * f.nz - support;
      if (gap < -0.25 || gap > SNAP_DIST) continue;
      const fl = Math.hypot(f.bx - f.ax, f.bz - f.az);
      const tx = (f.bx - f.ax) / fl, tz = (f.bz - f.az) / fl;
      const proj = (x - f.ax) * tx + (z - f.az) * tz;
      if (proj < -0.05 || proj > fl + 0.05) continue;
      if (!best || Math.abs(gap) < Math.abs(best.gap)) best = { f, gap };
    }
    if (!best) break;
    x -= best.f.nx * best.gap;
    z -= best.f.nz * best.gap;
    first = best.f;
  }
  return { x, z };
}

// ---------- floor loading ----------
async function loadFloor(id) {
  const res = await fetch(`../plans/${id}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`failed to load plan ${id}: ${res.status}`);
  const plan = await res.json();

  if (currentFloor) scene.remove(currentFloor.group);
  cancelPlacement();
  select(null);

  const group = buildFloor(plan);
  scene.add(group);
  currentFloor = { id, plan, group, bounds: group.userData.bounds };

  group.getObjectByName("ceiling").visible = document.getElementById("chk-ceiling").checked;
  group.getObjectByName("room-labels").visible = document.getElementById("chk-labels").checked;

  items = loadLayout(currentProject.id, id);
  if (params.has("demo") && items.length === 0) items = demoLayout(id);
  snapFaces = computeSnapFaces(plan);
  rebuildFurniture();

  for (const btn of document.querySelectorAll("#floor-buttons button"))
    btn.classList.toggle("active", btn.dataset.floor === id);
  if (params.get("view") === "top") topCamera();
  else resetCamera();

  if (params.has("debug")) {
    let meshes = 0;
    group.traverse((o) => o.isMesh && meshes++);
    document.getElementById("debug-stats")?.remove();
    const pre = document.createElement("pre");
    pre.id = "debug-stats";
    pre.style.cssText = "position:fixed;bottom:4px;right:4px;color:#8f8;font-size:11px";
    pre.textContent = JSON.stringify({
      floor: id,
      planWalls: plan.walls.length,
      wallIds: plan.walls.map((w) => w.id),
      sceneMeshes: meshes,
      wallHeight: plan.wallHeight,
    });
    document.body.append(pre);
  }
}

function topCamera() {
  const { width, depth } = currentFloor.bounds;
  const cx = width / 2;
  const cz = -depth / 2;
  const m = Math.max(width, depth, 4.5);
  camera.position.set(cx, m * 1.5, cz + 0.001); // near-vertical, from the south: north up on screen
  orbit.target.set(cx, 0, cz);
  orbit.update();
}

function resetCamera() {
  const { width, depth } = currentFloor.bounds;
  const cx = width / 2;
  const cz = -depth / 2;
  // fixed start angle: from the south-east, ~40 degrees up, scaled to the plan
  const m = Math.max(width, depth, 4.5);
  camera.position.set(cx + m * 0.7, m, cz + m * 0.9);
  orbit.target.set(cx, 0.6, cz);
  orbit.update();
}

// ---------- furniture ----------
function rebuildFurniture() {
  furnitureRoot.clear();
  for (const item of items) furnitureRoot.add(buildItem(item));
  applySelectionTint();
}

function itemGroup(id) {
  return furnitureRoot.children.find((g) => g.userData.itemId === id);
}

function applySelectionTint() {
  furnitureRoot.traverse((o) => {
    if (o.isMesh)
      o.material.emissive?.setHex(o.userData.itemId === selectedId ? 0x2a3a55 : 0x000000);
  });
}

function persist() {
  saveLayout(currentProject.id, currentFloor.id, items);
}

function select(id) {
  selectedId = id;
  applySelectionTint();
  const panel = document.getElementById("selection-panel");
  const item = items.find((i) => i.id === id);
  panel.hidden = !item;
  if (item) {
    document.getElementById("sel-name").textContent = presetById(item.preset)?.name ?? item.preset;
    document.getElementById("dim-w").value = item.w;
    document.getElementById("dim-d").value = item.d;
    document.getElementById("dim-h").value = item.h;
  }
}

function startPlacement(presetId) {
  cancelPlacement();
  const preset = presetById(presetId);
  const ghost = preset.build(preset.w / 100, preset.d / 100, preset.h / 100);
  ghost.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.45;
      o.castShadow = false;
    }
  });
  ghost.visible = false;
  scene.add(ghost);
  placing = { preset, ghost, rot: 0 };
  document.getElementById("place-hint").hidden = false;
  for (const btn of document.querySelectorAll("#palette button"))
    btn.classList.toggle("active", btn.dataset.preset === presetId);
}

function cancelPlacement() {
  if (placing) scene.remove(placing.ghost);
  placing = null;
  document.getElementById("place-hint").hidden = true;
  for (const btn of document.querySelectorAll("#palette button")) btn.classList.remove("active");
}

function floorPointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  pointerNdc.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(pointerNdc, camera);
  const point = new THREE.Vector3();
  return raycaster.ray.intersectPlane(floorPlane, point) ? point : null;
}

function pickItem(event) {
  const rect = canvas.getBoundingClientRect();
  pointerNdc.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObjects(furnitureRoot.children, true);
  return hits.length ? hits[0].object.userData.itemId : null;
}

function placeAt(point) {
  const p = placing.preset;
  const item = {
    id: `${p.id}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
    preset: p.id,
    w: p.w, d: p.d, h: p.h,
    x: point.x, z: point.z, rot: placing.rot ?? 0,
  };
  items.push(item);
  furnitureRoot.add(buildItem(item));
  persist();
  cancelPlacement();
  select(item.id);
}

function updateSelectedDims() {
  const item = items.find((i) => i.id === selectedId);
  if (!item) return;
  item.w = Math.max(10, Number(document.getElementById("dim-w").value) || item.w);
  item.d = Math.max(10, Number(document.getElementById("dim-d").value) || item.d);
  item.h = Math.max(10, Number(document.getElementById("dim-h").value) || item.h);
  persist();
  rebuildFurniture();
}

function rotateSelected(deg) {
  const item = items.find((i) => i.id === selectedId);
  if (!item) return;
  item.rot = ((item.rot ?? 0) + deg) % 360;
  const g = itemGroup(item.id);
  if (g) g.rotation.y = THREE.MathUtils.degToRad(item.rot);
  persist();
}

function deleteSelected() {
  if (!selectedId) return;
  items = items.filter((i) => i.id !== selectedId);
  persist();
  select(null);
  rebuildFurniture();
}

function duplicateSelected() {
  const item = items.find((i) => i.id === selectedId);
  if (!item) return;
  const copy = {
    ...item,
    id: `${item.preset}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
    x: item.x + 0.4,
    z: item.z + 0.4,
  };
  items.push(copy);
  furnitureRoot.add(buildItem(copy));
  persist();
  select(copy.id);
}

// ---------- pointer interaction ----------
const tooltip = document.getElementById("tooltip");

function updateHoverInfo(e) {
  // walls/fixtures carry userData.info; show it near the cursor
  const rect = canvas.getBoundingClientRect();
  pointerNdc.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(pointerNdc, camera);
  const hit = currentFloor
    ? raycaster.intersectObjects(currentFloor.group.children, true).find((i) => i.object.userData.info)
    : null;
  tooltip.hidden = !hit;
  if (hit) {
    tooltip.textContent = hit.object.userData.info;
    tooltip.style.left = `${e.clientX + 14}px`;
    tooltip.style.top = `${e.clientY + 14}px`;
  }
}

canvas.addEventListener("pointermove", (e) => {
  if (freeLookActive) return;
  if (placing) {
    tooltip.hidden = true;
    const point = floorPointFromEvent(e);
    if (point) {
      placing.ghost.visible = true;
      const p = e.altKey
        ? point
        : snapToWalls(point.x, point.z, placing.preset.w / 100, placing.preset.d / 100, placing.rot);
      placing.ghost.position.set(p.x, 0, p.z);
    }
  } else if (dragging) {
    tooltip.hidden = true;
    const point = floorPointFromEvent(e);
    if (point) {
      const item = items.find((i) => i.id === dragging.id);
      const raw = { x: point.x - dragging.dx, z: point.z - dragging.dz };
      const p = e.altKey || !item
        ? raw
        : snapToWalls(raw.x, raw.z, item.w / 100, item.d / 100, item.rot);
      dragging.group.position.set(p.x, 0, p.z);
    }
  } else if (pointerDownAt) {
    tooltip.hidden = true; // orbiting
  } else {
    updateHoverInfo(e);
  }
});
canvas.addEventListener("pointerleave", () => (tooltip.hidden = true));

canvas.addEventListener("pointerdown", (e) => {
  if (freeLookActive || e.button !== 0) return;
  pointerDownAt = { x: e.clientX, y: e.clientY };
  if (placing) return;
  const id = pickItem(e);
  if (id) {
    const group = itemGroup(id);
    const point = floorPointFromEvent(e);
    dragging = {
      id, group,
      dx: point ? point.x - group.position.x : 0,
      dz: point ? point.z - group.position.z : 0,
      moved: false,
    };
    orbit.enabled = false;
    select(id);
  }
});

canvas.addEventListener("pointerup", (e) => {
  if (freeLookActive || e.button !== 0) return;
  const clickDist = pointerDownAt
    ? Math.hypot(e.clientX - pointerDownAt.x, e.clientY - pointerDownAt.y)
    : 999;
  if (placing) {
    if (clickDist < 6) {
      // the ghost already sits at the snapped position
      const point = placing.ghost.visible ? placing.ghost.position.clone() : floorPointFromEvent(e);
      if (point) placeAt(point);
    }
  } else if (dragging) {
    const item = items.find((i) => i.id === dragging.id);
    if (item) {
      item.x = dragging.group.position.x;
      item.z = dragging.group.position.z;
      persist();
    }
    dragging = null;
    orbit.enabled = true;
  } else if (clickDist < 6) {
    select(null); // clicked empty space
  }
  pointerDownAt = null;
});

// ---------- keyboard ----------
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;
  switch (e.code) {
    case "KeyW": move.f = 1; break;
    case "KeyS": move.b = 1; break;
    case "KeyA": move.l = 1; break;
    case "KeyD": move.r = 1; break;
    case "ShiftLeft": case "ShiftRight": move.sprint = true; break;
    case "KeyF": if (!freeLookActive) enterFreeLook(); break;
    case "KeyT":
      if (freeLookActive) break;
      e.preventDefault();
      if (placing) {
        placing.rot = ((placing.rot ?? 0) + (e.shiftKey ? -90 : 90)) % 360;
        placing.ghost.rotation.y = THREE.MathUtils.degToRad(placing.rot);
      } else {
        rotateSelected(e.shiftKey ? -90 : 90);
      }
      break;
    case "Delete": case "Backspace": if (!freeLookActive) deleteSelected(); break;
    case "Escape": cancelPlacement(); break;
  }
});
window.addEventListener("keyup", (e) => {
  switch (e.code) {
    case "KeyW": move.f = 0; break;
    case "KeyS": move.b = 0; break;
    case "KeyA": move.l = 0; break;
    case "KeyD": move.r = 0; break;
    case "ShiftLeft": case "ShiftRight": move.sprint = false; break;
  }
});

// ---------- free look ----------
function enterFreeLook() {
  cancelPlacement();
  const { width, depth } = currentFloor.bounds;
  camera.position.set(width / 2, 1.6, -depth / 2);
  freeLook.lock();
}
freeLook.addEventListener("lock", () => {
  freeLookActive = true;
  orbit.enabled = false;
  document.getElementById("freelook-hud").hidden = false;
});
freeLook.addEventListener("unlock", () => {
  freeLookActive = false;
  orbit.enabled = true;
  document.getElementById("freelook-hud").hidden = true;
  resetCamera();
});
document.getElementById("btn-freelook").addEventListener("click", enterFreeLook);

// ---------- layout save/load ----------
function exportLayouts() {
  persist(); // flush current floor to localStorage first
  const layouts = {};
  for (const f of currentProject.floors)
    layouts[f.id] = f.id === currentFloor?.id ? items : loadLayout(currentProject.id, f.id);
  const payload = {
    app: "house-visualizer", version: 2, project: currentProject.id,
    saved: new Date().toISOString(), layouts,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `mobler-${currentProject.id}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function sanitizeItems(list) {
  if (!Array.isArray(list)) return null;
  return list
    .filter((i) => i && typeof i.preset === "string")
    .map((i, n) => ({
      id: String(i.id ?? `import-${Date.now().toString(36)}-${n}`),
      preset: i.preset,
      w: Number(i.w) || 50, d: Number(i.d) || 50, h: Number(i.h) || 50,
      x: Number(i.x) || 0, z: Number(i.z) || 0, rot: Number(i.rot) || 0,
    }));
}

async function importLayouts(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    alert("Ogiltig layoutfil: kunde inte läsa JSON.");
    return;
  }
  // full export { layouts: { floorId: [...] } } or a bare item array (applied to the current floor)
  const layouts = data.layouts ?? (Array.isArray(data) ? { [currentFloor.id]: data } : null);
  if (!layouts) {
    alert("Ogiltig layoutfil: hittade varken \"layouts\" eller en möbellista.");
    return;
  }
  // Resolve each floor to its owning project: the file's project field if it
  // matches, else whichever project contains that floor id (floor ids are
  // globally unique — this is how pre-multi-project (v1) files migrate).
  let applied = 0;
  for (const [floorId, list] of Object.entries(layouts)) {
    const owner =
      manifest.projects.find((p) => p.id === data.project && p.floors.some((f) => f.id === floorId)) ??
      manifest.projects.find((p) => p.floors.some((f) => f.id === floorId));
    const clean = owner ? sanitizeItems(list) : null;
    if (!clean) continue;
    saveLayout(owner.id, floorId, clean);
    applied++;
  }
  if (!applied) {
    alert("Layoutfilen innehöll inga giltiga våningar.");
    return;
  }
  cancelPlacement();
  select(null);
  items = loadLayout(currentProject.id, currentFloor.id);
  rebuildFurniture();
}

document.getElementById("btn-save-layout").addEventListener("click", exportLayouts);
const layoutFileInput = document.getElementById("layout-file");
document.getElementById("btn-load-layout").addEventListener("click", () => layoutFileInput.click());
layoutFileInput.addEventListener("change", () => {
  if (layoutFileInput.files[0]) importLayouts(layoutFileInput.files[0]);
  layoutFileInput.value = ""; // allow re-loading the same file
});

// ---------- UI wiring ----------
async function loadProject(projectId, floorId) {
  currentProject = manifest.projects.find((p) => p.id === projectId) ?? manifest.projects[0];
  document.getElementById("project-select").value = currentProject.id;
  document.getElementById("app-subtitle").textContent = currentProject.name;
  const floorButtons = document.getElementById("floor-buttons");
  floorButtons.innerHTML = "";
  for (const f of currentProject.floors) {
    const btn = document.createElement("button");
    btn.textContent = f.label;
    btn.dataset.floor = f.id;
    btn.addEventListener("click", () => loadFloor(f.id));
    floorButtons.append(btn);
  }
  const wanted = currentProject.floors.some((f) => f.id === floorId) ? floorId : currentProject.floors[0].id;
  await loadFloor(wanted);
}

const palette = document.getElementById("palette");
for (const p of PRESETS) {
  const btn = document.createElement("button");
  btn.innerHTML = `${p.name}<small>${p.note} cm</small>`;
  btn.dataset.preset = p.id;
  btn.addEventListener("click", () => startPlacement(p.id));
  palette.append(btn);
}

document.getElementById("btn-reset-cam").addEventListener("click", resetCamera);
document.getElementById("btn-top-cam").addEventListener("click", topCamera);
document.getElementById("chk-ceiling").addEventListener("change", (e) => {
  currentFloor?.group.getObjectByName("ceiling") &&
    (currentFloor.group.getObjectByName("ceiling").visible = e.target.checked);
});
document.getElementById("chk-labels").addEventListener("change", (e) => {
  currentFloor?.group.getObjectByName("room-labels") &&
    (currentFloor.group.getObjectByName("room-labels").visible = e.target.checked);
});
for (const dim of ["dim-w", "dim-d", "dim-h"])
  document.getElementById(dim).addEventListener("change", updateSelectedDims);
for (const btn of document.querySelectorAll("#rot-buttons button"))
  btn.addEventListener("click", () => rotateSelected(Number(btn.dataset.deg)));
document.getElementById("btn-delete").addEventListener("click", deleteSelected);
document.getElementById("btn-duplicate").addEventListener("click", duplicateSelected);

// ---------- resize / loop ----------
function resize() {
  const { clientWidth: w, clientHeight: h } = canvas.parentElement;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// floating dimension badge above the selected piece
const dimBadge = document.getElementById("dim-badge");
const badgePos = new THREE.Vector3();
function updateDimBadge() {
  const item = items.find((i) => i.id === selectedId);
  const group = item && itemGroup(item.id);
  if (!item || !group || freeLookActive) {
    dimBadge.hidden = true;
    return;
  }
  badgePos.set(group.position.x, item.h / 100 + 0.25, group.position.z).project(camera);
  if (badgePos.z > 1) {
    dimBadge.hidden = true;
    return;
  }
  const rect = canvas.getBoundingClientRect();
  dimBadge.hidden = false;
  dimBadge.textContent = `${item.w} × ${item.d} × ${item.h} cm · ${item.rot ?? 0}°`;
  dimBadge.style.left = `${rect.left + (badgePos.x * 0.5 + 0.5) * rect.width}px`;
  dimBadge.style.top = `${rect.top + (-badgePos.y * 0.5 + 0.5) * rect.height}px`;
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  updateDimBadge();
  if (freeLookActive) {
    const speed = move.sprint ? 5.5 : 2.6;
    const fwd = (move.f - move.b) * speed * dt;
    const side = (move.r - move.l) * speed * dt;
    if (fwd) freeLook.moveForward(fwd);
    if (side) freeLook.moveRight(side);
    camera.position.y = 1.6; // eye height, locked to the floor
  } else {
    orbit.update();
  }
  renderer.render(scene, camera);
}

async function boot() {
  const res = await fetch("../plans/index.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`failed to load project manifest: ${res.status}`);
  manifest = await res.json();
  migrateLegacyStorage(manifest); // pick up pre-multi-project layouts

  const select = document.getElementById("project-select");
  for (const p of manifest.projects) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    select.append(opt);
  }
  select.addEventListener("change", () => loadProject(select.value));

  const wantedFloor = params.get("floor");
  const projectId =
    params.get("project") ??
    manifest.projects.find((p) => p.floors.some((f) => f.id === wantedFloor))?.id ??
    manifest.projects[0].id;
  await loadProject(projectId, wantedFloor ?? undefined);
  animate();
}

boot().catch((err) => {
  document.body.insertAdjacentHTML("beforeend", `<pre style="position:fixed;top:10px;right:10px;color:#f88">${err}</pre>`);
  console.error(err);
});
