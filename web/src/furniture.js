// Phase 3: parametric furniture. Every builder gets (w, d, h) in metres and
// returns a Group whose footprint is centred on the origin with its base at
// y=0, so placement only ever sets (x, z, rotY) — floor lock is structural.
import * as THREE from "three";

const mat = (color, rough = 0.85) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough });

function part(group, w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

const WOOD = 0x9a7b52;
const WOOD_LIGHT = 0xbfa274;
const FABRIC = 0x7d8a96;
const FABRIC_WARM = 0xa8837a;
const WHITE = 0xdad5cc;
const DARK = 0x4d4a45;

export const PRESETS = [
  {
    id: "bookshelf", name: "Bokhylla", note: "80×28×202",
    w: 80, d: 28, h: 202,
    build(w, d, h) {
      const g = new THREE.Group();
      const wood = mat(WOOD_LIGHT);
      const t = 0.02;
      part(g, t, h, d, wood, -w / 2 + t / 2);
      part(g, t, h, d, wood, w / 2 - t / 2);
      part(g, w, t, d, wood, 0, h - t);
      part(g, w - 2 * t, h - t, 0.008, mat(DARK), 0, 0, -d / 2 + 0.004);
      const shelves = Math.max(2, Math.round(h / 0.38));
      for (let i = 0; i < shelves; i++)
        part(g, w - 2 * t, t, d - 0.01, wood, 0, (i * (h - t)) / shelves, 0.005);
      return g;
    },
  },
  {
    id: "wardrobe", name: "Garderob", note: "100×58×210",
    w: 100, d: 58, h: 210,
    build(w, d, h) {
      const g = new THREE.Group();
      part(g, w, h, d - 0.02, mat(WHITE), 0, 0, -0.01);
      part(g, w / 2 - 0.006, h - 0.02, 0.018, mat(0xcfc9bf), -w / 4 - 0.002, 0.01, d / 2 - 0.009);
      part(g, w / 2 - 0.006, h - 0.02, 0.018, mat(0xcfc9bf), w / 4 + 0.002, 0.01, d / 2 - 0.009);
      part(g, 0.015, 0.12, 0.02, mat(DARK, 0.4), -0.02, h * 0.5, d / 2);
      part(g, 0.015, 0.12, 0.02, mat(DARK, 0.4), 0.02, h * 0.5, d / 2);
      return g;
    },
  },
  {
    id: "bed-double", name: "Dubbelsäng", note: "160×200×55",
    w: 160, d: 200, h: 55,
    build(w, d, h) {
      const g = new THREE.Group();
      part(g, w, h * 0.45, d, mat(WOOD), 0, 0, 0);
      part(g, w - 0.06, h * 0.35, d - 0.06, mat(0xe6e1d5, 0.95), 0, h * 0.45, 0);
      part(g, w, h * 0.55, 0.05, mat(WOOD), 0, h * 0.45, -d / 2 + 0.025); // headboard (plan-north end)
      const pw = (w - 0.14) / 2;
      part(g, pw, 0.1, 0.4, mat(0xf1ede2, 1), -w / 4 + 0.01, h * 0.8, -d / 2 + 0.28);
      part(g, pw, 0.1, 0.4, mat(0xf1ede2, 1), w / 4 - 0.01, h * 0.8, -d / 2 + 0.28);
      return g;
    },
  },
  {
    id: "bed-single", name: "Enkelsäng", note: "90×200×55",
    w: 90, d: 200, h: 55,
    build(w, d, h) {
      const g = new THREE.Group();
      part(g, w, h * 0.45, d, mat(WOOD), 0, 0, 0);
      part(g, w - 0.05, h * 0.35, d - 0.05, mat(0xe6e1d5, 0.95), 0, h * 0.45, 0);
      part(g, w, h * 0.55, 0.05, mat(WOOD), 0, h * 0.45, -d / 2 + 0.025);
      part(g, w - 0.2, 0.1, 0.4, mat(0xf1ede2, 1), 0, h * 0.8, -d / 2 + 0.28);
      return g;
    },
  },
  {
    id: "sofa", name: "Soffa", note: "220×95×82",
    w: 220, d: 95, h: 82,
    build(w, d, h) {
      const g = new THREE.Group();
      const fab = mat(FABRIC, 0.95);
      const arm = w * 0.09;
      part(g, w, h * 0.5, d, fab, 0, 0, 0);
      part(g, w, h * 0.5, d * 0.28, fab, 0, h * 0.5, -d / 2 + d * 0.14); // backrest
      part(g, arm, h * 0.32, d, fab, -w / 2 + arm / 2, h * 0.5, 0);
      part(g, arm, h * 0.32, d, fab, w / 2 - arm / 2, h * 0.5, 0);
      const cw = (w - 2 * arm) / 3;
      for (let i = 0; i < 3; i++)
        part(g, cw - 0.02, 0.1, d * 0.6, mat(0x8b98a4, 1), -w / 2 + arm + cw * (i + 0.5), h * 0.5, d * 0.1);
      return g;
    },
  },
  {
    id: "armchair", name: "Fåtölj", note: "85×85×95",
    w: 85, d: 85, h: 95,
    build(w, d, h) {
      const g = new THREE.Group();
      const fab = mat(FABRIC_WARM, 0.95);
      const arm = w * 0.14;
      part(g, w, h * 0.42, d, fab, 0, 0, 0);
      part(g, w, h * 0.58, d * 0.25, fab, 0, h * 0.42, -d / 2 + d * 0.125);
      part(g, arm, h * 0.25, d, fab, -w / 2 + arm / 2, h * 0.42, 0);
      part(g, arm, h * 0.25, d, fab, w / 2 - arm / 2, h * 0.42, 0);
      return g;
    },
  },
  {
    id: "table-dining", name: "Matbord", note: "140×85×74",
    w: 140, d: 85, h: 74,
    build(w, d, h) {
      const g = new THREE.Group();
      const wood = mat(WOOD);
      part(g, w, 0.035, d, wood, 0, h - 0.035, 0);
      const leg = 0.05;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
        part(g, leg, h - 0.035, leg, wood, sx * (w / 2 - leg), 0, sz * (d / 2 - leg));
      return g;
    },
  },
  {
    id: "table-coffee", name: "Soffbord", note: "120×60×45",
    w: 120, d: 60, h: 45,
    build(w, d, h) {
      const g = new THREE.Group();
      const wood = mat(WOOD_LIGHT);
      part(g, w, 0.03, d, wood, 0, h - 0.03, 0);
      const leg = 0.04;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
        part(g, leg, h - 0.03, leg, wood, sx * (w / 2 - leg), 0, sz * (d / 2 - leg));
      return g;
    },
  },
  {
    id: "chair", name: "Stol", note: "45×50×88",
    w: 45, d: 50, h: 88,
    build(w, d, h) {
      const g = new THREE.Group();
      const wood = mat(WOOD);
      const seatH = h * 0.52;
      part(g, w, 0.03, d, wood, 0, seatH - 0.03, 0);
      part(g, w, h - seatH, 0.03, wood, 0, seatH, -d / 2 + 0.015);
      const leg = 0.032;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
        part(g, leg, seatH - 0.03, leg, wood, sx * (w / 2 - leg), 0, sz * (d / 2 - leg));
      return g;
    },
  },
  {
    id: "desk", name: "Skrivbord", note: "120×65×74",
    w: 120, d: 65, h: 74,
    build(w, d, h) {
      const g = new THREE.Group();
      const wood = mat(WOOD_LIGHT);
      part(g, w, 0.03, d, wood, 0, h - 0.03, 0);
      part(g, 0.025, h - 0.03, d - 0.06, mat(WHITE), -w / 2 + 0.0125, 0, 0);
      part(g, 0.025, h - 0.03, d - 0.06, mat(WHITE), w / 2 - 0.0125, 0, 0);
      part(g, w * 0.3, h * 0.55, d - 0.08, mat(WHITE), w / 2 - w * 0.15 - 0.03, 0, 0);
      return g;
    },
  },
  {
    id: "sideboard", name: "Sideboard", note: "180×42×80",
    w: 180, d: 42, h: 80,
    build(w, d, h) {
      const g = new THREE.Group();
      part(g, w, h - 0.1, d, mat(WOOD), 0, 0.1, 0);
      part(g, 0.04, 0.1, 0.04, mat(DARK), -w / 2 + 0.06, 0, d / 2 - 0.06);
      part(g, 0.04, 0.1, 0.04, mat(DARK), w / 2 - 0.06, 0, d / 2 - 0.06);
      part(g, 0.04, 0.1, 0.04, mat(DARK), -w / 2 + 0.06, 0, -d / 2 + 0.06);
      part(g, 0.04, 0.1, 0.04, mat(DARK), w / 2 - 0.06, 0, -d / 2 + 0.06);
      return g;
    },
  },
  {
    id: "custom", name: "Egen låda", note: "valfria mått",
    w: 100, d: 50, h: 100,
    build(w, d, h) {
      const g = new THREE.Group();
      part(g, w, h, d, mat(0x8f9a6e));
      return g;
    },
  },
];

export const presetById = (id) => PRESETS.find((p) => p.id === id);

// Build one placed item. dims in cm, position in metres, rotation degrees.
export function buildItem(item) {
  const preset = presetById(item.preset) ?? presetById("custom");
  const group = preset.build(item.w / 100, item.d / 100, item.h / 100);
  group.position.set(item.x, 0, item.z);
  group.rotation.y = THREE.MathUtils.degToRad(item.rot ?? 0);
  group.userData.itemId = item.id;
  group.traverse((o) => (o.userData.itemId = item.id));
  return group;
}

const storageKey = (floorId) => `house-visualizer:furniture:${floorId}`;

export function loadLayout(floorId) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(floorId)) ?? "[]");
  } catch {
    return [];
  }
}

export function saveLayout(floorId, items) {
  localStorage.setItem(storageKey(floorId), JSON.stringify(items));
}
