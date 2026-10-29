import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const UP = new THREE.Vector3(0, 1, 0);
const vector = (point: readonly number[]) =>
  new THREE.Vector3(point[0], point[1], point[2]);

// All pieces become non-indexed, flat-shaded colored triangles before merging.
// Ownership stays with this model: disposing one fighter cannot damage another.
export function colored(
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
) {
  const result = geometry.index ? geometry.toNonIndexed() : geometry;
  if (result !== geometry) geometry.dispose();
  result.deleteAttribute('uv');
  result.computeVertexNormals();
  const count = result.attributes.position.count;
  const tint = new THREE.Color(color);
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 3) {
    const shade = 0.97 + (Math.floor(index / 3) % 4) * 0.01;
    for (let vertex = index; vertex < Math.min(index + 3, count); vertex++) {
      colors[vertex * 3] = tint.r * shade;
      colors[vertex * 3 + 1] = tint.g * shade;
      colors[vertex * 3 + 2] = tint.b * shade;
    }
  }
  result.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return result;
}

export function triangles(
  parts: THREE.BufferGeometry[],
  vertices: number[][],
  faces: number[][],
  color: THREE.ColorRepresentation,
) {
  const positions = faces.flatMap((face) =>
    face.flatMap((index) => vertices[index]),
  );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  parts.push(colored(geometry, color));
  return parts[parts.length - 1];
}

// A loft follows body cross-sections rather than stacking geometric primitives.
// Each section holds [x, y, z, width, depth]. Body sections are horizontal;
// limb sections instead turn to follow their joint's tangent.
export function loft(
  parts: THREE.BufferGeometry[],
  sections: number[][],
  color: THREE.ColorRepresentation,
  sides = 8,
  follow = false,
) {
  const vertices: number[][] = [];
  const faces = [];
  const centers = sections.map((section) => vector(section.slice(0, 3)));
  sections.forEach(([x, y, z, width, depth], ring) => {
    const tangent = centers[Math.min(ring + 1, centers.length - 1)]
      .clone()
      .sub(centers[Math.max(ring - 1, 0)])
      .normalize();
    const turn = new THREE.Quaternion().setFromUnitVectors(UP, tangent);
    for (let side = 0; side < sides; side++) {
      const angle = (side / sides) * Math.PI * 2;
      const point = new THREE.Vector3(
        (Math.sin(angle) * width) / 2,
        0,
        (-Math.cos(angle) * depth) / 2,
      );
      if (follow) point.applyQuaternion(turn);
      vertices.push([point.x + x, point.y + y, point.z + z]);
    }
  });
  for (let ring = 0; ring < sections.length - 1; ring++) {
    for (let side = 0; side < sides; side++) {
      const a = ring * sides + side;
      const b = ring * sides + ((side + 1) % sides);
      faces.push([a, a + sides, b], [b, a + sides, b + sides]);
    }
  }
  const last = (sections.length - 1) * sides;
  for (let side = 1; side < sides - 1; side++) {
    faces.push([0, side, side + 1], [last, last + side + 1, last + side]);
  }
  triangles(parts, vertices, faces, color);
}

export function box(
  parts: THREE.BufferGeometry[],
  position: number[],
  size: number[],
  color: THREE.ColorRepresentation,
  rotation = [0, 0, 0],
) {
  const geometry = colored(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    color,
  );
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rotation[0], rotation[1], rotation[2]),
    ),
  );
  geometry.translate(position[0], position[1], position[2]);
  parts.push(geometry);
}

// Eight corners at each end and a sloping rim give armor crisp silhouettes.
export function plate(
  parts: THREE.BufferGeometry[],
  position: number[],
  size: number[],
  color: THREE.ColorRepresentation,
  tilt = 0,
  taper = 0.85,
  sides = 8,
) {
  const [width, height, depth] = size;
  const pieces: THREE.BufferGeometry[] = [];
  loft(
    pieces,
    [
      [0, -height / 2, 0, width * taper, depth * 0.76],
      [0, -height * 0.32, 0, width, depth],
      [0, height * 0.32, 0, width, depth],
      [0, height / 2, 0, width * 0.8, depth * 0.75],
    ],
    color,
    sides,
  );
  pieces.forEach((piece) => {
    piece.rotateZ(tilt);
    piece.translate(position[0], position[1], position[2]);
    parts.push(piece);
  });
}

export function stroke(
  parts: THREE.BufferGeometry[],
  start: number[],
  end: number[],
  width: number,
  depth: number,
  color: THREE.ColorRepresentation,
  sides = 6,
) {
  if (sides === 4) {
    const from = vector(start),
      to = vector(end);
    const direction = to.clone().sub(from);
    const geometry = colored(
      new THREE.BoxGeometry(width, direction.length(), depth),
      color,
    );
    geometry.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(UP, direction.normalize()),
    );
    geometry.translate(...from.add(to).multiplyScalar(0.5).toArray());
    parts.push(geometry);
    return;
  }
  loft(
    parts,
    [
      [...start, width, depth],
      [...end, width, depth],
    ],
    color,
    sides,
    true,
  );
}

export function makeMesh(
  parts: THREE.BufferGeometry[],
  name: string,
  pivot = [0, 0, 0],
): THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
  const geometry = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  geometry.translate(-pivot[0], -pivot[1], -pivot[2]);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.9,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(pivot[0], pivot[1], pivot[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
