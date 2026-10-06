import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { getPower, predictBlastTrajectory } from '../shared/powers.js';
import { createAvatar, updateCharacter } from './characters.js';
import { hasGameModels, disposeModel } from './game-models.js';

const LIMIT = 6;
const finitePosition = (value) => value && [value.x, value.y, value.z].every(Number.isFinite);
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const canAimBlast = (player) => finitePosition(player) && player.classId === 'assault' && player.health > 0
  && !player.ropeId && Number.isFinite(player.abilityCooldown ?? 0) && (player.abilityCooldown ?? 0) < .0001
  && Number.isFinite(player.yaw) && Number.isFinite(player.pitch) && Number.isFinite(player.eyeHeight);
const planeVertex = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const hologramVertex = `
uniform float uTime, uGlitch;
varying vec2 vUv;
varying vec3 vNormal, vView, vLocal;
#include <common>
#include <skinning_pars_vertex>
void main() {
  vUv = uv;
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  vNormal = normalize(transformedNormal);
  #include <begin_vertex>
  #include <skinning_vertex>
  vLocal = transformed;
  float band = floor(transformed.y * 8.0);
  transformed.x += sin(band * 13.0 + floor(uTime * 14.0)) * uGlitch * 0.07;
  vec4 view = modelViewMatrix * vec4(transformed, 1.0);
  vView = -view.xyz;
  gl_Position = projectionMatrix * view;
}`;
const hologramFragment = `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uOpacity, uTime, uBands, uDissolve;
varying vec2 vUv;
varying vec3 vNormal, vView, vLocal;
float hash(vec3 p) { return fract(sin(dot(p, vec3(13.19, 71.71, 39.17))) * 43758.54); }
void main() {
  float blocks = hash(floor(vLocal * vec3(15.0, 18.0, 15.0)));
  if (blocks < uDissolve) discard;
  // Three broad interruption bands keep the running silhouette legible.
  float band = fract(vLocal.y * 1.8 - uTime * 0.08);
  if (uBands > 0.5 && band < 0.045) discard;
  float scan = smoothstep(0.82, 0.96, fract(vLocal.y * 28.0 - uTime * 0.3));
  vec3 normal = normalize(vNormal);
  float rim = pow(1.0 - abs(dot(normal, normalize(vView))), 2.0);
  float detail = dot(texture2D(uMap, vUv).rgb, vec3(0.26, 0.65, 0.09));
  float light = 0.55 + 0.45 * max(0.0, dot(normal, normalize(vec3(-0.3, 0.6, 1.0))));
  vec3 color = uColor * (0.36 + detail * 0.7) * light;
  color = mix(color, vec3(0.64, 1.0, 1.0), rim * 0.8 + scan * uBands * 0.12);
  float edge = uDissolve > 0.0 ? 1.0 - smoothstep(0.0, 0.075, blocks - uDissolve) : 0.0;
  color = mix(color, vec3(0.82, 1.0, 1.0), edge * 0.8);
  float alpha = uOpacity * (0.42 + 0.5 * rim + scan * uBands * 0.08);
  gl_FragColor = vec4(color, alpha);
  #include <colorspace_fragment>
}`;
const shieldFragment = `
uniform float uOpacity, uHit, uTime;
uniform vec2 uImpact;
varying vec2 vUv;
void main() {
  vec2 edge = min(vUv, 1.0 - vUv);
  float boundary = min(edge.x, edge.y);
  // The bright frame is chamfered inside the full rectangular energy field.
  // Faint corner coverage remains visible and exactly matches the hit plane.
  float frameDistance = min(boundary - 0.014, (edge.x + edge.y - 0.078) * 0.7071);
  float solidEdge = 1.0 - smoothstep(0.003, 0.008, abs(frameDistance));
  float inner = 1.0 - smoothstep(0.002, 0.005, abs(frameDistance - 0.032));
  float along = edge.x < edge.y ? vUv.y : vUv.x;
  float segments = step(0.12, fract(along * 9.0));
  float cornerCoverage = (1.0 - smoothstep(0.001, 0.0025, boundary)) * 0.13;
  float frame = max(cornerCoverage, max(solidEdge, inner * segments * 0.45));
  float facet = abs(vUv.x - 0.5) * 0.13 + abs(vUv.y - 0.5) * 0.05;
  float pattern = pow(max(0.0, sin((vUv.x * 10.0 + vUv.y * 13.0) * 3.14159)), 32.0) * 0.025;
  vec2 delta = (vUv - uImpact) * vec2(0.9394, 1.0);
  float distance = length(delta);
  float ripple = exp(-abs(distance - (1.0 - uHit) * 0.75) * 90.0) * uHit;
  float angle = atan(delta.y, delta.x);
  float star = (1.0 - smoothstep(0.012 + pow(abs(cos(angle * 2.0)), 18.0) * 0.15,
    0.022 + pow(abs(cos(angle * 2.0)), 18.0) * 0.15, distance)) * smoothstep(0.3, 0.8, uHit);
  vec3 color = mix(vec3(0.16, 0.48, 0.3), vec3(0.69, 1.0, 0.66), frame);
  color = mix(color, vec3(1.0, 1.0, 0.86), clamp(ripple + star, 0.0, 1.0));
  float alpha = clamp(uOpacity + facet + pattern + frame * 0.82 + ripple * 0.65 + star * 0.9, 0.0, 0.98);
  gl_FragColor = vec4(color, alpha);
  #include <colorspace_fragment>
}`;
const ringFragment = `
uniform vec3 uColor;
uniform float uProgress, uOpacity, uWarning;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float radius = length(p);
  float outer = uWarning > 0.5 ? 0.87 : 0.12 + pow(uProgress, 0.55) * 0.86;
  float line = exp(-pow((radius - outer) * 80.0, 2.0));
  float glow = exp(-abs(radius - outer) * 28.0) * 0.24;
  float second = uWarning > 0.5 ? 0.0 : exp(-pow((radius - outer * 0.75) * 95.0, 2.0)) * 0.5;
  float fill = (1.0 - smoothstep(0.0, outer, radius)) * (uWarning > 0.5 ? 0.035 : 0.12);
  float angle = atan(p.y, p.x) / 6.283185 + 0.5;
  float fuse = uWarning > 0.5 ? mix(0.25, 1.0, step(angle, uProgress)) : 1.0;
  float alpha = (line + glow + second + fill) * uOpacity * fuse;
  if (alpha < 0.005) discard;
  gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.88, 0.57), line * 0.32), alpha);
  #include <colorspace_fragment>
}`;
const ribbonFragment = `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float edge = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.88, 1.0, vUv.y));
  float alpha = edge * pow(vUv.x, 0.5) * uOpacity;
  float core = exp(-abs(vUv.y - 0.5) * 15.0) * 0.3;
  gl_FragColor = vec4(mix(uColor, vec3(0.8, 1.0, 0.95), core), alpha);
  #include <colorspace_fragment>
}`;

