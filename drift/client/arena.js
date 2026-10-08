import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getMap } from '../shared/world.js';
import { addEnvironmentDetails } from './environment.js';
import { applySurfaceUV, createSurfaceLibrary, surfaceForBox } from './surfaces.js';
import { createBoxSurfaceGeometry } from './box-surfaces.js';
import { createGun, createViewArms } from './game-models.js';
import { getPower } from '../shared/powers.js';
import { poseShieldArm } from './characters.js';
export { createAvatar, createTarget } from './characters.js';

const PALETTE = {
  floor: '#bcbcaf', wall: '#d4d1be', terrace: '#dad6c4', step: '#e3decb',
  center: '#d5d2c2', pillar: '#cf5334', beam: '#cf5334', cover: '#687a79',
};

function coloredBox(box, color, shaded = true) {
  const geometry = new THREE.BoxGeometry(box.w, box.h, box.d);
  const colors = [];
  const base = new THREE.Color(color);
  // Slight architectural face variation is baked into the static geometry.
  const shades = shaded ? [0.9, 0.94, 1.1, 0.72, 0.97, 0.86] : [1, 1, 1, 1, 1, 1];
  for (let side = 0; side < 6; side++) {
    const face = base.clone().multiplyScalar(shades[side]);
    for (let vertex = 0; vertex < 4; vertex++) colors.push(face.r, face.g, face.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.translate(box.x, box.y + box.h / 2, box.z);
  return geometry;
}

function mergedMesh(geometries, material) {
  const geometry = mergeGeometries(geometries, false);
  geometries.forEach((item) => item.dispose());
  return new THREE.Mesh(geometry, material);
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function addSign(parent, text, subtext, x, y, z, width, rotation = 0, accent = false) {
  const texture = canvasTexture(1024, 320, (ctx, w, h) => {
    ctx.fillStyle = accent ? '#ce5234' : '#293f43';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f5efd9';
    let titleSize = 142;
    ctx.font = `900 ${titleSize}px Arial, sans-serif`;
    while (ctx.measureText(text).width > w - 210 && titleSize > 44) {
      titleSize -= 2; ctx.font = `900 ${titleSize}px Arial, sans-serif`;
    }
    ctx.fillText(text, 54, 168);
    let subtitleSize = 34;
    ctx.font = `600 ${subtitleSize}px Arial, sans-serif`;
    while (ctx.measureText(subtext).width > w - 118 && subtitleSize > 18) {
      subtitleSize -= 1; ctx.font = `600 ${subtitleSize}px Arial, sans-serif`;
    }
    ctx.fillText(subtext, 59, 241);
    ctx.fillStyle = accent ? '#f3bc8a' : '#ee6947';
    ctx.fillRect(w - 124, 61, 64, 16);
    ctx.fillRect(w - 76, 61, 16, 64);
  });
  const material = new THREE.MeshBasicMaterial({ map: texture, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 320 / 1024), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotation;
  parent.add(mesh);
  return mesh;
}

export function createArena(scene, map = getMap(), background = null) {
  const group = new THREE.Group();
  group.name = `DRIFT / ${map.name}`;
  scene.add(group);
  const theme = map.theme || {};
  const palette = { ...PALETTE, ...theme.palette };
  scene.background = background || new THREE.Color(theme.sky || '#bdd4dc');
  scene.fog = new THREE.Fog(theme.fog || '#bdd4dc', map.size * 1.1, map.size * 3.3);

  const hemisphere = new THREE.HemisphereLight(theme.hemisphere || '#d7edff', theme.ambientGround || '#8d7860', 1.45);
  const sun = new THREE.DirectionalLight(theme.sun || '#fff2d6', 2.8);
  sun.position.set(-28, 48, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const extent = map.size / 2 + 6;
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 140 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.06;
  sun.shadow.camera.updateProjectionMatrix();
  group.add(hemisphere, sun);

  const surfaceMaterial = createSurfaceLibrary();
  const surfaces = new Map();
  for (const [index, box] of map.boxes.entries()) {
    const kind = surfaceForBox(box, map.id);
    const geometry = applySurfaceUV(createBoxSurfaceGeometry(map.boxes, index), kind);
    const positions = geometry.attributes.position;
    if (!positions.count) { geometry.dispose(); continue; }
    const colors = new Float32Array(positions.count * 3);
    const color = new THREE.Color(palette[box.style] || palette.wall);
    for (let i = 0; i < positions.count; i++) {
      // Dirt collects at the foot of walls; light remains responsible for the
      // face shading. No extra obstacles or decorative collision are added.
      const height = (positions.getY(i) - box.y) / box.h;
      const shade = box.style === 'floor' ? 1 : 0.84 + height * 0.16;
      colors.set([color.r * shade, color.g * shade, color.b * shade], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (!surfaces.has(kind)) surfaces.set(kind, []);
    surfaces.get(kind).push(geometry);
  }
  for (const [kind, geometries] of surfaces) {
    const structure = mergedMesh(geometries, surfaceMaterial(kind));
    structure.name = `Architecture / ${kind}`;
    structure.castShadow = true;
    structure.receiveShadow = true;
    group.add(structure);
  }

  // Architectural details are flush surface paint. Playable structure comes
  // from map.boxes; cables and foliage are deliberately non-solid details.
  const markings = [];
  function panel(x, y, z, w, h, color, rotationX = 0, rotationY = 0) {
    const geometry = new THREE.PlaneGeometry(w, h);
    geometry.rotateX(rotationX);
    geometry.rotateY(rotationY);
    geometry.translate(x, y, z);
    const value = new THREE.Color(color);
    const values = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < values.length; i += 3) { values[i] = value.r; values[i + 1] = value.g; values[i + 2] = value.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
    markings.push(geometry);
  }
  const mark = (x, z, w, d, color = '#e8e3cd', y = 0.012) => panel(x, y, z, w, d, color, -Math.PI / 2);
  const edge = map.size / 2 - 2.8;
  for (const x of [-edge, edge]) mark(x, 0, 0.13, edge * 2);
  for (const z of [-edge, edge]) mark(0, z, edge * 2, 0.13);
  for (let index = -3; index <= 3; index++) {
    mark(index * 2, edge - 3.5, 0.8, 0.18, '#d77450');
    mark(index * 2, -edge + 3.5, 0.8, 0.18, '#d77450');
  }

  for (const box of map.boxes) {
    const top = box.y + box.h + 0.014;
    if (['step', 'terrace', 'center', 'roof', 'bridge', 'stone'].includes(box.style)) {
      mark(box.x, box.z - box.d / 2 + 0.1, box.w - 0.12, 0.1, '#ed8556', top);
      mark(box.x, box.z + box.d / 2 - 0.1, box.w - 0.12, 0.1, '#ed8556', top);
      if (box.style !== 'step') {
        mark(box.x - box.w / 2 + 0.1, box.z, 0.1, box.d - 0.12, '#e8dcb9', top);
        mark(box.x + box.w / 2 - 0.1, box.z, 0.1, box.d - 0.12, '#e8dcb9', top);
      }
    }
    if (['rock', 'rockLight'].includes(box.style) && box.style !== 'floor') {
      if (box.h < 3) mark(box.x, box.z - box.d / 2 + 0.14, box.w - 0.2, 0.08, '#ecac76', top);
    }
    if (box.style?.startsWith('container')) {
      // Folded-sheet relief is in the material; paint only the lifting edge.
      mark(box.x, box.z, box.w - 0.25, 0.08, '#e0caa5', top);
    }
    if (box.style === 'garden') {
      for (let x = box.x - box.w / 2 + 0.3; x < box.x + box.w / 2 - 0.1; x += 0.6) {
        mark(x, box.z, 0.18, Math.max(0.2, box.d - 0.3), '#91ac6e', top);
      }
    }
    if (box.label) {
      if (box.facadeBase == null) {
        // Labels on open decks are painted on their solid top, never on an
        // imaginary building facade across a walkable opening.
        const sign = addSign(group, box.label.split(' / ')[0], box.label.split(' / ')[1] || 'OUTPOST', box.x, top + 0.005, box.z, Math.min(6, box.w - 0.2, (box.d - 0.2) * 3.2), 0, true);
        sign.rotation.x = -Math.PI / 2;
        continue;
      }
      const roofY = box.y + box.h;
      const roofW = box.w - 0.4;
      const roofD = box.d - 0.4;
      const wallZ = box.z + roofD / 2 + 0.008;
      addSign(group, box.label.split(' / ')[0], box.label.split(' / ')[1] || 'OUTPOST', box.x - roofW / 3, roofY - 1.7, wallZ, 2.8, 0, true);
      // Painted window bands reveal the scale while keeping solid walls legible.
      for (const side of [-1, 1]) {
        panel(box.x + side * (roofW / 2 + 0.008), roofY - 1.65, box.z, roofD - 1.4, 1.15, map.id === 'sky-garden' ? '#659b99' : '#3c616d', 0, side * Math.PI / 2);
        panel(box.x + side * (roofW / 2 + 0.017), roofY - 1.2, box.z, roofD - 1.4, 0.045, '#a0c2c0', 0, side * Math.PI / 2);
        for (let offset = -roofD / 2 + 1.1; offset < roofD / 2 - 0.5; offset += 1.8) {
          panel(box.x + side * (roofW / 2 + 0.02), roofY - 1.65, box.z + offset, 0.085, 1.2, '#d8d7c7', 0, side * Math.PI / 2);
        }
      }
      for (const face of [-1, 1]) {
        panel(box.x, box.facadeBase + 2.95, box.z + face * (roofD / 2 + 0.012), 3.4, 0.13, '#e59b62', 0, face < 0 ? Math.PI : 0);
        mark(box.x, box.z + face * (roofD / 2 + 0.8), 3.1, 0.12, '#ef9862', box.facadeBase + 0.012);
      }
      // Floor strips lead through both doors; roof hatching signals a landing zone.
      mark(box.x, box.z, 0.07, roofD - 0.2, '#c4b99e', box.facadeBase + 0.012);
      for (const side of [-1, 1]) mark(box.x + side * 2.4, box.z, 0.09, 4.8, '#e7c58c', roofY + 0.016);
    }
  }
  const paint = mergedMesh(markings, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  paint.renderOrder = 1;
  paint.receiveShadow = true;
  group.add(paint);

  const wallFace = map.size / 2 - 0.513;
  if (map.boxes.some((box) => box.z < -map.size / 2 + 1 && box.h >= 6)) {
    addSign(group, map.name.toUpperCase(), map.subtitle, 0, 3.8, -wallFace, 14);
  }
  if (map.id === 'solstice') {
    addSign(group, '01', 'UPPER COURT', -16, 2.2, -4.987, 5.5, 0, true);
    addSign(group, '02', 'UPPER COURT', 17, 2.2, 5.987, 5.5, Math.PI, true);
  }

  const padTexture = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    ctx.fillStyle = '#293d40';
    ctx.beginPath(); ctx.arc(0, 0, 246, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#f4bc63'; ctx.lineWidth = 16;
    ctx.beginPath(); ctx.arc(0, 0, 218, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#ed774b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 186, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#f5e5c4'; ctx.lineWidth = 24; ctx.lineJoin = 'miter';
    for (const offset of [-65, 40]) {
      ctx.beginPath(); ctx.moveTo(-78, offset + 28); ctx.lineTo(0, offset - 40); ctx.lineTo(78, offset + 28); ctx.stroke();
    }
  });
  const padMaterial = new THREE.MeshBasicMaterial({ map: padTexture, transparent: true, depthWrite: false });
  const padRings = [];
  map.pads.forEach((pad) => {
    const base = new THREE.Mesh(new THREE.PlaneGeometry(pad.radius * 2, pad.radius * 2), padMaterial);
    base.rotation.x = -Math.PI / 2;
    base.rotation.z = -Math.atan2(pad.vx, -pad.vz);
    base.position.set(pad.x, pad.y + 0.025, pad.z);
    group.add(base);
    const ring = new THREE.Mesh(new THREE.RingGeometry(pad.radius * 0.94, pad.radius, 32), new THREE.MeshBasicMaterial({ color: '#ffc369', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pad.x, pad.y + 0.032, pad.z);
    group.add(ring); padRings.push(ring);
  });

  // One merged cable mesh keeps traversal readable without per-segment draws.
  const cables = [];
  const anchors = [];
  const landingPaint = [];
  const cylinderBetween = (start, end, radius, color) => {
    const delta = end.clone().sub(start);
    const geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), 6);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    geometry.translate(...start.clone().add(end).multiplyScalar(0.5).toArray());
    const value = new THREE.Color(color);
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = value.r; colors[i + 1] = value.g; colors[i + 2] = value.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  };
  for (const rope of map.ropes || []) {
    const start = new THREE.Vector3(rope.from.x, rope.from.y + 2.2, rope.from.z);
    const end = new THREE.Vector3(rope.to.x, rope.to.y + 2.2, rope.to.z);
    cables.push(cylinderBetween(start, end, 0.055, '#f4c563'));
    const vertical = Math.hypot(end.x - start.x, end.z - start.z) < 0.5;
    for (const endpoint of [rope.from, rope.to]) {
      // Narrow rings and brackets denote cable interaction, not collision posts.
      anchors.push(coloredBox({ x: endpoint.x, y: endpoint.y + 2.07, z: endpoint.z, w: 0.32, h: 0.26, d: 0.32 }, '#354e54'));
      const ring = new THREE.RingGeometry(vertical ? 0.32 : 0.44, vertical ? 0.39 : 0.5, 24);
      ring.rotateX(-Math.PI / 2);
      ring.translate(endpoint.x, endpoint.y + 0.035, endpoint.z);
      landingPaint.push(ring);
    }
    if (vertical) {
      for (let y = rope.from.y + 2.8; y < rope.to.y + 2; y += 0.72) {
        anchors.push(coloredBox({ x: rope.from.x, y, z: rope.from.z, w: 0.16, h: 0.12, d: 0.16 }, '#fff0ad'));
      }
    }
  }
  if (cables.length) {
    group.add(mergedMesh(cables, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, emissive: '#bb850b', emissiveIntensity: 0.16 })));
    group.add(mergedMesh(anchors, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
    group.add(mergedMesh(landingPaint, new THREE.MeshBasicMaterial({ color: '#f8ca70', side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false })));
  }

  addEnvironmentDetails(group, map, surfaceMaterial);
  if (map.id !== 'sky-garden') {
    const ground = new THREE.PlaneGeometry(600, 600);
    ground.rotateX(-Math.PI / 2);
    applySurfaceUV(ground, 'earth');
    const color = new THREE.Color(map.id === 'freight-yard' ? '#759da6' : theme.ground || '#adb6a9');
    ground.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: 4 }, () => color.toArray()).flat(), 3));
    const outsideGround = new THREE.Mesh(ground, surfaceMaterial('earth'));
    outsideGround.position.y = -1.05;
    outsideGround.receiveShadow = true;
    group.add(outsideGround);
  }

  let disposed = false;
  return {
    update(time) {
      if (disposed) return;
      padRings.forEach((ring, index) => { ring.material.opacity = 0.32 + Math.sin(time * 3 + index) * 0.15; });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(group);
      const materials = new Set();
      const geometries = new Set();
      const textures = new Set();
      group.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
      });
      materials.forEach((material) => {
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
        material.dispose();
      });
      textures.forEach((texture) => texture.dispose());
      geometries.forEach((geometry) => geometry.dispose());
      hemisphere.dispose();
      sun.dispose(); // DirectionalLight also releases both shadow render targets.
      group.clear();
    },
  };
}

export function createWeapon(camera, classId = 'assault') {
  const sniper = classId === 'sniper';
  const group = new THREE.Group();
  group.name = ({ sniper: 'Longshot rifle', scout: 'Vector SMG', heavy: 'Bastion LMG' })[classId] || 'Pulse carbine';
  group.scale.setScalar(0.85);
  const gun = createGun(classId);
  camera.add(group);
  const anchors = gun.userData.anchors;
  // The world model keeps its original material. This lightweight variant shares
  // all maps and compresses clip depth to keep the viewmodel clear of walls.
  const viewMaterial = (material) => {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\ngl_Position.z = gl_Position.z * 0.01 - gl_Position.w * 0.99;');
    };
    material.customProgramCacheKey = () => 'drift-viewmodel-depth-v1';
    return material;
  };
  const gunMaterials = [];
  gun.traverse((part) => {
    if (!part.isMesh) return;
    part.material = viewMaterial(part.material.clone());
    gunMaterials.push(part.material);
    part.castShadow = false;
    part.receiveShadow = false;
    part.renderOrder = part.name === 'holographic-reticle' ? 102 : part.name === 'holographic-glass' ? 101 : 100;
    part.frustumCulled = false;
  });
  group.add(gun);

  // Reuse the character's real textured arms, already fitted to these grips.
  const arms = createViewArms(classId);
  const hands = arms.userData.character.body;
  hands.material = viewMaterial(hands.material.clone());
  hands.castShadow = false;
  hands.receiveShadow = false;
  hands.renderOrder = 100;
  hands.frustumCulled = false;
  group.add(arms);

  const primarySight = new THREE.Object3D();
  primarySight.name = 'primary-sight';
  primarySight.position.fromArray(anchors.sight);
  group.add(primarySight);
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.fromArray(anchors.muzzle);
  group.add(muzzle);
  const flashMaterial = new THREE.MeshBasicMaterial({ color: '#ffe3a2', toneMapped: false, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const flash = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.16, 5), flashMaterial);
  flash.name = 'muzzle-flash';
  flash.rotation.x = -Math.PI / 2;
  flash.position.copy(muzzle.position);
  flash.position.z -= 0.08;
  flash.renderOrder = 101;
  group.add(flash);
  const sightOffset = new THREE.Vector3();
  const braceTarget = new THREE.Vector3();
  let reloadBlend = 0, aimBlend = 0, slideBlend = 0, powerBlend = 0;
  return {
    group,
    muzzlePosition(target) { return muzzle.getWorldPosition(target); },
    reset() {
      reloadBlend = 0; aimBlend = 0; slideBlend = 0; powerBlend = 0;
      this.update({ motion: false });
    },
    update({ time = 0, delta = 1 / 60, phase = time * 11, moving = false, sliding = false, firing = 0, aiming = false, reloading = false, lowered = false, motion = true,
      abilityTime = 0, shieldHealth = 0, dashX = 0, dashZ = 0, yaw = 0 } = {}) {
      const movement = typeof moving === 'number' ? Math.min(Math.abs(moving), 1) : Number(moving);
      const step = Math.max(0, Math.min(delta, 0.1));
      const blend = 1 - Math.exp(-step * 14);
      const aimTarget = Number(aiming && !reloading && !lowered);
      aimBlend = motion ? aimBlend + (aimTarget - aimBlend) * (1 - Math.exp(-step * (sniper ? 13 : 11))) : aimTarget;
      slideBlend += (Number(sliding) - slideBlend) * blend;
      reloadBlend += (Number(reloading) - reloadBlend) * blend;
      powerBlend = motion ? powerBlend + (Number(lowered) - powerBlend) * blend : Number(lowered);
      const aim = sniper ? aimBlend : aimBlend * aimBlend * (3 - 2 * aimBlend);
      const bob = Math.sin(phase) * 0.007 * movement * (1 - aim * 0.8);
      group.position.set(sniper ? 0.265 * (1 - aim * 0.8) : 0.265, -0.245 - bob - reloadBlend * 0.15 - slideBlend * 0.025 * (1 - aim), -0.38 + Math.max(0, firing) * 0.042 - (sniper ? aim * 0.05 : 0));
      group.rotation.set(Math.max(0, firing) * 0.045 - reloadBlend * 0.38, -0.025, -0.015 - slideBlend * 0.12 * (1 - aim) - reloadBlend * 0.4 + bob * 0.8);
      if (!sniper) {
        group.rotation.y *= 1 - aim;
        group.rotation.z *= 1 - aim;
        // Bring the actual aperture to eye level, 16 cm from the camera. Each
        // gun has a different sight position, so a fixed group offset is not enough.
        // Sniper uses its existing full-screen magnified scope instead.
        sightOffset.copy(primarySight.position).multiply(group.scale).applyEuler(group.rotation);
        group.position.x += (-sightOffset.x - group.position.x) * aim;
        group.position.y += (-sightOffset.y - group.position.y) * aim;
        group.position.z += (-0.16 - sightOffset.z - group.position.z) * aim;
      }
      group.position.y -= powerBlend * .16;
      group.rotation.x -= powerBlend * .22;
      // The gun and fitted hands move together. Casting never offsets a hand
      // from its grip or pulls an aiming/firing Ember or Wisp off the sightline.
      if (motion && abilityTime > 0 && !aiming && !reloading && firing <= .01) {
        const duration = getPower(classId).duration;
        const age = Math.max(0, duration - abilityTime);
        if (classId === 'scout') {
          const burst = Math.sin(Math.PI * Math.min(1, abilityTime / duration));
          const side = dashX * Math.cos(yaw) - dashZ * Math.sin(yaw);
          group.rotation.z -= side * burst * .15;
          group.position.x += side * burst * .055;
          group.position.y -= burst * .035;
        } else if (classId === 'assault' || classId === 'sniper') {
          const cast = Math.sin(Math.PI * Math.min(1, age / .38));
          group.position.y -= cast * .075;
          group.rotation.z += cast * (classId === 'assault' ? .09 : -.065);
          group.rotation.x -= cast * .09;
        }
      }
      if (classId === 'heavy') {
        const bracing = lowered && abilityTime > 0 && shieldHealth > 0;
        if (bracing) camera.localToWorld(braceTarget.set(-.18, -.29, -.52));
        poseShieldArm(arms, bracing ? (motion ? powerBlend : 1) : 0, braceTarget);
      }
      flashMaterial.opacity = firing > 0.6 ? Math.min(0.85, firing) : 0;
      flash.rotation.y = time * 27;
    },
    dispose() {
      camera.remove(group);
      // Geometry and maps belong to the model cache; only this view material is owned.
      gunMaterials.forEach((material) => material.dispose());
      hands.geometry.dispose(); hands.material.dispose(); hands.skeleton.dispose();
      flash.geometry.dispose(); flashMaterial.dispose();
    },
  };
}
