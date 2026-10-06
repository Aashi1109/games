import * as THREE from 'three';

export const WEAPON_MODELS = {
  assault: { name: 'AR-01', character: 'Ember', type: 'Assault rifle', accent: '#dc782f' },
  sniper: { name: 'SR-02', character: 'Wisp', type: 'Sniper rifle', accent: '#6487a4' },
  scout: { name: 'SMG-03', character: 'Dash', type: 'Submachine gun', accent: '#46a49f' },
  heavy: { name: 'LMG-04', character: 'Rook', type: 'Light machine gun', accent: '#899363' },
};

const COLORS = {
  body: '#35373a',
  edge: '#46494c',
  steel: '#55595d',
  dark: '#202225',
  rubber: '#292b2d',
  bore: '#111517',
  olive: '#5e6250',
  oliveLight: '#70745c',
  lens: '#334c59',
};

// Every factory call owns its geometry and material. Parts are baked into a
// single vertex-colored mesh, so the model uses one draw call and no textures.
function makeBuilder() {
  const positions = [];
  const normals = [];
  const colors = [];

  function add(geometry, color) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = flat.getAttribute('position');
    const normal = flat.getAttribute('normal');
    const tint = new THREE.Color(color);
    for (let i = 0; i < position.count; i += 1) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      colors.push(tint.r, tint.g, tint.b);
    }
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
  }

  function box(size, position, color, rotation = 0) {
    const geometry = new THREE.BoxGeometry(...size);
    geometry.rotateX(rotation);
    geometry.translate(...position);
    add(geometry, color);
  }

  // Outline points are [z, y]. One bevel ring catches light without textures.
  function profile(outline, width, color, bevel = 0.004) {
    const shape = new THREE.Shape();
    outline.forEach(([z, y], i) => {
      if (i === 0) shape.moveTo(-z, y);
      else shape.lineTo(-z, y);
    });
    shape.closePath();
    const depth = width - bevel * 2;
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: bevel > 0, bevelSegments: 1,
      bevelSize: bevel, bevelThickness: bevel, steps: 1, curveSegments: 1,
    });
    geometry.translate(0, 0, -depth / 2);
    geometry.rotateY(Math.PI / 2);
    add(geometry, color);
  }

  function tube(radius, length, y, z, color, radiusRear = radius) {
    const geometry = new THREE.CylinderGeometry(radius, radiusRear, length, 8, 1);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, y, z);
    add(geometry, color);
  }

  function muzzle(radius, length, y, z) {
    // A recessed bore and an actual eight-sided annular front, rather than a
    // black decal on a closed cylinder. z is the front edge of the muzzle.
    const inner = radius * 0.48;
    const front = [];
    const innerWall = [];
    const outerWall = [];
    const backZ = z + length;
    const boreZ = z + Math.min(length * 0.6, 0.024);
    const triangle = (target, a, b, c) => target.push(...a, ...b, ...c);
    for (let i = 0; i < 8; i += 1) {
      const a = ((i + 0.5) / 8) * Math.PI * 2;
      const b = ((i + 1.5) / 8) * Math.PI * 2;
      const point = (angle, r, depth) => [Math.cos(angle) * r, y + Math.sin(angle) * r, depth];
      const o1 = point(a, radius, z);
      const o2 = point(b, radius, z);
      const i1 = point(a, inner, z);
      const i2 = point(b, inner, z);
      triangle(front, o1, i1, o2);
      triangle(front, o2, i1, i2);
      const rear1 = point(a, radius, backZ);
      const rear2 = point(b, radius, backZ);
      triangle(outerWall, o1, o2, rear1);
      triangle(outerWall, o2, rear2, rear1);
      const rearInner1 = point(a, inner, backZ);
      const rearInner2 = point(b, inner, backZ);
      triangle(outerWall, rear1, rear2, rearInner1);
      triangle(outerWall, rear2, rearInner2, rearInner1);
      const deep1 = point(a, inner, boreZ);
      const deep2 = point(b, inner, boreZ);
      triangle(innerWall, i1, deep1, i2);
      triangle(innerWall, i2, deep1, deep2);
      triangle(innerWall, deep1, [0, y, boreZ], deep2);
    }
    for (const [vertices, color] of [[front, COLORS.steel], [outerWall, COLORS.body], [innerWall, COLORS.bore]]) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.computeVertexNormals();
      add(geometry, color);
    }
  }

  function finish() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  return { box, profile, tube, muzzle, finish };
}

