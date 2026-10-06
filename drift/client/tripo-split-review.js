import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#c3c3c3');
scene.add(new THREE.HemisphereLight('#ffffff', '#747d78', 1.3));
const key = new THREE.DirectionalLight('#ffffff', 2);
key.position.set(-3, 5, 4); scene.add(key);
const fill = new THREE.DirectionalLight('#ffffff', .65);
fill.position.set(4, 2, -3); scene.add(fill);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .001, 40);
const controls = new OrbitControls(camera, stage);
controls.enablePan = true; controls.minZoom = .25; controls.maxZoom = 10;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
// HTML image decoding avoids intermittent large-PNG ImageBitmap failures in the review browser.
loader.register((parser) => {
  parser.textureLoader = new THREE.TextureLoader(parser.options.manager);
  return { name: 'review-image-decoding' };
});
const paths = {
  master: '/output/models/tripo-characters-master/characters-master.glb',
  optimized: '/output/models/tripo-optimized/characters-master.glb',
  guns: '/output/models/tripo-guns-master/guns-master.glb',
  'guns-optimized': '/output/models/tripo-optimized/guns-master.glb',
  original: '/output/models/tripo-review/tripo-character-lineup.glb',
  'gun-original': '/output/models/tripo-guns-review/tripo-guns-original.glb',
};
const titles = { master: 'CHARACTERS · FULL-DETAIL MASTER', optimized: 'CHARACTERS · OPTIMIZED COPY', guns: 'WEAPONS · FULL-DETAIL MASTER', 'guns-optimized': 'WEAPONS · OPTIMIZED COPY', original: 'ORIGINAL CHARACTER SOURCE', 'gun-original': 'ORIGINAL GUN SOURCE' };
const isOriginal = () => ['original', 'gun-original'].includes($('asset').value);
const isGunSet = () => ['guns', 'guns-optimized', 'gun-original'].includes($('asset').value);
const characters = ['ember', 'wisp', 'dash', 'rook'];
const directions = { front: [0, .03, 1], quarter: [-.65, .08, 1], side: [-1, .03, 0], back: [0, .03, -1] };
let holder, meshes = [], angle = 'front', face = false, wire = false, unlit = false, span = 2.15, pending = 0, loading = 0, fileBytes = 0;

function render() {
  pending = 0;
  const { width, height } = stage.getBoundingClientRect();
  renderer.setSize(width, height, false);
  camera.left = -span * width / height / 2; camera.right = -camera.left;
  camera.top = span / 2; camera.bottom = -span / 2; camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}
