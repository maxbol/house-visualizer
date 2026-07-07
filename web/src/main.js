import * as THREE from "three";
import { OrbitControls } from "../vendor/OrbitControls.js";
import { PointerLockControls } from "../vendor/PointerLockControls.js";
import { buildFloor } from "./buildFloor.js";
import { PRESETS, presetById, buildItem, loadLayout, saveLayout } from "./furniture.js";

const FLOORS = [
  { id: "bottenplan", label: "Bottenplan" },
  { id: "overplan", label: "Överplan" },
];

// URL params: ?floor=overplan picks the start floor, ?demo=1 furnishes an
// empty floor with a sample layout (not persisted).
const params = new URLSearchParams(location.search);

function demoLayout(floorId) {
  const mk = (preset, x, z, rot = 0, dims = {}) => {
    const p = presetById(preset);
    return { id: `demo-${preset}-${x}-${z}`, preset, w: p.w, d: p.d, h: p.h, ...dims, x, z, rot };
  };
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
  return [
    mk("bed-double", 1.2, -7.6),
    mk("bed-single", 4.2, -8.2, -90),
    mk("desk", 5.3, -6.2, 180),
    mk("bed-single", 3.2, -1.2, 90),
    mk("bookshelf", 5.5, -3.0, 180),
    mk("wardrobe", 1.0, -3.2, 180),
  ];
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

// ---------- floor loading ----------
async function loadFloor(id) {
  const res = await fetch(`../plans/${id}.json`);
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

  items = loadLayout(id);
  if (params.has("demo") && items.length === 0) items = demoLayout(id);
  rebuildFurniture();

  for (const btn of document.querySelectorAll("#floor-buttons button"))
    btn.classList.toggle("active", btn.dataset.floor === id);
  if (params.get("view") === "top") topCamera();
  else resetCamera();
}

function topCamera() {
  const { width, depth } = currentFloor.bounds;
  const cx = width / 2;
  const cz = -depth / 2;
  camera.position.set(cx, 13.5, cz + 0.001); // near-vertical, from the south: north up on screen
  orbit.target.set(cx, 0, cz);
  orbit.update();
}

function resetCamera() {
  const { width, depth } = currentFloor.bounds;
  const cx = width / 2;
  const cz = -depth / 2;
  // fixed start angle: from the south-east, 40 degrees up
  camera.position.set(cx + 6.4, 7.6, cz + 8.2);
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
  saveLayout(currentFloor.id, items);
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
  placing = { preset, ghost };
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
    x: point.x, z: point.z, rot: 0,
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
  const copy = { ...item, id: `${item.preset}-${Date.now().toString(36)}`, x: item.x + 0.4, z: item.z + 0.4 };
  items.push(copy);
  furnitureRoot.add(buildItem(copy));
  persist();
  select(copy.id);
}

// ---------- pointer interaction ----------
canvas.addEventListener("pointermove", (e) => {
  if (freeLookActive) return;
  if (placing) {
    const point = floorPointFromEvent(e);
    if (point) {
      placing.ghost.visible = true;
      placing.ghost.position.set(point.x, 0, point.z);
    }
  } else if (dragging) {
    const point = floorPointFromEvent(e);
    if (point) {
      dragging.group.position.set(point.x - dragging.dx, 0, point.z - dragging.dz);
    }
  }
});

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
      const point = floorPointFromEvent(e);
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
    case "KeyR": if (!freeLookActive) rotateSelected(e.shiftKey ? -15 : 15); break;
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

// ---------- UI wiring ----------
const floorButtons = document.getElementById("floor-buttons");
for (const f of FLOORS) {
  const btn = document.createElement("button");
  btn.textContent = f.label;
  btn.dataset.floor = f.id;
  btn.addEventListener("click", () => loadFloor(f.id));
  floorButtons.append(btn);
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
document.getElementById("btn-rotate").addEventListener("click", () => rotateSelected(15));
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

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
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

const startFloor = FLOORS.find((f) => f.id === params.get("floor"))?.id ?? FLOORS[0].id;
loadFloor(startFloor).then(animate).catch((err) => {
  document.body.insertAdjacentHTML("beforeend", `<pre style="position:fixed;top:10px;right:10px;color:#f88">${err}</pre>`);
  console.error(err);
});