function grip(builder, z = 0.09, color = COLORS.rubber) {
  builder.profile([
    [z + 0.032, -0.045], [z - 0.024, -0.06], [z + 0.025, -0.207],
    [z + 0.071, -0.194], [z + 0.078, -0.173],
  ], 0.047, color, 0.005);
  // Open trigger guard, with space between the trigger and the pistol grip.
  builder.box([0.026, 0.012, 0.08], [0, -0.118, z - 0.021], COLORS.dark);
  builder.box([0.026, 0.061, 0.012], [0, -0.09, z - 0.055], COLORS.dark);
  builder.box([0.01, 0.038, 0.009], [0, -0.08, z - 0.019], COLORS.steel, 0.2);
}

function sight(builder, z, y = 0.094) {
  builder.box([0.047, 0.012, 0.042], [0, y - 0.02, z], COLORS.dark);
  builder.box([0.009, 0.029, 0.016], [-0.015, y, z], COLORS.body);
  builder.box([0.009, 0.029, 0.016], [0.015, y, z], COLORS.body);
  builder.box([0.009, 0.015, 0.012], [0, y - 0.006, z], COLORS.steel);
}

function ejectionPort(builder, z, halfWidth, accent) {
  for (const side of [-1, 1]) {
    builder.box([0.003, 0.02, 0.105], [side * halfWidth, 0.022, z], COLORS.dark);
    builder.box([0.004, 0.016, 0.041], [side * (halfWidth + 0.002), 0.022, z + 0.035], accent);
  }
}

function vents(builder, positions, x, y, height = 0.016) {
  for (const side of [-1, 1]) {
    for (const z of positions) {
      builder.box([0.002, height, 0.04], [side * x, y, z], COLORS.dark);
    }
  }
}

function assault(builder, accent) {
  builder.profile([[0.367, 0.061], [0.18, 0.039], [0.18, -0.026], [0.365, -0.094]], 0.065, COLORS.body);
  builder.box([0.072, 0.164, 0.014], [0, -0.017, 0.375], COLORS.rubber);
  builder.tube(0.033, 0.047, 0.006, 0.164, COLORS.dark);
  builder.profile([[0.149, 0.053], [0.127, 0.065], [-0.116, 0.058], [-0.154, 0.029], [-0.146, -0.077], [-0.05, -0.081], [0.147, -0.045]], 0.077, COLORS.body);
  builder.profile([[-0.133, -0.015], [-0.052, -0.026], [-0.073, -0.178], [-0.109, -0.26], [-0.183, -0.24], [-0.143, -0.156]], 0.052, COLORS.edge);
  builder.box([0.056, 0.012, 0.084], [0, -0.253, -0.145], COLORS.dark, -0.24);
  grip(builder);
  builder.profile([[-0.176, 0.046], [-0.428, 0.041], [-0.445, 0.014], [-0.427, -0.058], [-0.181, -0.058], [-0.163, -0.019]], 0.079, COLORS.edge);
  builder.tube(0.043, 0.021, -0.003, -0.169, COLORS.dark);
  builder.tube(0.042, 0.019, -0.003, -0.442, COLORS.dark);
  builder.box([0.04, 0.012, 0.49], [0, 0.067, -0.177], COLORS.dark);
  builder.box([0.044, 0.009, 0.218], [0, -0.066, -0.309], COLORS.dark);
  builder.tube(0.015, 0.122, -0.003, -0.508, COLORS.steel);
  builder.muzzle(0.025, 0.064, -0.003, -0.625);
  ejectionPort(builder, -0.008, 0.039, accent);
  vents(builder, [-0.221, -0.294, -0.369], 0.04, 0.008);
  sight(builder, 0.08);
  sight(builder, -0.4, 0.096);
  return { muzzle: [0, -0.003, -0.625], sight: [0, 0.097, 0.08], support: [0, -0.059, -0.27] };
}

