import * as THREE from 'three';
import type { Box } from '../shared/types.ts';

interface Surface {
  size: number;
  roughness: number;
  bump: number;
  grain: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
  emissive?: string;
  emissiveIntensity?: number;
}
const SURFACES: Record<string, Surface> = {
  concrete: { size: 3, roughness: 0.92, bump: 0.04, grain: 0.06 },
  masonry: { size: 3, roughness: 0.96, bump: 0.065, grain: 0.09 },
  paving: { size: 3, roughness: 0.94, bump: 0.045, grain: 0.065 },
  stone: { size: 4, roughness: 0.98, bump: 0.1, grain: 0.12 },
  earth: { size: 3, roughness: 1, bump: 0.065, grain: 0.15 },
  metal: {
    size: 2,
    roughness: 0.57,
    metalness: 0.3,
    bump: 0.012,
    grain: 0.025,
  },
  corrugated: {
    size: 2,
    roughness: 0.66,
    metalness: 0.25,
    bump: 0.065,
    grain: 0.03,
  },
  foliage: { size: 1.8, roughness: 1, bump: 0.06, grain: 0.16 },
  wood: { size: 2, roughness: 0.94, bump: 0.045, grain: 0.1 },
  glass: {
    size: 3,
    roughness: 0.08,
    metalness: 0.1,
    bump: 0.01,
    grain: 0.02,
    transparent: true,
    opacity: 0.4,
  },
  glow: {
    size: 2,
    roughness: 0.4,
    bump: 0.02,
    grain: 0.05,
    emissive: '#8be9ff',
    emissiveIntensity: 1.6,
  },
};

// Tileable, seeded value noise. Nothing is fetched and map switches reproduce
// exactly the same surfaces. Small mipmapped textures keep distant detail quiet.
function noiseGrid(size: number, random: () => number) {
  const grid = Float32Array.from({ length: size * size }, random);
  return (u: number, v: number) => {
    const x = u * size,
      y = v * size;
    const ix = Math.floor(x),
      iy = Math.floor(y);
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const tx = smooth(x - ix),
      ty = smooth(y - iy);
    const at = (dx: number, dy: number) =>
      grid[((iy + dy) % size) * size + ((ix + dx) % size)];
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(at(0, 0), at(1, 0), tx),
      THREE.MathUtils.lerp(at(0, 1), at(1, 1), tx),
      ty,
    );
  };
}

