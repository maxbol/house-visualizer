// Room name labels: canvas-textured planes lying flat on the floor.
import * as THREE from "three";

export function makeFloorLabel(text, maxWidth = Infinity) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.font = "700 72px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(44, 37, 28, 0.85)";
  ctx.fillText(text, 256, 68);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const width = Math.min(0.42 * text.length + 0.5, 2.6, maxWidth);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 2;
  return mesh;
}