function sniper(builder, accent) {
  builder.profile([[0.46, 0.06], [0.288, 0.025], [0.234, -0.023], [0.262, -0.057], [0.452, -0.096]], 0.058, COLORS.body);
  builder.box([0.065, 0.165, 0.014], [0, -0.019, 0.47], COLORS.rubber);
  builder.profile([[0.269, 0.022], [0.172, 0.048], [0.104, 0.041], [0.103, -0.014], [0.158, -0.054], [0.19, -0.135], [0.231, -0.128], [0.263, -0.056]], 0.054, COLORS.olive);
  builder.profile([[0.169, 0.047], [-0.391, 0.028], [-0.434, -0.006], [-0.412, -0.048], [-0.145, -0.035], [0.15, -0.038]], 0.07, COLORS.oliveLight);
  builder.box([0.046, 0.065, 0.105], [0, -0.065, -0.013], COLORS.body);
  builder.box([0.027, 0.012, 0.067], [0, -0.092, 0.103], COLORS.dark);
  builder.box([0.027, 0.059, 0.011], [0, -0.068, 0.069], COLORS.dark);
  builder.box([0.01, 0.038, 0.009], [0, -0.063, 0.113], COLORS.steel, 0.25);
  builder.tube(0.027, 0.32, 0.054, -0.047, COLORS.body);
  builder.tube(0.014, 0.513, 0.018, -0.671, COLORS.steel);
  builder.muzzle(0.024, 0.075, 0.018, -0.984);
  builder.box([0.04, 0.014, 0.338], [0, 0.085, -0.067], COLORS.dark);
  for (const z of [0.057, -0.135]) {
    builder.box([0.042, 0.057, 0.036], [0, 0.117, z], COLORS.dark);
    builder.tube(0.039, 0.024, 0.149, z, COLORS.dark);
  }
  builder.tube(0.028, 0.262, 0.15, -0.045, COLORS.steel);
  builder.tube(0.04, 0.064, 0.15, 0.12, COLORS.body);
  builder.tube(0.043, 0.08, 0.15, -0.218, COLORS.edge, 0.03);
  builder.tube(0.031, 0.003, 0.15, -0.259, COLORS.lens);
  builder.box([0.031, 0.021, 0.027], [0, 0.189, -0.014], COLORS.dark);
  ejectionPort(builder, 0.064, 0.036, accent);
  return { muzzle: [0, 0.018, -0.984], sight: [0, 0.15, 0.154], support: [0, -0.04, -0.17] };
}

function scout(builder, accent) {
  // Three separate rails leave a real triangular opening in the folding stock.
  builder.profile([[0.291, 0.048], [0.126, 0.026], [0.126, -0.001], [0.29, 0.014]], 0.045, COLORS.edge, 0.002);
  builder.profile([[0.294, 0.018], [0.274, 0.017], [0.274, -0.088], [0.294, -0.099]], 0.047, COLORS.rubber, 0.002);
  builder.profile([[0.285, -0.102], [0.121, -0.011], [0.141, 0.004], [0.285, -0.073]], 0.033, COLORS.body, 0.002);
  builder.tube(0.029, 0.039, 0.009, 0.122, COLORS.dark);
  builder.profile([[0.1, 0.05], [-0.103, 0.049], [-0.126, 0.019], [-0.126, -0.065], [-0.013, -0.068], [0.101, -0.043]], 0.065, COLORS.body);
  grip(builder, 0.064);
  builder.profile([[-0.084, -0.046], [-0.029, -0.046], [-0.066, -0.255], [-0.117, -0.246]], 0.036, COLORS.edge, 0.003);
  builder.box([0.043, 0.01, 0.06], [0, -0.255, -0.092], COLORS.dark, -0.16);
  builder.profile([[-0.137, 0.036], [-0.27, 0.029], [-0.29, 0.008], [-0.276, -0.049], [-0.14, -0.05]], 0.071, COLORS.edge);
  builder.tube(0.036, 0.018, -0.007, -0.292, COLORS.dark);
  builder.tube(0.017, 0.027, -0.007, -0.31, COLORS.steel);
  builder.muzzle(0.022, 0.044, -0.007, -0.365);
  builder.box([0.036, 0.01, 0.344], [0, 0.059, -0.098], COLORS.dark);
  ejectionPort(builder, -0.025, 0.033, accent);
  for (const side of [-1, 1]) {
    builder.box([0.005, 0.018, 0.011], [side * 0.035, 0.022, 0.038], '#d4a740');
  }
  vents(builder, [-0.177, -0.241], 0.036, -0.003, 0.013);
  sight(builder, 0.044, 0.086);
  sight(builder, -0.249, 0.087);
  return { muzzle: [0, -0.007, -0.365], sight: [0, 0.089, 0.044], support: [0, -0.05, -0.19] };
}