function surfaceTextures(kind: string) {
  const config = SURFACES[kind];
  const resolution = 256;
  let seed = 739 + Object.keys(SURFACES).indexOf(kind) * 1709;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const broad = noiseGrid(8, random),
    fine = noiseGrid(64, random);
  const courses = Array.from({ length: 18 }, random);
  const strataBoundaries = [0, 0.08, 0.21, 0.25, 0.43, 0.61, 0.68, 0.88, 1];
  const fraction = (value: number) => value - Math.floor(value);
  const color = new Uint8Array(resolution * resolution * 4);
  const height = new Uint8Array(color.length);
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const u = x / resolution,
        v = y / resolution;
      const clouds = broad(u, v),
        grain = fine(u, v),
        speckle = random();
      let relief = clouds * 0.45 + grain * 0.35 + speckle * 0.2;
      let tone = 0.9 + (clouds - 0.5) * 0.13 + (grain - 0.5) * config.grain;
      if (['concrete', 'masonry', 'paving'].includes(kind)) {
        // Real dimensions, not a generic noise overlay: 3 x 1.5 m formwork,
        // 1.5 x 0.5 m sandstone courses, or 1 x 0.5 m courtyard pavers.
        const columns = kind === 'concrete' ? 1 : kind === 'masonry' ? 2 : 3;
        const rows = kind === 'concrete' ? 2 : 6;
        const row = Math.floor(v * rows);
        const offset = kind === 'concrete' ? 0 : (row % 2) * 0.5;
        const column = Math.floor(u * columns + offset) % columns;
        const fu = fraction(u * columns + offset),
          fv = fraction(v * rows);
        const du = (Math.min(fu, 1 - fu) * config.size) / columns;
        const dv = (Math.min(fv, 1 - fv) * config.size) / rows;
        const joint = Math.min(du, dv);
        const width = kind === 'concrete' ? 0.012 : 0.017;
        const bevel = THREE.MathUtils.smoothstep(joint, width, width + 0.022);
        tone +=
          (courses[row * columns + column] - 0.5) *
          (kind === 'concrete' ? 0.045 : 0.11);
        if (joint < width + 0.022) {
          tone = THREE.MathUtils.lerp(
            kind === 'concrete' ? 0.73 : 0.65,
            tone + 0.025,
            bevel,
          );
          relief = THREE.MathUtils.lerp(0.08, relief, bevel);
        }
        if (kind === 'concrete') {
          const holeX = Math.min(Math.abs(fu - 0.12), Math.abs(fu - 0.88)) * 3;
          const holeY = Math.min(Math.abs(fv - 0.2), Math.abs(fv - 0.8)) * 1.5;
          const hole =
            1 -
            THREE.MathUtils.smoothstep(Math.hypot(holeX, holeY), 0.018, 0.034);
          tone -= hole * 0.19;
          relief -= hole * 0.3;
        }
        if (speckle < 0.025) {
          tone -= 0.12;
          relief -= 0.25;
        }
      } else if (kind === 'stone') {
        // Uneven deposited layers bend and break with the rock; no regular
        // straight stripes that make the canyon look like built brickwork.
        const level = fraction(
          v + (broad(u, 0.27) - 0.5) * 0.045 + (clouds - 0.5) * 0.012,
        );
        const band =
          strataBoundaries.findIndex(
            (boundary, i) => i > 0 && level < boundary,
          ) - 1;
        const edge = Math.min(
          level - strataBoundaries[band],
          strataBoundaries[band + 1] - level,
        );
        const seam = 1 - THREE.MathUtils.smoothstep(edge, 0.001, 0.008);
        tone += (courses[band] - 0.5) * 0.13 - seam * 0.055;
        relief += (courses[band] - 0.5) * 0.18 - seam * 0.18;
      } else if (kind === 'metal' || kind === 'corrugated') {
        const brushed = Math.sin(u * Math.PI * 192) * 0.015;
        tone += brushed;
        relief = grain * 0.3 + brushed;
        if (kind === 'corrugated') {
          const rib = THREE.MathUtils.smoothstep(
            Math.abs(fraction(u * 8) - 0.5),
            0.12,
            0.3,
          );
          tone += rib * 0.075 - 0.06;
          relief += rib * 0.65;
        } else {
          const seam = Math.min(u, 1 - u, v, 1 - v) * config.size;
          if (seam < 0.012) {
            tone -= 0.12;
            relief -= 0.15;
          } else if (seam < 0.025) tone += 0.035;
        }
      } else if (kind === 'wood') {
        const fibers = Math.sin(u * Math.PI * 42 + clouds * 5);
        tone += fibers * 0.075;
        relief += fibers * 0.2;
      } else if (kind === 'foliage') {
        tone -= grain > 0.55 ? 0.09 : 0;
      }
      const index = (y * resolution + x) * 4;
      const tint = Math.round(THREE.MathUtils.clamp(tone, 0, 1) * 255);
      const bump = Math.round(THREE.MathUtils.clamp(relief, 0, 1) * 255);
      color.set([tint, tint, tint, 255], index);
      height.set([bump, bump, bump, 255], index);
    }
  }
  const texture = (
    data: THREE.TypedArray | null | undefined,
    name: string,
    colorSpace: string,
  ) => {
    const result = new THREE.DataTexture(data, resolution, resolution);
    result.name = `${kind} / ${name}`;
    result.wrapS = result.wrapT = THREE.RepeatWrapping;
    result.magFilter = THREE.LinearFilter;
    result.minFilter = THREE.LinearMipmapLinearFilter;
    result.generateMipmaps = true;
    result.anisotropy = 4;
    result.colorSpace = colorSpace;
    result.needsUpdate = true;
    return result;
  };
  return {
    map: texture(color, 'grain', THREE.SRGBColorSpace),
    bumpMap: texture(height, 'relief', THREE.NoColorSpace),
  };
}

