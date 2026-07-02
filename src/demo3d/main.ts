/**
 * HGSS 3D demo — fly over Johto/Kanto in the browser.
 *
 * Standalone tech demo (not wired into the 2D viewer's trigger/mark systems):
 * streams the apicula-converted land-chunk GLBs around the camera target and
 * instances building models at their fx32 placements, exactly the data the
 * oblique 2D renderer consumes. Assets come from res/pokemon_hgss_3d/
 * (produced by nes_decoder's tools/_export_hgss_3d_demo.py).
 *
 * NDS models are unlit (texture × vertex colour), so every GLTF material is
 * converted to MeshBasicMaterial with NEAREST filtering for the pixel look.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const BASE = '/res/pokemon_hgss_3d/';
const CHUNK = 512;
const LOAD_RADIUS = 2200;      // stream chunks whose centre is within this
const UNLOAD_RADIUS = 3000;

interface Manifest {
  chunkUnits: number;
  width: number;
  height: number;
  grid: { cx: number; cy: number; land: number }[];
  buildings: Record<string, { m: number; x: number; y: number; z: number }[]>;
}

const app = document.getElementById('app')!;
const stats = document.getElementById('stats')!;

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x6ab7e8);
scene.fog = new THREE.Fog(0x6ab7e8, 2400, 4200);

const camera = new THREE.PerspectiveCamera(
  50, window.innerWidth / window.innerHeight, 4, 30000);

// Start over Goldenrod-ish (chunk 5,10)
const start = new THREE.Vector3(5.5 * CHUNK, 0, 10.5 * CHUNK);
camera.position.set(start.x, 900, start.z + 900);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(start);
controls.maxPolarAngle = Math.PI * 0.49;
controls.enableDamping = true;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/** Convert GLTF materials to unlit MeshBasicMaterial with pixel filtering. */
function toUnlit(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const converted = mats.map((m) => {
      const src = m as THREE.MeshStandardMaterial;
      const map = src.map ?? null;
      if (map) {
        map.magFilter = THREE.NearestFilter;
        map.minFilter = THREE.NearestFilter;
        map.generateMipmaps = false;
        map.colorSpace = THREE.SRGBColorSpace;
      }
      const basic = new THREE.MeshBasicMaterial({
        map,
        vertexColors: !!src.vertexColors,
        transparent: src.transparent,
        opacity: src.opacity,
        alphaTest: src.transparent ? 0 : 0.5,
        side: THREE.DoubleSide,
      });
      basic.name = src.name;
      return basic;
    });
    mesh.material = Array.isArray(mesh.material) ? converted : converted[0];
  });
}

const loader = new GLTFLoader();
const buildingProto = new Map<number, Promise<THREE.Object3D | null>>();

function loadBuilding(model: number): Promise<THREE.Object3D | null> {
  let p = buildingProto.get(model);
  if (!p) {
    const name = `b${String(model).padStart(3, '0')}.glb`;
    p = loader.loadAsync(BASE + 'build/' + name)
      .then((g) => { toUnlit(g.scene); return g.scene; })
      .catch(() => null);
    buildingProto.set(model, p);
  }
  return p;
}

interface Cell { cx: number; cy: number; land: number; group?: THREE.Group; loading?: boolean }

let cells: Cell[] = [];
let manifest: Manifest;
let loadedCount = 0;

async function loadCell(cell: Cell): Promise<void> {
  if (cell.loading || cell.group) return;
  cell.loading = true;
  const name = `m${String(cell.land).padStart(3, '0')}.glb`;
  const group = new THREE.Group();
  group.position.set(cell.cx * CHUNK + CHUNK / 2, 0, cell.cy * CHUNK + CHUNK / 2);
  try {
    const g = await loader.loadAsync(BASE + 'land/' + name);
    toUnlit(g.scene);
    group.add(g.scene);
    const placements = manifest.buildings[String(cell.land)] ?? [];
    await Promise.all(placements.map(async (b) => {
      const proto = await loadBuilding(b.m);
      if (!proto) return;
      const inst = proto.clone(true);
      inst.position.set(b.x, b.y, b.z);
      group.add(inst);
    }));
    scene.add(group);
    cell.group = group;
    loadedCount++;
  } catch {
    /* missing chunk — leave void */
  } finally {
    cell.loading = false;
  }
}

function unloadCell(cell: Cell): void {
  if (!cell.group) return;
  scene.remove(cell.group);
  cell.group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry?.dispose();
  });
  cell.group = undefined;
  loadedCount--;
}

function streamChunks(): void {
  const t = controls.target;
  const near: { cell: Cell; d: number }[] = [];
  for (const cell of cells) {
    const dx = cell.cx * CHUNK + CHUNK / 2 - t.x;
    const dz = cell.cy * CHUNK + CHUNK / 2 - t.z;
    const d = Math.hypot(dx, dz);
    if (d < LOAD_RADIUS) near.push({ cell, d });
    else if (d > UNLOAD_RADIUS) unloadCell(cell);
  }
  near.sort((a, b) => a.d - b.d);
  for (const { cell } of near) void loadCell(cell);
  stats.textContent = `chunks: ${loadedCount}/${cells.length} · ` +
    `target (${(t.x / 16).toFixed(0)}, ${(t.z / 16).toFixed(0)}) tiles`;
}

async function init(): Promise<void> {
  manifest = await (await fetch(BASE + 'manifest.json')).json() as Manifest;
  cells = manifest.grid.map((g) => ({ ...g }));
  streamChunks();
  setInterval(streamChunks, 600);
}

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

void init();