function requestRender() { if (!pending) pending = requestAnimationFrame(render); }
function visibleBounds() {
  const box = new THREE.Box3();
  holder?.updateMatrixWorld(true);
  for (const mesh of meshes) if (mesh.visible) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  }
  return box;
}
function frame() {
  const box = visibleBounds();
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const target = box.getCenter(new THREE.Vector3());
  if (face && !isGunSet()) {
    const height = size.y * .23;
    box.min.y = box.max.y - height;
    target.y = (box.min.y + box.max.y) / 2;
  }
  camera.position.copy(new THREE.Vector3(...directions[angle]).normalize().multiplyScalar(5).add(target));
  controls.target.copy(target); camera.zoom = 1; camera.lookAt(target); camera.updateMatrixWorld();
  const projected = new THREE.Box3();
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    projected.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
  }
  const projectionSize = projected.getSize(new THREE.Vector3());
  const aspect = stage.clientWidth / stage.clientHeight;
  span = Math.max(projectionSize.y, projectionSize.x / aspect, .05) * 1.12;
  if (face && $('character').value !== 'all' && !isGunSet()) span = size.y * .26;
  controls.update();
  for (const name of Object.keys(directions)) $(name).setAttribute('aria-pressed', String(name === angle));
  requestRender();
}
function updateReference() {
  const character = isOriginal() ? 'all' : $('character').value;
  const crop = $('reference-crop'), image = $('reference');
  crop.removeAttribute('style'); image.removeAttribute('style');
  image.src = isGunSet() ? '/output/models/tripo-guns-review/reference-render.jpg' : '/output/models/reference.png';
  image.alt = isGunSet() ? 'Four weapons rendered from your original gun GLB' : 'Approved four-character concept';
  $('reference-title').textContent = isGunSet() ? 'YOUR ORIGINAL GUN MODEL' : 'APPROVED CHARACTER REFERENCE';
  if (isGunSet()) { $('reference-label').textContent = 'Ember / Wisp / Dash / Rook'; return; }
  if (character === 'all') { $('reference-label').textContent = 'All four characters'; return; }
  const index = characters.indexOf(character);
  const x = [0, 355, 745, 1120][index], widths = [355, 390, 375, 416];
  const faces = [[87, 37, 207, 256], [493, 33, 159, 243], [865, 72, 149, 230], [1239, 40, 160, 230]];
  const rect = face ? faces[index] : [x, 24, widths[index], 911];
  crop.style.width = 'auto'; crop.style.aspectRatio = `${rect[2]}/${rect[3]}`;
  image.style.width = `${1536 / rect[2] * 100}%`; image.style.height = `${1024 / rect[3] * 100}%`;
  image.style.objectFit = 'fill'; image.style.left = `${-rect[0] / rect[2] * 100}%`; image.style.top = `${-rect[1] / rect[3] * 100}%`;
  $('reference-label').textContent = character[0].toUpperCase() + character.slice(1);
}
function applyView(reframe = true) {
  const selected = $('character').value, original = isOriginal();
  let triangles = 0, vertices = 0, count = 0;
  const textures = new Map();
  for (const mesh of meshes) {
    const id = mesh.userData.reviewID;
    mesh.visible = original || selected === 'all' || id.includes(selected);
    mesh.position.copy(mesh.userData.originalPosition);
    mesh.material = unlit ? mesh.userData.unlitMaterial : mesh.userData.pbrMaterial;
    for (const material of [mesh.material].flat()) material.wireframe = wire;
    if (!mesh.visible) continue;
    count++; triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
    vertices += mesh.geometry.attributes.position.count;
    for (const material of [mesh.userData.pbrMaterial].flat()) for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
      const texture = material[slot];
      if (texture) textures.set(texture.source.uuid, `${texture.image.width}×${texture.image.height}`);
    }
  }
  $('stats').classList.remove('error');
  $('stats').textContent = `${triangles.toLocaleString()} visible triangles · ${vertices.toLocaleString()} vertices · ${count} visible parts · ${textures.size} shared textures (${[...textures.values()].join(', ')}) · ${(fileBytes / 1e6).toFixed(2)} MB loaded pack`;
  const asset = $('asset').value;
  const individualRoots = { master: '/output/models/tripo-characters-master', guns: '/output/models/tripo-guns-master', optimized: '/output/models/tripo-optimized/pieces/characters-master', 'guns-optimized': '/output/models/tripo-optimized/pieces/guns-master' };
  const individual = !original && selected !== 'all';
  $('download').href = individual ? `${individualRoots[asset]}/${selected}-${isGunSet() ? 'gun' : 'body'}.glb` : paths[asset];
  $('download').textContent = individual ? `Download ${selected[0].toUpperCase() + selected.slice(1)} GLB` : 'Download pack GLB';
  $('selection').textContent = original ? 'Untouched source model. Choose a master or optimized copy to inspect individual pieces.' : isGunSet() ? 'Separate weapons from your new GLB. Select a character to inspect their gun.' : 'Four separate character bodies. Static models; animation and game integration are pending review.';
  updateReference();
  if (reframe) frame(); else requestRender();
}
function dispose() {
  const textures = new Set(), materials = new Set();
  for (const mesh of meshes) {
    mesh.geometry.dispose();
    for (const material of [...[mesh.userData.pbrMaterial].flat(), ...[mesh.userData.unlitMaterial].flat()]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  }
  materials.forEach((material) => material.dispose()); textures.forEach((texture) => texture.dispose());
  if (holder) scene.remove(holder);
  meshes = []; holder = null;
}
async function load() {
  const version = ++loading, asset = $('asset').value;
  $('character').disabled = isOriginal(); $('face').disabled = isOriginal() || isGunSet();
  if (isOriginal() || isGunSet()) { face = false; $('face').setAttribute('aria-pressed', 'false'); }
  $('stats').classList.remove('error'); $('stats').textContent = `Loading ${asset}…`;
  $('model-label').textContent = titles[asset]; $('download').href = paths[asset];
  dispose(); requestRender();
  try {
    const response = await fetch(`${paths[asset]}?review=${Date.now()}`);
    if (!response.ok) throw new Error(`Asset is not available yet (HTTP ${response.status}).`);
    const data = await response.arrayBuffer();
    const gltf = await loader.parseAsync(data, '/');
    if (version !== loading) return;
    gltf.scene.traverse((mesh) => {
      if (mesh.isMesh && [mesh.material].flat().some((material) => !material.map || !material.normalMap || !material.roughnessMap)) {
        throw new Error('A material texture failed to decode. Reload this asset.');
      }
    });
    dispose(); fileBytes = data.byteLength;
    holder = new THREE.Group(); holder.rotation.y = -Math.PI / 2;
    holder.add(gltf.scene); scene.add(holder);
    const initial = new THREE.Box3().setFromObject(holder);
    holder.scale.setScalar(1.8 / initial.getSize(new THREE.Vector3()).y);
    holder.updateMatrixWorld(true);
    const normalized = new THREE.Box3().setFromObject(holder), center = normalized.getCenter(new THREE.Vector3());
    holder.position.set(-center.x, -normalized.min.y, -center.z);
    gltf.scene.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.userData.reviewID = `${mesh.name} ${mesh.parent?.name ?? ''}`.toLowerCase();
      mesh.userData.originalPosition = mesh.position.clone();
      mesh.userData.pbrMaterial = mesh.material;
      const basic = (material) => new THREE.MeshBasicMaterial({ map: material.map, color: material.color, side: material.side, alphaTest: material.alphaTest });
      mesh.userData.unlitMaterial = Array.isArray(mesh.material) ? mesh.material.map(basic) : basic(mesh.material);
      meshes.push(mesh);
    });
    applyView();
  } catch (error) {
    if (version !== loading) return;
    dispose(); requestRender(); $('stats').classList.add('error');
    $('stats').textContent = `${asset} preview: ${error.message}`;
  }
}
for (const id of Object.keys(directions)) $(id).onclick = () => { angle = id; frame(); };
$('asset').onchange = load; $('reload').onclick = load;
$('character').onchange = () => applyView();
$('face').onclick = () => {
  face = !face;
  if (face && $('character').value === 'all') $('character').value = 'ember';
  $('face').setAttribute('aria-pressed', String(face)); applyView();
};
$('wire').onclick = () => { wire = !wire; $('wire').setAttribute('aria-pressed', String(wire)); applyView(false); };
$('unlit').onclick = () => { unlit = !unlit; $('unlit').setAttribute('aria-pressed', String(unlit)); applyView(false); };
controls.addEventListener('change', requestRender);
controls.addEventListener('start', () => { for (const id of Object.keys(directions)) $(id).setAttribute('aria-pressed', 'false'); });
// Optional authoring diagnostic; ordinary review stays free of source coordinates.
stage.addEventListener('pointerdown', (event) => {
  if (!new URLSearchParams(location.search).has('inspect')) return;
  const bounds = renderer.domElement.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2), camera);
  const hit = ray.intersectObjects(meshes.filter((mesh) => mesh.visible), false)[0];
  if (!hit) return;
  const local = hit.object.worldToLocal(hit.point.clone());
  $('selection').textContent = `${hit.object.name} · triangle ${hit.faceIndex} · source position ${local.toArray().map((v) => v.toFixed(6)).join(', ')}`;
});
stage.onkeydown = (event) => {
  if (event.key.toLowerCase() === 'f') { frame(); return; }
  const rotation = ({ ArrowLeft: -.13, ArrowRight: .13 })[event.key];
  if (rotation === undefined) return;
  event.preventDefault(); camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation).add(controls.target); controls.update();
};
new ResizeObserver(() => { if (meshes.length) frame(); else requestRender(); }).observe(stage);
load();
