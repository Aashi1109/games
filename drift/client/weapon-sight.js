import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const RETICLE_Z = .021;
const housings = new Map();
let shared;

function outline(width, height, corner) {
  const x = width / 2, y = height / 2;
  return [
    [-x + corner, -y], [x - corner, -y], [x, -y + corner],
    [x, y - corner], [x - corner, y], [-x + corner, y],
    [-x, y - corner], [-x, -y + corner],
  ].map(([a, b]) => new THREE.Vector2(a, b));
}

function painted(geometry, color) {
  const result = geometry.index ? geometry.toNonIndexed() : geometry;
  if (result !== geometry) geometry.dispose();
  const value = new THREE.Color(color);
  const colors = new Float32Array(result.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) value.toArray(colors, i);
  result.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return result;
}

function housing(piggyback, baseHeight) {
  const key = `${piggyback}:${baseHeight}`;
  if (housings.has(key)) return housings.get(key);
  const width = piggyback ? .065 : .075;
  const height = piggyback ? .05 : .066;
  const frame = new THREE.Shape(outline(width, height, .009));
  frame.holes.push(new THREE.Path(outline(width - .008, height - .008, .005).reverse()));
  // A shallow, 4 mm rim keeps the close ADS view open without a thick tunnel.
  const surround = new THREE.ExtrudeGeometry(frame, { depth: .02, bevelEnabled: false, steps: 1, curveSegments: 1 });
  const pieces = [painted(surround, '#263238')];
  const baseY = -height / 2 - baseHeight / 2;
  const base = new THREE.BoxGeometry(width - .009, baseHeight, .05);
  base.translate(0, baseY, -.003);
  pieces.push(painted(base, '#323f45'));
  for (const y of [-.011, .002]) {
    const button = new THREE.CylinderGeometry(.0035, .0035, .005, 8);
    button.rotateZ(Math.PI / 2);
    button.translate(width / 2 + .0015, y, .003);
    pieces.push(painted(button, '#56666e'));
  }
  const geometry = mergeGeometries(pieces, false);
  pieces.forEach((part) => part.dispose());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  housings.set(key, geometry);
  return geometry;
}

function resources() {
  if (shared) return shared;
  const ring = new THREE.RingGeometry(.008, .0087, 24).toNonIndexed();
  const dot = new THREE.CircleGeometry(.0012, 12).toNonIndexed();
  const reticle = mergeGeometries([ring, dot], false);
  ring.dispose(); dot.dispose();
  shared = {
    glass: new THREE.ShapeGeometry(new THREE.Shape(outline(.067, .058, .005))),
    scopeGlass: new THREE.ShapeGeometry(new THREE.Shape(outline(.057, .042, .005))),
    reticle,
    housingMaterial: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .48, metalness: .65 }),
    glassMaterial: new THREE.MeshBasicMaterial({ color: '#84d9d3', transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    reticleMaterial: new THREE.MeshBasicMaterial({ color: '#ff3b35', transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  };
  return shared;
}

// Coordinates match the gun: up is +Y and the player looks through it toward -Z.
// The same buffers serve every avatar; viewmodels may clone materials for depth.
export function createHolographicSight(classId, originalSight) {
  const [x] = originalSight;
  const piggyback = classId === 'sniper';
  // Receiver/optic roof heights measured on the normalized weapon meshes.
  // The frame sits on its thin clamp plate, with no raised mounting column.
  const fits = { assault: [.118, -.06], scout: [.112, -.045], sniper: [.18, -.015], heavy: [.171, -.125] };
  const [centerY, z] = fits[classId] || fits.assault;
  const group = new THREE.Group();
  group.name = 'holographic-sight';
  group.position.set(x, centerY, z);
  const asset = resources();
  const frame = new THREE.Mesh(housing(piggyback, piggyback ? .006 : classId === 'assault' ? .01 : .008), asset.housingMaterial);
  frame.name = 'holographic-housing';
  const glass = new THREE.Mesh(piggyback ? asset.scopeGlass : asset.glass, asset.glassMaterial);
  glass.name = 'holographic-glass';
  const reticle = new THREE.Mesh(asset.reticle, asset.reticleMaterial);
  reticle.name = 'holographic-reticle';
  reticle.position.z = RETICLE_Z;
  glass.renderOrder = 1;
  reticle.renderOrder = 2;
  for (const part of [frame, glass, reticle]) part.userData.sharedModel = true;
  frame.castShadow = true;
  group.add(frame, glass, reticle);
  group.userData.lensCenter = [x, centerY, z];
  group.userData.sight = [x, centerY, z + RETICLE_Z];
  return group;
}
