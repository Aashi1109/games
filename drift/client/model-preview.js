import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WEAPON_MODELS, createWeaponModel } from './weapon-models.js';
import { createCharacterModel } from './character-models.js';
import { fromReference, EMBER_FRAME } from './reference-head-geometry.js';

const views = [];
const canvas = document.getElementById('render');
const status = document.getElementById('status');
const classIds = Object.keys(WEAPON_MODELS);
let renderer;
let heroView;
let pendingFrame = 0;
let wireframe = false;
let faceDetail = new URLSearchParams(location.search).get('view') === 'face';
let selectedCharacter = 'assault';

const REFERENCE_CROPS = {
  assault: { body: [0, 0, 365, 1024], face: [87, 37, 207, 256] },
  sniper: { body: [372, 0, 374, 1024], face: [467, 26, 218, 275] },
  scout: { body: [751, 0, 377, 1024], face: [848, 58, 206, 265] },
  heavy: { body: [1128, 0, 408, 1024], face: [1220, 27, 212, 270] },
};

function addContactShadow(scene, holder, floorY) {
  // Scene dressing only: one small mesh with a soft vertex-alpha falloff.
  // No texture, shadow map, or geometry added to the downloadable character.
  const positions = [];
  const colors = [];
  const indices = [];
  const segments = 24;
  const rings = [[0, 0.13], [0.25, 0.115], [0.5, 0.065], [0.75, 0.018], [1, 0]];
  for (const [radius, alpha] of rings) {
    for (let i = 0; i < segments; i += 1) {
      const angle = i / segments * Math.PI * 2;
      positions.push(Math.cos(angle) * radius * 0.53, 0, Math.sin(angle) * radius * 0.58);
      colors.push(0.12, 0.12, 0.12, alpha);
    }
  }
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let i = 0; i < segments; i += 1) {
      const next = (i + 1) % segments;
      const a = ring * segments + i;
      const b = ring * segments + next;
      const c = (ring + 1) * segments + i;
      const d = (ring + 1) * segments + next;
      if (ring > 0) indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  const shadow = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  shadow.name = 'preview-contact-shadow';
  shadow.position.set(holder.position.x, holder.position.y + floorY + 0.001, holder.position.z);
  scene.add(shadow);
}

function requestRender() {
  if (renderer && !pendingFrame) pendingFrame = requestAnimationFrame(render);
}

function render() {
  pendingFrame = 0;
  renderer.setScissorTest(false);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.setScissorTest(true);
  for (const view of views) {
    const rect = view.element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) continue;
    const aspect = rect.width / rect.height;
    const span = Math.max(view.span, view.minWidth / aspect);
    view.camera.left = -span * aspect / 2;
    view.camera.right = span * aspect / 2;
    view.camera.top = span / 2;
    view.camera.bottom = -span / 2;
    view.camera.updateProjectionMatrix();
    renderer.setViewport(rect.left, innerHeight - rect.bottom, rect.width, rect.height);
    renderer.setScissor(rect.left, innerHeight - rect.bottom, rect.width, rect.height);
    renderer.render(view.scene, view.camera);
  }
}

function frameView(view, angle = 'quarter') {
  const direction = view.kind === 'character'
    ? new THREE.Vector3(angle === 'side' ? 1 : angle === 'front' ? 0 : 0.4, angle === 'front' ? 0 : 0.08, angle === 'side' ? 0 : -1)
    : new THREE.Vector3(1, angle === 'front' || angle === 'side' ? 0 : 0.36, angle === 'front' || angle === 'side' ? 0 : 0.52);
  const target = view.referenceTarget
    ? view.holder.position.clone().add(view.referenceTarget)
    : view.detail ? view.holder.position.clone().add(new THREE.Vector3(0, 1.585, 0)) : new THREE.Vector3();
  view.camera.position.copy(direction.normalize().multiplyScalar(4).add(target));
  view.camera.zoom = 1;
  view.controls.target.copy(target);
  view.camera.updateProjectionMatrix();
  view.controls.update();
}

function setWireframe(model) {
  model.traverse((part) => {
    if (part.isMesh) part.material.wireframe = wireframe;
  });
}