function flatGeometry(points) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function puckSegments() {
  const vertices = [];
  const point = (radius, angle) => [Math.cos(angle) * radius, .043, Math.sin(angle) * radius];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + .07, b = (i + 1) / 8 * Math.PI * 2 - .07;
    vertices.push(...point(.13, a), ...point(.175, a), ...point(.175, b), ...point(.13, a), ...point(.175, b), ...point(.13, b));
  }
  for (let i = 0; i < 12; i++) vertices.push(0, .048, 0, ...point(.092, i / 12 * Math.PI * 2), ...point(.092, (i + 1) / 12 * Math.PI * 2));
  return flatGeometry(vertices);
}

function ribbonGeometry() {
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, width = Math.sin(t * Math.PI) * .12;
    for (const side of [-1, 1]) {
      positions.push(Math.sin(t * Math.PI) * .12, side * width + Math.sin(t * 4) * .06, (t - 1) * 2.2);
      uvs.push(t, (side + 1) / 2);
    }
    if (i < 10) { const p = i * 2; indices.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
  }
  const geometry = flatGeometry(positions);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function shieldFacetGeometry(width, height) {
  const points = [], hx = width / 2, hy = height / 2;
  const ring = (inset, cut, z) => [
    [-hx + inset + cut, -hy + inset, z], [hx - inset - cut, -hy + inset, z],
    [hx - inset, -hy + inset + cut, z], [hx - inset, hy - inset - cut, z],
    [hx - inset - cut, hy - inset, z], [-hx + inset + cut, hy - inset, z],
    [-hx + inset, hy - inset - cut, z], [-hx + inset, -hy + inset + cut, z],
  ];
  const outside = ring(.022, .09, -.025), inside = ring(.105, .06, 0);
  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8;
    points.push(...outside[i], ...outside[next], ...inside[i], ...outside[next], ...inside[next], ...inside[i]);
  }
  return flatGeometry(points);
}