function heavy(builder, accent) {
  builder.profile([[0.389, 0.058], [0.19, 0.03], [0.19, -0.034], [0.382, -0.103]], 0.077, COLORS.olive);
  builder.box([0.081, 0.173, 0.016], [0, -0.022, 0.397], COLORS.rubber);
  builder.tube(0.041, 0.06, -0.002, 0.168, COLORS.dark);
  builder.profile([[0.133, 0.059], [-0.211, 0.049], [-0.236, 0.024], [-0.226, -0.077], [-0.098, -0.084], [0.134, -0.049]], 0.096, COLORS.body);
  grip(builder, 0.096);
  builder.profile([[-0.163, -0.05], [-0.043, -0.055], [-0.037, -0.243], [-0.162, -0.237]], 0.127, COLORS.olive, 0.006);
  builder.box([0.134, 0.018, 0.136], [0, -0.06, -0.102], COLORS.oliveLight);
  builder.profile([[-0.255, 0.039], [-0.494, 0.028], [-0.508, -0.009], [-0.494, -0.071], [-0.262, -0.068]], 0.094, COLORS.olive);
  builder.tube(0.047, 0.02, -0.014, -0.509, COLORS.dark);
  builder.box([0.047, 0.011, 0.601], [0, 0.068, -0.196], COLORS.dark);
  builder.box([0.058, 0.011, 0.211], [0, -0.078, -0.374], COLORS.dark);
  builder.tube(0.021, 0.13, -0.014, -0.577, COLORS.steel);
  builder.muzzle(0.03, 0.084, -0.014, -0.719);
  // Open carry handle: only the posts and top rail are solid.
  builder.profile([[0.03, 0.07], [0.011, 0.07], [0.011, 0.141], [0.023, 0.151], [0.039, 0.138]], 0.036, COLORS.dark, 0.002);
  builder.profile([[-0.161, 0.07], [-0.181, 0.07], [-0.189, 0.138], [-0.169, 0.152], [-0.161, 0.137]], 0.036, COLORS.dark, 0.002);
  builder.box([0.036, 0.021, 0.2], [0, 0.148, -0.075], COLORS.edge);
  ejectionPort(builder, 0.016, 0.049, accent);
  vents(builder, [-0.31, -0.388, -0.461], 0.048, -0.008, 0.018);
  sight(builder, 0.087, 0.096);
  sight(builder, -0.479, 0.098);
  return { muzzle: [0, -0.014, -0.719], sight: [0, 0.099, 0.087], support: [0, -0.08, -0.33] };
}

const BUILDERS = { assault, sniper, scout, heavy };

export function createWeaponModel(classId = 'assault') {
  const selected = Object.hasOwn(WEAPON_MODELS, classId) ? classId : 'assault';
  const metadata = WEAPON_MODELS[selected];
  const builder = makeBuilder();
  const anchors = BUILDERS[selected](builder, metadata.accent);
  const group = new THREE.Group();
  group.name = `${metadata.name.toLowerCase()}-weapon`;
  const mesh = new THREE.Mesh(builder.finish(), new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.88, metalness: 0.12,
  }));
  mesh.name = 'weapon-body';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  const markers = {
    muzzle: anchors.muzzle,
    'primary-sight': anchors.sight,
    grip: selected === 'sniper' ? [0, -0.097, 0.211] : selected === 'scout' ? [0, -0.11, 0.088] : [0, -0.15, 0.12],
    'support-grip': anchors.support,
  };
  for (const [name, position] of Object.entries(markers)) {
    const marker = new THREE.Object3D();
    marker.name = name;
    marker.position.set(...position);
    group.add(marker);
  }
  group.userData = {
    classId: selected,
    weaponId: metadata.name,
    muzzle: { x: anchors.muzzle[0], y: anchors.muzzle[1], z: anchors.muzzle[2] },
    sight: { x: anchors.sight[0], y: anchors.sight[1], z: anchors.sight[2] },
  };
  return group;
}