function addView(element, model, kind) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(kind === 'character' ? '#c2c2c3' : '#c9cac9');
  scene.add(new THREE.HemisphereLight('#ffffff', '#8b8b8b', 1.25));
  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(-3, 5, -4);
  const fill = new THREE.DirectionalLight('#ffffff', 0.6);
  fill.position.set(4, 2, -3);
  scene.add(key, fill);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const holder = new THREE.Group();
  holder.position.copy(center).negate();
  if (kind === 'character') holder.position.y += 0.067;
  holder.add(model);
  scene.add(holder);
  if (kind === 'character') addContactShadow(scene, holder, bounds.min.y);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.02, 30);
  const controls = new OrbitControls(camera, element);
  controls.enablePan = true;
  controls.minZoom = 0.65;
  controls.maxZoom = kind === 'character' ? 4 : 3;
  controls.addEventListener('change', requestRender);
  const view = {
    scene, camera, controls, element, model, kind, holder,
    span: kind === 'character' ? size.y * 1.215 : Math.max(0.36, size.y * 1.5),
    minWidth: kind === 'character' ? Math.max(0.75, size.x * 1.3) : size.z * 1.3,
    triangles: 0, meshes: 0,
  };
  view.bodySpan = view.span;
  view.bodyMinWidth = view.minWidth;
  model.traverse((part) => {
    if (!part.isMesh) return;
    view.triangles += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3;
    view.meshes += 1;
  });
  setWireframe(model);
  views.push(view);
  frameView(view);
  view.onKeyDown = (event) => {
    const angle = ({ ArrowLeft: -0.12, ArrowRight: 0.12 })[event.key];
    if (angle === undefined) return;
    event.preventDefault();
    if (view === heroView) highlightAngle(null);
    camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).add(controls.target);
    controls.update();
  };
  element.addEventListener('keydown', view.onKeyDown);
  return view;
}