// All mesh pools are bounded. Cached character geometry and texture atlases are
// never modified: each hologram owns only materials and an independent skeleton.
export function createPowerEffects(scene, { requestClassModels } = {}) {
  const root = new THREE.Group(); root.name = 'power-effects'; scene.add(root);
  const resources = new Set(), instanceMeshes = new Set();
  const own = (value) => { resources.add(value); return value; };
  const basic = (color, opacity = 1) => own(new THREE.MeshBasicMaterial({ color, opacity, transparent: true,
    depthWrite: false, toneMapped: false, side: THREE.DoubleSide, forceSinglePass: true }));
  const shader = (fragmentShader, uniforms, vertexShader = planeVertex) => own(new THREE.ShaderMaterial({
    vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false, toneMapped: false,
    side: THREE.DoubleSide, forceSinglePass: true,
  }));
  const ringMaterial = (warning = false) => shader(ringFragment, { uColor: { value: new THREE.Color('#ff8b31') },
    uProgress: { value: 0 }, uOpacity: { value: .85 }, uWarning: { value: Number(warning) } });
  const plane = own(new THREE.PlaneGeometry(2, 2));
  const puckBody = own(new THREE.CylinderGeometry(.175, .2, .08, 12));
  const puckGlow = own(puckSegments());
  const ribbon = own(ribbonGeometry());
  const kick = own(flatGeometry([-.1,0,0, -.52,.52,0, -.36,.7,0, -.02,.05,0, .02,1.03,0, .23,1.2,0, .12,.01,0, .48,.46,0, .67,.34,0]));
  const shard = own(flatGeometry([-.09,-.12,0, .09,-.1,0, 0,.2,0]));
  const star = own(flatGeometry([-.24,0,0, 0,.045,0, .24,0,0, -.24,0,0, 0,-.045,0, .24,0,0,
    0,-.24,0, .045,0,0, 0,.24,0, 0,-.24,0, -.045,0,0, 0,.24,0]));
  const shieldPower = getPower('heavy');
  const shieldGeometry = own(new THREE.PlaneGeometry(shieldPower.shieldWidth, shieldPower.shieldHeight));
  const shieldFacets = own(shieldFacetGeometry(shieldPower.shieldWidth, shieldPower.shieldHeight));
  const point = new THREE.Vector3(), dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0), facing = new THREE.Vector3(0, 0, 1);
  let localId = '', now = 0, disposed = false, quality = 'balanced', animate = true;
  let playerStates = new Map();
  const requests = new Map(), seenEvents = new Set();
  let burstCursor = 0, trailCursor = 0, ghostCursor = 0, shardCursor = 0;

  const pool = (size, make) => Array.from({ length: size }, () => {
    const slot = { state: null, life: 0, age: 0, ...make() };
    if (slot.object) { slot.object.visible = false; root.add(slot.object); }
    return slot;
  });
  const instances = (count, color) => {
    const mesh = new THREE.InstancedMesh(shard, basic(color), count);
    mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instanceMeshes.add(mesh); return mesh;
  };
  const pucks = pool(LIMIT, () => {
    const object = new THREE.Group();
    const body = new THREE.Mesh(puckBody, own(new THREE.MeshStandardMaterial({ color: '#293039', roughness: .5, metalness: .6 })));
    const core = new THREE.Mesh(puckGlow, basic('#ff922e'));
    const warning = new THREE.Mesh(plane, ringMaterial(true));
    warning.name = 'blast-warning'; warning.rotation.x = -Math.PI / 2;
    warning.position.y = -.039; warning.scale.setScalar(.43);
    object.add(body, core, warning); return { object, core, warning };
  });
  const shields = pool(LIMIT, () => {
    const surface = new THREE.Mesh(shieldGeometry, shader(shieldFragment, { uOpacity: { value: .08 },
      uHit: { value: 0 }, uTime: { value: 0 }, uImpact: { value: new THREE.Vector2(.5, .5) } }));
    const facets = new THREE.Mesh(shieldFacets, basic('#b4efbe', .14));
    const object = new THREE.Group(); object.add(surface, facets);
    return { object, surface, facets, hit: 0 };
  });
  const echoes = pool(LIMIT, () => ({ object: null, paints: [] }));
  const afterimages = pool(4, () => ({ object: null, paints: [] }));
  const bursts = pool(LIMIT, () => {
    const object = new THREE.Group();
    const wave = new THREE.Mesh(plane, ringMaterial()); wave.rotation.x = -Math.PI / 2;
    const marks = new THREE.Mesh(kick, basic('#ff9a3d'));
    const sparks = instances(12, '#ffc36b');
    object.add(wave, marks, sparks); return { object, wave, marks, sparks };
  });
  const shards = pool(LIMIT, () => {
    const object = new THREE.Group(), pieces = instances(12, '#b5efb6');
    const flash = new THREE.Mesh(star, basic('#fff7c6'));
    object.add(pieces, flash); return { object, pieces, flash };
  });
  const trails = pool(LIMIT, () => {
    const paint = shader(ribbonFragment, { uColor: { value: new THREE.Color('#5cdeca') }, uOpacity: { value: .75 } });
    const object = new THREE.Group(), upper = new THREE.Mesh(ribbon, paint), lower = new THREE.Mesh(ribbon, paint);
    upper.position.set(-.18, .35, 0); lower.position.set(.2, -.22, -.25);
    lower.scale.z = .82; object.add(upper, lower);
    return { object, paint, lower, snapshots: 0 };
  });

  // Aim guides share fixed buffers; only a new physics prediction writes them.
  // The contact ring is tangent to the hit surface, including walls/ceilings.
  const blastAim = new THREE.Group(); blastAim.name = 'blast-aim'; blastAim.visible = false; root.add(blastAim);
  const aimGeometry = own(new LineSegmentsGeometry().setPositions(new Float32Array(127 * 6)));
  aimGeometry.instanceCount = 0;
  const aimPaint = own(new LineMaterial({ color: '#ff7b24', linewidth: 2.5, dashed: true, dashSize: .2, gapSize: .1,
    transparent: true, opacity: 1, depthWrite: false, toneMapped: false }));
  const aimArc = new LineSegments2(aimGeometry, aimPaint);
  aimArc.computeLineDistances();
  const aimStarts = aimGeometry.getAttribute('instanceStart'), aimEnds = aimGeometry.getAttribute('instanceEnd');
  const aimDistanceStarts = aimGeometry.getAttribute('instanceDistanceStart'), aimDistanceEnds = aimGeometry.getAttribute('instanceDistanceEnd');
  aimStarts.data.setUsage(THREE.DynamicDrawUsage); aimDistanceStarts.data.setUsage(THREE.DynamicDrawUsage);
  aimArc.name = 'blast-aim-arc'; aimArc.frustumCulled = false; blastAim.add(aimArc);
  const contact = new THREE.Group(); contact.name = 'blast-aim-target'; blastAim.add(contact);
  const circlePoints = [];
  for (let index = 0; index < 64; index++) {
    const angle = index / 64 * Math.PI * 2, next = (index + 1) / 64 * Math.PI * 2;
    circlePoints.push(Math.cos(angle), Math.sin(angle), 0, Math.cos(next), Math.sin(next), 0);
  }
  const circle = own(new LineSegmentsGeometry().setPositions(circlePoints));
  const targetPaint = own(new LineMaterial({ color: '#ff7b24', linewidth: 2.5, transparent: true, opacity: 1, depthWrite: false, toneMapped: false }));
  const target = new LineSegments2(circle, targetPaint); target.computeLineDistances(); target.scale.setScalar(.24); contact.add(target);
  const ticks = own(new LineSegmentsGeometry().setPositions([-.47,0,0, -.32,0,0, .32,0,0, .47,0,0,
    0,-.47,0, 0,-.32,0, 0,.32,0, 0,.47,0]));
  contact.add(new LineSegments2(ticks, targetPaint));
  const radiusPaint = own(new LineMaterial({ color: '#ff7b24', linewidth: 1.5, dashed: true, dashSize: .065, gapSize: .045,
    transparent: true, opacity: .6, depthWrite: false, toneMapped: false }));
  const aimRadius = new LineSegments2(circle, radiusPaint); aimRadius.name = 'blast-aim-radius'; contact.add(aimRadius);
  let aimResult = null, aimPose = null, aimMap = null, aimUpdated = -Infinity;

  function clearBlastAim() {
    blastAim.visible = false; aimResult = aimPose = aimMap = null; aimUpdated = -Infinity;
  }

  function setBlastAim(player, map, force = false) {
    if (disposed || !canAimBlast(player) || !map || !Array.isArray(map.boxes) || !Number.isFinite(map.size)) {
      clearBlastAim(); return null;
    }
    const sameOwner = aimPose?.id === player.id && aimPose?.life === player.life;
    const sameMap = aimMap === map;
    const unchanged = sameOwner && sameMap && aimPose.x === player.x && aimPose.y === player.y && aimPose.z === player.z
      && aimPose.yaw === player.yaw && aimPose.pitch === player.pitch && aimPose.eyeHeight === player.eyeHeight;
    if (!force && aimResult && sameOwner && sameMap && (unchanged || (now >= aimUpdated && now - aimUpdated < 1 / 30))) return aimResult;
    const result = predictBlastTrajectory(player, map);
    if (!result || !finitePosition(result.landing) || !result.points?.length || result.points.length > 128
      || !result.points.every(finitePosition)) { clearBlastAim(); return null; }
    const start = result.points[0];
    result.distance = Math.hypot(result.landing.x - start.x, result.landing.y - start.y, result.landing.z - start.z);
    result.status = result.landed ? 'ready' : 'no-surface';
    let distance = 0;
    for (let index = 0; index < result.points.length - 1; index++) {
      const start = result.points[index], end = result.points[index + 1];
      aimStarts.setXYZ(index, start.x, start.y, start.z); aimEnds.setXYZ(index, end.x, end.y, end.z);
      aimDistanceStarts.setX(index, distance);
      distance += Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
      aimDistanceEnds.setX(index, distance);
    }
    aimStarts.data.needsUpdate = true; aimDistanceStarts.data.needsUpdate = true; aimGeometry.instanceCount = result.points.length - 1;
    contact.position.copy(result.landing);
    if (result.landed && finitePosition(result.normal)) contact.quaternion.setFromUnitVectors(facing, point.copy(result.normal).normalize());
    else contact.quaternion.identity();
    aimRadius.visible = !!result.landed; aimRadius.scale.setScalar(result.radius);
    aimPaint.color.set(result.landed ? '#ff7b24' : '#ff5d65'); targetPaint.color.copy(aimPaint.color);
    blastAim.visible = true; aimResult = result; aimMap = map; aimUpdated = now;
    aimPose = { id: player.id, life: player.life, x: player.x, y: player.y, z: player.z,
      yaw: player.yaw, pitch: player.pitch, eyeHeight: player.eyeHeight };
    return aimResult;
  }

  function requestModel(classId) {
    if (!requestClassModels || now - (requests.get(classId) ?? -Infinity) < 1) return;
    requests.set(classId, now);
    Promise.resolve(requestClassModels(classId)).catch(() => {});
  }

  function makeGhost(slot, classId, bands) {
    if (!hasGameModels(classId)) { requestModel(classId); return false; }
    const object = createAvatar(undefined, classId), rig = object.userData.character;
    for (const child of [...rig.gun.children]) disposeModel(child);
    object.traverse((part) => {
      if (!part.isMesh) return;
      const paint = shader(hologramFragment, { uMap: { value: part.material.map },
        uColor: { value: new THREE.Color(bands ? '#38d2ed' : '#3ec9b6') }, uOpacity: { value: bands ? .84 : .68 },
        uTime: { value: 0 }, uBands: { value: Number(bands) }, uDissolve: { value: 0 }, uGlitch: { value: 0 } }, hologramVertex);
      paint.opacity = .7; paint.side = THREE.FrontSide;
      part.material = paint; part.castShadow = part.receiveShadow = false; slot.paints.push(paint);
    });
    if (bands) {
      slot.flash = new THREE.Mesh(star, basic('#c7fbff'));
      slot.flash.position.fromArray(rig.gun.userData.anchors.muzzle); slot.flash.scale.setScalar(.4);
      slot.flash.visible = false; rig.gun.add(slot.flash);
    }
    slot.object = object; object.visible = false; root.add(object);
    return true;
  }

  function warmDash() {
    if (!hasGameModels('scout')) { requestModel('scout'); return; }
    for (const slot of afterimages) if (!slot.object) makeGhost(slot, 'scout', false);
  }

  function synchronize(slots, entries, prefix, prepare) {
    const states = entries.filter(finitePosition).slice(0, LIMIT), active = new Set(states.map((state) => state.id));
    for (const slot of slots) if (slot.state && !active.has(slot.state.id)) {
      slot.state = null;
      if (prefix === 'echo' && slot.object) { slot.life = slot.duration = .25; slot.flash.visible = false; }
      else if (slot.object) slot.object.visible = false;
    }
    for (const state of states) {
      const slot = slots.find((item) => item.state?.id === state.id) || slots.find((item) => !item.state);
      if (!slot) continue;
      const reset = slot.state?.id !== state.id;
      slot.state = state; slot.age = 0;
      if (!slot.object && prepare && !prepare(slot)) continue;
      slot.object.name = `${prefix}:${state.id}`; slot.object.visible = true;
      if (reset) {
        slot.hit = 0; slot.life = 0;
        slot.object.position.set(state.x, state.y, state.z);
        if (prefix === 'echo') updateCharacter(slot.object, { reset: true, grounded: state.grounded !== false, speed: Math.hypot(state.vx || 0, state.vz || 0) });
      }
    }
  }

  function placeShield(slot, state) {
    const active = state && state.health > 0 && state.classId === 'heavy' && state.abilityTime > 0 && state.shieldHealth > 0;
    slot.object.visible = !!active;
    if (!active) return;
    const yaw = Number.isFinite(state.yaw) ? state.yaw : 0;
    slot.object.position.set(state.x - Math.sin(yaw) * shieldPower.shieldOffset,
      state.y + .1 + shieldPower.shieldHeight / 2, state.z - Math.cos(yaw) * shieldPower.shieldOffset);
    slot.object.rotation.y = yaw;
    const paint = slot.surface.material;
    paint.opacity = (state.id === localId ? .045 : .085) + slot.hit * .55;
    paint.uniforms.uOpacity.value = paint.opacity;
    paint.uniforms.uHit.value = slot.hit / .28;
    paint.uniforms.uTime.value = animate ? now : 0;
    slot.facets.material.opacity = (state.id === localId ? .07 : .14) + slot.hit * .25;
  }

  function sync({ players = [], effects = [] } = {}, localPlayerId = '') {
    if (disposed) return;
    localId = localPlayerId; playerStates = new Map(players.map((player) => [player.id, player]));
    if (aimPose) {
      const owner = playerStates.get(aimPose.id);
      if (owner && (!canAimBlast(owner) || owner.life !== aimPose.life)) clearBlastAim();
    }
    for (const slot of trails) if (slot.life > 0) {
      const owner = playerStates.get(slot.owner);
      if (owner && (owner.health <= 0 || (owner.life !== undefined && owner.life !== slot.activationLife))) {
        cancelActivation({ owner: slot.owner, life: slot.activationLife, abilitySeq: slot.sequence });
      }
    }
    if (players.some((player) => player.classId === 'scout')) warmDash();
    synchronize(pucks, effects.filter((effect) => effect.type === 'blast'), 'blast');
    synchronize(echoes, effects.filter((effect) => effect.type === 'echo'), 'echo', (slot) => makeGhost(slot, 'sniper', true));
    synchronize(shields, players.filter((player) => player.classId === 'heavy' && player.health > 0
      && player.abilityTime > 0 && player.shieldHealth > 0), 'shield');
    for (const slot of shields) if (slot.state) placeShield(slot, slot.state);
  }

  function snapshot(trail, source = trail.source) {
    const cap = quality === 'low' ? 2 : 4;
    const slot = afterimages[ghostCursor++ % cap];
    if (!slot.object) return;
    slot.life = slot.duration = .32;
    slot.activationKey = trail.activationKey;
    slot.object.name = `dash-afterimage:${trail.owner}:${trail.sequence}:${trail.snapshots}`;
    slot.object.visible = true;
    slot.object.position.set(source.x, source.y, source.z);
    slot.object.rotation.y = source.yaw || 0;
    updateCharacter(slot.object, { reset: true, delta: 0, time: now, speed: Math.hypot(source.vx || 0, source.vz || 0),
      grounded: source.grounded !== false, pitch: source.pitch || 0, abilityTime: Math.max(.09, source.abilityTime || 0),
      abilitySeq: trail.sequence, dashX: trail.dx, dashZ: trail.dz, yaw: source.yaw || 0 });
    slot.object.updateMatrixWorld(true);
    for (const paint of slot.paints) { paint.uniforms.uOpacity.value = .68; paint.uniforms.uDissolve.value = 0; }
    trail.snapshots++;
  }

  function event(value) {
    if (disposed) return;
    if (value?.type === 'shot' && value.shieldHit) {
      const slot = shields.find((item) => item.state?.id === value.shieldHit);
      if (slot) {
        slot.hit = .28;
        if (finitePosition(value.to)) {
          slot.object.updateWorldMatrix(true, false);
          point.copy(value.to); slot.object.worldToLocal(point);
          slot.surface.material.uniforms.uImpact.value.set(clamp(.5 + point.x / shieldPower.shieldWidth), clamp(.5 + point.y / shieldPower.shieldHeight));
        } else slot.surface.material.uniforms.uImpact.value.set(.5, .5);
      }
      return;
    }
    if (value?.type !== 'power' || !finitePosition(value)) return;
    const key = `${value.owner}:${value.life}:${value.abilitySeq}:${value.action}`;
    if (value.owner && value.abilitySeq !== undefined) {
      if (seenEvents.has(key)) return;
      seenEvents.add(key); if (seenEvents.size > 128) seenEvents.delete(seenEvents.values().next().value);
    }
    const owner = playerStates.get(value.owner);
    if (value.powerId === 'air-juke' && value.action === 'activate') {
      if (owner && (owner.health <= 0 || (owner.life !== undefined && owner.life !== value.life))) return;
      warmDash();
      const slot = trails[trailCursor++ % trails.length];
      slot.owner = value.owner; slot.sequence = value.abilitySeq; slot.snapshots = 0;
      slot.activationKey = key; slot.activationLife = value.life;
      slot.source = { ...owner, ...value, grounded: value.grounded ?? owner?.grounded ?? true };
      const direction = [value, owner].find((state) => Number.isFinite(state?.dashX) && Number.isFinite(state?.dashZ) && Math.hypot(state.dashX, state.dashZ) > .001);
      const moving = Number.isFinite(owner?.vx) && Number.isFinite(owner?.vz) && Math.hypot(owner.vx, owner.vz) > .001;
      const dx = direction?.dashX ?? (moving ? owner.vx : -Math.sin(value.yaw || owner?.yaw || 0));
      const dz = direction?.dashZ ?? (moving ? owner.vz : -Math.cos(value.yaw || owner?.yaw || 0));
      const length = Math.hypot(dx, dz) || 1; slot.dx = dx / length; slot.dz = dz / length;
      slot.life = slot.duration = .36; slot.age = 0;
      slot.object.visible = true; slot.object.position.set(value.x, value.y + .8, value.z);
      slot.object.rotation.y = Math.atan2(slot.dx, slot.dz); slot.object.scale.setScalar(1);
      slot.paint.uniforms.uOpacity.value = .75;
      snapshot(slot);
    } else if (value.powerId === 'blast-pop' && value.action === 'pop') {
      const slot = bursts[burstCursor++ % bursts.length];
      slot.life = slot.duration = .55; slot.age = 0;
      slot.object.name = `blast-burst:${value.owner || ''}`; slot.object.visible = true;
      slot.object.position.set(value.x, value.y + .02, value.z);
      slot.wave.scale.setScalar(getPower('assault').radius);
      slot.wave.material.uniforms.uProgress.value = 0;
      slot.wave.material.uniforms.uOpacity.value = .92;
      slot.marks.material.opacity = 1; slot.sparks.material.opacity = 1;
    } else if (value.action === 'glitch' || value.action === 'shatter') {
      if (value.action === 'glitch') {
        const ghost = echoes.find((slot) => slot.object?.name === `echo:${value.effectId}`);
        if (ghost) { ghost.state = null; ghost.life = ghost.duration = .25; }
      }
      const slot = shards[shardCursor++ % shards.length];
      slot.life = slot.duration = value.action === 'shatter' ? .38 : .24; slot.age = 0;
      slot.object.visible = true; slot.glitch = value.action === 'glitch';
      const yaw = owner?.yaw || value.yaw || 0;
      slot.object.position.set(value.x - (slot.glitch ? 0 : Math.sin(yaw) * shieldPower.shieldOffset),
        value.y + (slot.glitch ? .9 : .1 + shieldPower.shieldHeight / 2), value.z - (slot.glitch ? 0 : Math.cos(yaw) * shieldPower.shieldOffset));
      slot.object.rotation.y = yaw;
      slot.pieces.material.color.set(slot.glitch ? '#75e4f2' : '#b5efb6');
      slot.flash.material.color.set(slot.glitch ? '#c7fbff' : '#fff7c6');
    }
  }

  function updateGhost(slot, opacity, dissolve, glitch) {
    for (const paint of slot.paints) {
      paint.uniforms.uOpacity.value = opacity;
      paint.uniforms.uDissolve.value = dissolve;
      paint.uniforms.uTime.value = animate ? now : 0;
      paint.uniforms.uGlitch.value = animate ? glitch : 0;
    }
  }

  function update(delta, time, { quality: nextQuality = 'balanced', motion = true, localPlayer, camera } = {}) {
    if (disposed) return;
    const dt = Number.isFinite(delta) ? clamp(delta, 0, .1) : 0;
    now = Number.isFinite(time) ? time : now + dt; quality = nextQuality; animate = motion;
    if (aimPose && localPlayer && (!canAimBlast(localPlayer) || localPlayer.id !== aimPose.id || localPlayer.life !== aimPose.life)) clearBlastAim();
    if (aimResult && !aimResult.landed && camera) contact.quaternion.copy(camera.quaternion);
    const blend = 1 - Math.exp(-30 * dt);
    for (const slot of pucks) if (slot.state) {
      slot.age += dt;
      const state = slot.state, landed = state.landed !== false, fuseActive = landed || state.flightRemaining <= 0;
      const progress = fuseActive ? clamp(1 - (state.remaining - slot.age) / getPower('assault').fuse) : 0;
      slot.object.position.lerp(point.set(state.x, state.y, state.z), blend);
      if (landed && finitePosition(state.normal)) slot.object.quaternion.setFromUnitVectors(up, point.copy(state.normal).normalize());
      else slot.object.quaternion.identity();
      slot.core.material.color.setRGB(1, .22 + progress * .48, .025 + progress * .12);
      const pulse = animate && fuseActive ? Math.sin(now * (12 + progress * 20)) * .035 : 0;
      slot.core.scale.setScalar(1 + pulse);
      slot.warning.material.uniforms.uProgress.value = progress;
      slot.warning.material.uniforms.uOpacity.value = fuseActive ? .5 + progress * .35 : .25;
      slot.warning.scale.setScalar(.43 + pulse);
    }
    for (const slot of echoes) {
      if (slot.state) {
        if (!slot.object) {
          if (!makeGhost(slot, 'sniper', true)) continue;
          slot.object.name = `echo:${slot.state.id}`; slot.object.position.set(slot.state.x, slot.state.y, slot.state.z);
        }
        slot.age += dt;
        const state = slot.state; slot.object.visible = true;
        slot.object.position.lerp(point.set(state.x, state.y, state.z), blend);
        slot.object.rotation.y = Number.isFinite(state.yaw) ? state.yaw : 0;
        updateCharacter(slot.object, { delta: dt, time: now, speed: Math.hypot(state.vx || 0, state.vz || 0), grounded: state.grounded !== false });
        updateGhost(slot, .84, 0, 0);
        slot.flash.visible = animate && (Math.max(0, getPower('sniper').duration - state.remaining + slot.age) % .7 < .04);
      } else if (slot.life > 0 && slot.object) {
        slot.life = Math.max(0, slot.life - dt); slot.object.visible = slot.life > 0;
        const dissolve = 1 - slot.life / slot.duration;
        updateGhost(slot, .84 * (1 - dissolve * .6), dissolve, dissolve);
        slot.flash.visible = false;
      }
    }
    for (const slot of shields) if (slot.state) {
      slot.hit = Math.max(0, slot.hit - dt);
      placeShield(slot, slot.state.id === localId && localPlayer ? localPlayer : slot.state);
    }
    if (localPlayer?.id && localPlayer.classId === 'heavy' && localPlayer.abilityTime > 0 && localPlayer.shieldHealth > 0
      && !shields.some((slot) => slot.state?.id === localPlayer.id)) {
      const slot = shields.find((item) => !item.state);
      if (slot) { slot.state = localPlayer; slot.object.name = `shield:${localPlayer.id}`; slot.hit = 0; placeShield(slot, localPlayer); }
    }
    for (const slot of trails) if (slot.life > 0) {
      slot.life = Math.max(0, slot.life - dt); slot.age += dt; slot.object.visible = slot.life > 0;
      const source = localPlayer?.id === slot.owner ? localPlayer : playerStates.get(slot.owner);
      if (finitePosition(source)) slot.object.position.lerp(point.set(source.x, source.y + .8, source.z), blend);
      if (slot.snapshots < (quality === 'low' || !animate ? 1 : 2) && slot.age >= .045) snapshot(slot, source || slot.source);
      slot.paint.uniforms.uOpacity.value = .75 * slot.life / slot.duration;
      slot.lower.visible = quality !== 'low';
    }
    for (let i = 0; i < afterimages.length; i++) {
      const slot = afterimages[i];
      if (slot.life <= 0 || !slot.object) continue;
      slot.life = Math.max(0, slot.life - dt);
      slot.object.visible = slot.life > 0 && i < (quality === 'low' ? 2 : 4);
      const fade = slot.life / slot.duration;
      updateGhost(slot, .68 * fade, (1 - fade) * .35, 0);
    }
    for (const slot of bursts) if (slot.life > 0) {
      slot.life = Math.max(0, slot.life - dt); slot.age += dt; slot.object.visible = slot.life > 0;
      const progress = 1 - slot.life / slot.duration, fade = 1 - progress;
      slot.wave.material.uniforms.uProgress.value = animate ? progress : .65;
      slot.wave.material.uniforms.uOpacity.value = .92 * Math.pow(fade, .65);
      slot.marks.material.opacity = Math.max(0, 1 - progress * 2);
      slot.marks.scale.setScalar(animate ? .75 + progress : .9);
      if (camera) slot.marks.quaternion.copy(camera.quaternion);
      slot.sparks.visible = animate; slot.sparks.count = quality === 'low' ? 6 : 12;
      slot.sparks.material.opacity = fade;
      for (let i = 0; i < slot.sparks.count; i++) {
        const angle = i * 2.39996, radius = .15 + slot.age * (1.6 + (i % 3) * .45);
        dummy.position.set(Math.cos(angle) * radius, .1 + slot.age * (3.1 + (i % 4) * .4) - slot.age * slot.age * 4, Math.sin(angle) * radius);
        if (camera) dummy.quaternion.copy(camera.quaternion); else dummy.rotation.set(0, angle, 0);
        dummy.rotateZ(angle); dummy.scale.set(.35, .6 * fade, .35); dummy.updateMatrix(); slot.sparks.setMatrixAt(i, dummy.matrix);
      }
      slot.sparks.instanceMatrix.needsUpdate = true;
    }
    for (const slot of shards) if (slot.life > 0) {
      slot.life = Math.max(0, slot.life - dt); slot.age += dt; slot.object.visible = slot.life > 0;
      const fade = slot.life / slot.duration;
      slot.pieces.visible = animate; slot.pieces.count = quality === 'low' ? 6 : 12;
      slot.pieces.material.opacity = fade * .85;
      slot.flash.material.opacity = Math.max(0, fade * 2 - 1);
      slot.flash.scale.setScalar(.8 + (1 - fade) * .4);
      for (let i = 0; i < slot.pieces.count; i++) {
        const x = (i % 3 - 1) * .42, y = (Math.floor(i / 3) - 1.5) * .35;
        dummy.position.set(x * (1 + slot.age * 2), y + slot.age * (i % 3 - 1) - slot.age * slot.age * 2, -slot.age * (1 + (i % 4) * .5));
        dummy.rotation.set(slot.age * (i % 3 + 2), slot.age * (i % 4 + 1), i * 1.8);
        dummy.scale.setScalar((slot.glitch ? .55 : 1.25) * fade); dummy.updateMatrix(); slot.pieces.setMatrixAt(i, dummy.matrix);
      }
      slot.pieces.instanceMatrix.needsUpdate = true;
    }
  }

  function clear() {
    clearBlastAim();
    for (const slots of [pucks, shields, echoes, afterimages, bursts, trails, shards]) for (const slot of slots) {
      slot.state = null; slot.life = 0; slot.hit = 0;
      if (slot.object) slot.object.visible = false;
    }
    seenEvents.clear(); playerStates.clear();
  }

  function cancelActivation({ owner, life, abilitySeq }) {
    const key = `${owner}:${life}:${abilitySeq}:activate`;
    seenEvents.delete(key);
    for (const slots of [trails, afterimages]) for (const slot of slots) if (slot.activationKey === key) {
      slot.life = 0;
      if (slot.object) slot.object.visible = false;
    }
  }

  return { sync, event, update, clear, cancelActivation, setBlastAim, dispose() {
    if (disposed) return;
    disposed = true; clear();
    for (const slot of [...echoes, ...afterimages]) if (slot.object) {
      slot.flash?.removeFromParent(); disposeModel(slot.object);
    }
    for (const mesh of instanceMeshes) mesh.dispose();
    for (const resource of resources) resource.dispose();
    root.removeFromParent();
  } };
}
