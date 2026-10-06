import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { applySurfaceUV } from './surfaces.js';

// Non-solid scenery stays beyond the playable boundary. Inside it, only foliage
// and antenna dishes are decorative; their trunks and foundations are map solids.
export function addEnvironmentDetails(parent, map, surfaceMaterial) {
  const shapes = new Map();
  const half = map.size / 2;
  const defaultSurface = map.id === 'canyon-relay' ? 'stone' : ['freight-yard', 'vertex'].includes(map.id) ? 'metal' : 'concrete';
  function shape(geometry, color, x, y, z, rotation = {}, surface = defaultSurface) {
    geometry.rotateX(rotation.x || 0);
    geometry.rotateY(rotation.y || 0);
    geometry.rotateZ(rotation.z || 0);
    geometry.translate(x, y, z);
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    if (surface === 'stone') flat.computeVertexNormals();
    applySurfaceUV(flat, surface);
    const tint = new THREE.Color(color);
    const colors = new Float32Array(flat.attributes.position.count * 3);
    const normals = flat.attributes.normal;
    for (let i = 0; i < colors.length; i += 3) {
      // Leaf clusters have darker undersides and restrained varied greens.
      const shade = surface === 'foliage' ? 0.8 + Math.max(0, normals.getY(i / 3)) * 0.2 : 1;
      colors.set([tint.r * shade, tint.g * shade, tint.b * shade], i);
    }
    flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // All primitives share exactly the attributes needed by the merged mesh.
    for (const key of Object.keys(flat.attributes)) if (!['position', 'normal', 'color', 'uv'].includes(key)) flat.deleteAttribute(key);
    if (!shapes.has(surface)) shapes.set(surface, []);
    shapes.get(surface).push(flat);
  }
  const block = (x, y, z, w, h, d, color) => shape(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z);
  const column = (x, y, z, radius, height, color, topRadius = radius, sides = 12, surface = defaultSurface) =>
    shape(new THREE.CylinderGeometry(topRadius, radius, height, sides), color, x, y + height / 2, z, {}, surface);
  function strut(a, b, radius, color, surface = 'metal') {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const delta = end.clone().sub(start);
    const geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), 6);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    const center = start.add(end).multiplyScalar(0.5);
    shape(geometry, color, center.x, center.y, center.z, {}, surface);
  }

  if (map.id === 'canyon-relay') {
    // Broad, irregular buttes give the canyon a continuous geological horizon.
    for (let i = 0; i < 26; i++) {
      const angle = i * Math.PI * 2 / 26;
      const distance = (half + 27 + i % 3 * 10) / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
      const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance;
      const height = 18 + i % 6 * 5;
      const radius = 11 + i % 4 * 3;
      column(x, -4, z, radius, height, i % 2 ? '#a96e50' : '#c08a62', radius * 0.65, 5 + i % 3);
      column(x + 1, height - 4, z - 1, radius * 0.7, 2.2, '#ddb386', radius * 0.6, 6);
      if (i % 3 === 0) {
        column(x - radius * 0.9, -4, z + radius * 0.7, radius * 0.38, height * 0.74, '#b87754', radius * 0.14, 5);
      }
    }
    // A distant natural arch breaks the horizon above the playable canyon.
    const archZ = -half - 42;
    column(-15, 0, archZ, 6, 27, '#b77c58', 3.4, 6);
    column(15, 0, archZ, 7, 27, '#b77c58', 4.2, 6);
    shape(new THREE.TorusGeometry(15, 4.5, 5, 12, Math.PI), '#ca936a', 0, 26, archZ);
  } else if (map.id === 'freight-yard') {
    // Port cranes, spherical-cap silos, chimneys, and cargo silhouettes.
    for (let i = 0; i < 5; i++) {
      const x = -48 + i * 24, z = -half - 29;
      const height = 25 + i % 2 * 8;
      for (const side of [-1, 1]) {
        strut([x + side * 8, -2, z], [x + side * 5, height, z], 0.75, '#657981');
        strut([x + side * 8, -2, z - 10], [x + side * 5, height, z - 10], 0.75, '#657981');
      }
      block(x, height, z - 5, 15, 1.4, 28, '#dca957');
      block(x, height - 1, z + 4, 6, 4, 5, '#dca957');
      strut([x, height + 6, z - 7], [x, height + 1, z + 9], 0.14, '#293d49');
      strut([x, height + 6, z - 7], [x, height + 1, z - 19], 0.14, '#293d49');
      strut([x, height, z + 8], [x, height - 13, z + 8], 0.055, '#293d49');
    }
    for (let i = 0; i < 6; i++) {
      const x = half + 19 + i % 2 * 13, z = -30 + i * 14;
      const height = 15 + i % 3 * 4;
      column(x, -2, z, 5, height, '#aab5b1', 5, 16);
      shape(new THREE.SphereGeometry(5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#ccd1c7', x, height - 2, z);
      for (const y of [3, 9]) shape(new THREE.TorusGeometry(5.06, 0.11, 4, 16), '#647880', x, y, z, { x: Math.PI / 2 });
    }
    for (let i = 0; i < 8; i++) {
      const x = -half - 20 - i % 2 * 12, z = -44 + i * 13;
      block(x, -1, z, 7, 5 + i % 3 * 3, 11, i % 2 ? '#687d83' : '#af6e4f');
      if (i % 2 === 0) column(x, 4, z, 1.8, 22 + i, '#6b7d83', 1.2, 12);
    }
  } else if (map.id === 'sky-garden') {
    // Rounded towers rise from stepped sky-islands instead of a warehouse skyline.
    for (let i = 0; i < 18; i++) {
      const angle = i * Math.PI * 2 / 18;
      const distance = (half + 38 + i % 3 * 17) / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
      const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance;
      const radius = 5 + i % 4 * 1.5, height = 16 + i % 5 * 7;
      column(x, -18, z, radius * 0.6, 16, '#90aeb0', radius * 1.8, 8);
      column(x, -2, z, radius * 1.85, 1.4, '#d1ded5', radius * 1.85, 16);
      column(x, -0.6, z, radius * 1.5, 0.6, '#718e67', radius * 1.5, 16, 'foliage');
      column(x, 0, z, radius, height, i % 2 ? '#b5d2cb' : '#dbe0d2', radius * 0.65, 12);
      for (let y = 6; y < height; y += 6) column(x, y, z, radius * (1 - y / height * 0.35) + 0.8, 0.45, '#6d9990', radius * (1 - y / height * 0.35) + 0.8, 12);
      shape(new THREE.SphereGeometry(radius * 0.7, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#ecede1', x, height, z);
    }
    const clouds = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshBasicMaterial({ color: '#d5e6e3' }));
    clouds.rotation.x = -Math.PI / 2;
    clouds.position.y = -24;
    parent.add(clouds);
    // The arena's underside is visible from the low parapets and distant skyline.
    column(0, -20, 0, half * 0.55, 19, '#819e9b', half * 1.3, 8);
  } else if (map.id === 'vertex') {
    // Derelict station hulks drift at the boundary; a distant planet anchors the skyline.
    for (let i = 0; i < 10; i++) {
      const angle = i * Math.PI * 2 / 10;
      const distance = half + 36 + (i % 3) * 14;
      const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance;
      block(x, 6 + (i % 4) * 9, z, 6 + i % 3 * 3, 4 + i % 3 * 2, 10 + i % 2 * 4, i % 2 ? '#3d4571' : '#2a3057');
      if (i % 2 === 0) strut([x - 6, 4 + i, z], [x + 6, 10 + i, z], 0.18, '#8be9ff');
    }
    shape(new THREE.SphereGeometry(42, 24, 24), '#4a5490', -half - 180, 60, -half - 180);
  } else {
    for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI * 2 / 16;
      const distance = (half + 30 + i % 3 * 12) / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
      block(Math.cos(angle) * distance, -2, Math.sin(angle) * distance, 8 + i % 4 * 3, 12 + i % 6 * 5, 12, i % 2 ? '#a1b7b3' : '#bfc7bb');
    }
  }

  for (const [index, detail] of (map.details || []).entries()) {
    if (detail.kind === 'tree') {
      const { x, y = 0, z, height = 4, radius = 2.5 } = detail;
      const crownY = y + height;
      strut([x, crownY - 1, z], [x - radius * 0.55, crownY + 0.1, z], 0.13, '#725b40', 'wood');
      strut([x, crownY - 1.2, z], [x + radius * 0.6, crownY + 0.3, z + 0.3], 0.13, '#725b40', 'wood');
      for (const [dx, dy, dz, scale] of [[0, 0.6, 0, 1], [-0.6, 0.1, 0.15, 0.75], [0.55, 0.4, -0.25, 0.72]]) {
        const geometry = new THREE.IcosahedronGeometry(radius * scale, 2);
        geometry.scale(1, 0.78, 1);
        shape(geometry, index % 2 ? '#628e65' : '#91ac66', x + dx * radius, crownY + dy * radius, z + dz * radius, {}, 'foliage');
      }
    } else if (detail.kind === 'dish') {
      const { x, y, z, radius = 3, yaw = 0 } = detail;
      column(x, y, z, 0.23, 1.8, '#425962', 0.23, 8, 'metal');
      const points = Array.from({ length: 9 }, (_, i) => {
        const t = i / 8;
        return new THREE.Vector2(Math.max(0.015, t * radius), t * t * radius * 0.4);
      });
      shape(new THREE.LatheGeometry(points, 20), '#dfd9ba', x, y + 1.6, z, { x: 0.45, y: yaw }, 'metal');
      strut([x, y + 1.7, z], [x, y + 4, z - 1], 0.08, '#334e58');
      shape(new THREE.SphereGeometry(0.23, 8, 6), '#eea359', x, y + 4, z - 1, {}, 'metal');
    }
  }

  for (const [surface, geometries] of shapes) {
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((item) => item.dispose());
    const mesh = new THREE.Mesh(geometry, surfaceMaterial(surface));
    mesh.name = `Scenery / ${surface}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
}