function disposeView(view) {
  view.controls.dispose();
  view.element.removeEventListener('keydown', view.onKeyDown);
  const geometries = new Set();
  const materials = new Set();
  view.scene.traverse((part) => {
    if (part.isMesh) {
      geometries.add(part.geometry);
      for (const material of Array.isArray(part.material) ? part.material : [part.material]) materials.add(material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  const index = views.indexOf(view);
  if (index >= 0) views.splice(index, 1);
}

function highlightAngle(angle) {
  for (const name of ['front', 'quarter', 'side']) {
    document.getElementById(name).setAttribute('aria-pressed', String(name === angle));
  }
}

function selectCharacter(id) {
  selectedCharacter = id;
  const definition = WEAPON_MODELS[id];
  if (heroView) disposeView(heroView);
  heroView = addView(document.getElementById('hero-view'), createCharacterModel(id), 'character');
  heroView.controls.addEventListener('start', () => highlightAngle(null));
  document.querySelectorAll('[data-character]').forEach((button) => {
    const selected = button.dataset.character === id;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  document.getElementById('character-comparison').setAttribute('aria-labelledby', `tab-${id}`);
  const reference = document.getElementById('reference-image');
  reference.alt = `Approved ${definition.character} character concept`;
  document.getElementById('hero-name').textContent = `${definition.character} · live mesh`;
  heroView.element.setAttribute('aria-label', `Rotate ${definition.character} actual 3D model with mouse or left and right arrow keys`);
  document.getElementById('hero-stats').textContent = `${definition.character} + ${definition.name} · ${heroView.triangles.toLocaleString()} triangles · ${heroView.meshes} meshes`;
  const download = document.getElementById('hero-download');
  download.href = `/output/models/${id}-character.glb`;
  download.textContent = `Download ${definition.character} .glb ↓`;
  applyComparisonFraming();
  highlightAngle('quarter');
  requestRender();
}

function applyComparisonFraming() {
  const [x,y,width,height] = REFERENCE_CROPS[selectedCharacter][faceDetail ? 'face' : 'body'];
  const reference = document.getElementById('reference-image');
  reference.parentElement.style.aspectRatio = `${width} / ${height}`;
  Object.assign(reference.style, {
    width: `${1536 / width * 100}%`, height: `${1024 / height * 100}%`,
    left: `${-x / width * 100}%`, top: `${-y / height * 100}%`,
  });
  heroView.detail = faceDetail;
  heroView.span = faceDetail ? .56 : heroView.bodySpan;
  heroView.minWidth = faceDetail ? .45 : heroView.bodyMinWidth;
  // Match scale and crop center, so likeness is compared under the same view.
  heroView.referenceTarget = selectedCharacter === 'assault'
    ? new THREE.Vector3(...fromReference([x + width / 2, y + height / 2, 0])) : null;
  if (selectedCharacter === 'assault') {
    heroView.span = height / EMBER_FRAME.scale;
    heroView.minWidth = width / EMBER_FRAME.scale;
  }
  document.getElementById('detail').setAttribute('aria-pressed', String(faceDetail));
  history.replaceState(null, '', `${location.pathname}${faceDetail ? '?view=face' : ''}#${selectedCharacter}`);
  frameView(heroView);
  highlightAngle('quarter');
  requestRender();
}

try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  for (const [id, definition] of Object.entries(WEAPON_MODELS)) {
    const card = document.createElement('article');
    card.style.setProperty('--accent', definition.accent);
    card.innerHTML = `<div class="card-header"><div><div class="eyebrow">${definition.type}</div><h3>${definition.character}</h3><p>${definition.name}</p></div><button type="button" data-compare="${id}">Compare reference ↑</button></div>
      <div class="viewport character-view" tabindex="0" role="img" aria-label="Rotate ${definition.character} character with mouse or left and right arrow keys"><span class="view-label">ACTUAL CHARACTER + WEAPON</span></div>
      <div class="viewport weapon-view" tabindex="0" role="img" aria-label="Rotate ${definition.name} weapon with mouse or left and right arrow keys"><span class="view-label">${definition.name} · ACTUAL WEAPON MESH</span></div>
      <div class="card-footer"><div class="stats"></div><div class="downloads"><a class="download" href="/output/models/${id}-character.glb" download>Character .glb ↓</a><a class="download" href="/output/models/${id}-weapon.glb" download>Weapon .glb ↓</a></div></div>`;
    document.getElementById('models').append(card);
    const characterView = addView(card.querySelector('.character-view'), createCharacterModel(id), 'character');
    const weaponView = addView(card.querySelector('.weapon-view'), createWeaponModel(id), 'weapon');
    card.querySelector('.stats').textContent = `${characterView.triangles.toLocaleString()} triangles equipped · ${weaponView.triangles.toLocaleString()} weapon triangles`;
    card.querySelector('[data-compare]').addEventListener('click', () => {
      selectCharacter(id);
      document.querySelector('.review-toolbar').scrollIntoView({ block: 'start', behavior: 'smooth' });
      document.getElementById(`tab-${id}`).focus({ preventScroll: true });
    });
  }
  selectCharacter(classIds.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'assault');
  status.hidden = true;
  requestRender();
} catch (error) {
  status.textContent = `Preview could not load: ${error.message}`;
  console.error(error);
}

document.querySelectorAll('[data-character]').forEach((button, index) => {
  button.addEventListener('click', () => { if (renderer) selectCharacter(button.dataset.character); });
  button.addEventListener('keydown', (event) => {
    const offset = ({ ArrowLeft: -1, ArrowRight: 1 })[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    const id = classIds[(index + offset + classIds.length) % classIds.length];
    if (renderer) selectCharacter(id);
    document.getElementById(`tab-${id}`).focus();
  });
});
for (const angle of ['front', 'quarter', 'side']) {
  document.getElementById(angle).addEventListener('click', () => {
    if (!heroView) return;
    frameView(heroView, angle);
    highlightAngle(angle);
    requestRender();
  });
}
document.getElementById('reset').addEventListener('click', () => {
  views.forEach((view) => frameView(view));
  highlightAngle('quarter');
  requestRender();
});
document.getElementById('detail').addEventListener('click', () => {
  if (!heroView) return;
  faceDetail = !faceDetail;
  applyComparisonFraming();
});
document.getElementById('wireframe').addEventListener('click', (event) => {
  wireframe = !wireframe;
  event.currentTarget.setAttribute('aria-pressed', String(wireframe));
  views.forEach(({ model }) => setWireframe(model));
  requestRender();
});
addEventListener('resize', () => {
  renderer?.setSize(innerWidth, innerHeight, false);
  requestRender();
});
addEventListener('scroll', requestRender, { passive: true });
addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (renderer && classIds.includes(id)) selectCharacter(id);
});
addEventListener('pagehide', () => {
  cancelAnimationFrame(pendingFrame);
  for (const view of [...views]) disposeView(view);
  renderer?.dispose();
});