export function createSurfaceLibrary() {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  return (kind: string) => {
    if (!materials.has(kind)) {
      const config = SURFACES[kind];
      const material = new THREE.MeshStandardMaterial({
        ...surfaceTextures(kind),
        vertexColors: true,
        roughness: config.roughness,
        metalness: config.metalness || 0,
        bumpScale: config.bump,
        side: THREE.DoubleSide,
        ...(config.transparent
          ? { transparent: true, opacity: config.opacity }
          : {}),
        ...(config.emissive
          ? {
              emissive: new THREE.Color(config.emissive),
              emissiveIntensity: config.emissiveIntensity,
            }
          : {}),
      });
      material.name = `Surface / ${kind}`;
      materials.set(kind, material);
    }
    return materials.get(kind)!;
  };
}

export function surfaceForBox(box: Box, mapId: string) {
  const style = box.style || 'wall';
  if (style === 'garden') return 'foliage';
  if (style === 'glass') return 'glass';
  if (style === 'glow') return 'glow';
  if (['trunk', 'sleeper'].includes(style)) return 'wood';
  if (['rock', 'rockLight'].includes(style)) return 'stone';
  if (['stone', 'sand'].includes(style)) return 'masonry';
  if (style === 'ballast' || (style === 'floor' && mapId === 'canyon-relay'))
    return 'earth';
  if (style === 'floor')
    return mapId === 'freight-yard' ? 'concrete' : 'paving';
  if (style.startsWith('container')) return 'corrugated';
  if (['hull', 'deck', 'core'].includes(style)) return 'metal';
  if (
    ['metal', 'machinery', 'rail', 'crane', 'pillar', 'beam'].includes(style) ||
    (['bridge', 'roof', 'cover'].includes(style) && mapId === 'freight-yard')
  )
    return 'metal';
  return 'concrete';
}

// Project after translation: a 1 m cover and a 60 m wall have the same grain
// scale. Geometry remains exactly aligned with the shared collision boxes.
export function applySurfaceUV(geometry: THREE.BufferGeometry, kind: string) {
  const positions = geometry.attributes.position,
    normals = geometry.attributes.normal;
  const values = new Float32Array(positions.count * 2);
  const scale = 1 / SURFACES[kind].size;
  let nx = 0,
    ny = 0,
    nz = 0;
  for (let i = 0; i < positions.count; i++) {
    if (geometry.index) {
      nx = Math.abs(normals.getX(i));
      ny = Math.abs(normals.getY(i));
      nz = Math.abs(normals.getZ(i));
    } else if (i % 3 === 0) {
      // Choose one projection for each triangle so rounded foliage never
      // stretches a triangle across different cube-projection axes.
      nx = Math.abs(
        normals.getX(i) + normals.getX(i + 1) + normals.getX(i + 2),
      );
      ny = Math.abs(
        normals.getY(i) + normals.getY(i + 1) + normals.getY(i + 2),
      );
      nz = Math.abs(
        normals.getZ(i) + normals.getZ(i + 1) + normals.getZ(i + 2),
      );
    }
    values[i * 2] =
      (nx > ny && nx > nz ? positions.getZ(i) : positions.getX(i)) * scale;
    values[i * 2 + 1] =
      (ny >= nx && ny >= nz ? positions.getZ(i) : positions.getY(i)) * scale;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(values, 2));
  return geometry;
}
