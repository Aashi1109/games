import { box, perimeter, stairs, building, rope, pad } from './helpers.js';

export function vertex() {
  const boxes = perimeter(100, 'hull');
  const details = [];

  // Octagonal ring deck, approximated from axis-aligned straight and corner
  // segments the same way the other maps build round structures from boxes.
  const ringY = 4.2, ringH = 0.4, radius = 22, band = 7;
  const straight = radius * 0.53;
  const segment = (radius - straight) / 3;
  for (const side of [-1, 1]) {
    boxes.push(box(side * (radius - band / 2), ringY, 0, band, ringH, straight * 2, 'deck'));
    for (const edge of [-1, 1]) {
      boxes.push(box(edge * (straight + 2.4) / 2, ringY, side * (radius - band / 2), straight - 2.4, ringH, band, 'deck'));
    }
    for (const corner of [-1, 1]) for (let step = 0; step < 3; step++) {
      boxes.push(box(
        corner * (straight + (step + 0.5) * segment), ringY,
        side * (radius - (step + 0.5) * segment),
        segment + 0.35, ringH, band, 'deck',
      ));
    }
    // Glowing edge trim along the two straight E/W/N/S faces only.
    boxes.push(box(side * (radius - band / 2), ringY - 0.12, 0, band + 0.3, 0.12, straight * 2 + 0.3, 'glow'));
    boxes.push(box(0, ringY - 0.12, side * (radius - band / 2), straight * 2 + 0.3, 0.12, band + 0.3, 'glow'));
  }

  // Central reactor core: a landing deck plus a glowing shaft rising above it.
  const coreHalf = 6;
  boxes.push(
    box(0, ringY, 0, coreHalf * 2, ringH, coreHalf * 2, 'core', { label: '01 / REACTOR CORE' }),
    box(0, ringY + ringH, 0, 2.4, 16, 2.4, 'glow'),
  );

  // Four glass skybridges span the gap between the ring and the core.
  const span = (radius - band / 2) - coreHalf;
  const mid = coreHalf + span / 2;
  boxes.push(
    box(0, ringY, -mid, 3, ringH, span, 'glass'), box(0, ringY, mid, 3, ringH, span, 'glass'),
    box(mid, ringY, 0, span, ringH, 3, 'glass'), box(-mid, ringY, 0, span, ringH, 3, 'glass'),
  );

  // Ground-level foot access: two stairs climb from outside the ring onto its
  // north and south straight sections; the east/west faces carry two-floor
  // outposts (foot access via their own stairs), so every route up still has
  // at least one way on foot.
  stairs(boxes, 0, -34, ringY + ringH, 1, 0, 4);
  stairs(boxes, 0, 34, ringY + ringH, -1, 0, 4);

  // East/west outposts: two stacked floors of cover on the ring's pad/rope
  // faces, Apex-style building() reused twice so the first roof becomes the
  // second floor. Each floor's exterior stair tower lands past the ring
  // deck's own edge (the deck 'band' is too narrow to reach it, and routing
  // stairs through the doorway instead clips the door header once the climb
  // gets tall enough), so each gets its own support slab underfoot. The two
  // flights sit at different stair-tower offsets so the lower flight's
  // climbing headroom never runs into the upper flight's floor slab.
  const outpostBase = ringY + ringH, outpostH = 3.6;
  for (const [side, z] of [[1, -6], [-1, 6]]) {
    const x = side * (radius - band / 2);
    const label = side > 0 ? '04 / EAST OUTPOST' : '05 / WEST OUTPOST';
    boxes.push(box(x + side * 4.5, outpostBase - ringH, z + 1, 5, ringH, 12, 'deck'));
    building(boxes, x, z, 6, 9, outpostH, { base: outpostBase, side, style: 'deck', label });
    boxes.push(box(x + side * 8.5, outpostBase + outpostH - ringH, z + 1, 5, ringH, 12, 'deck'));
    building(boxes, x, z, 6, 9, outpostH - 0.4, { base: outpostBase + outpostH, side, style: 'deck', stairOffset: 8.5, label });
  }

  // Scattered low cover on the ground tier beneath the ring.
  boxes.push(
    box(-30, 0, -8, 5, 1.6, 5, 'cover'), box(30, 0, 8, 5, 1.6, 5, 'cover'),
    box(8, 0, -30, 5, 1.6, 5, 'cover'), box(-8, 0, 30, 5, 1.6, 5, 'cover'),
  );

  details.push(
    { kind: 'dish', x: 0, y: ringY + ringH, z: -(radius - band / 2), radius: 2.6, yaw: Math.PI },
    { kind: 'dish', x: radius - band / 2, y: ringY + ringH, z: 0, radius: 2.6, yaw: -Math.PI / 2 },
  );

  return {
    id: 'vertex', name: 'Vertex', subtitle: 'ORBITAL RELAY / REACTOR RING',
    description: 'Fight across glass skybridges around a glowing reactor core, drop to the ground tier for cover, or launch straight back up.',
    size: 100, boxes, details,
    spawns: [
      { x: 0, y: 0, z: 44, yaw: Math.PI }, { x: 0, y: 0, z: -44, yaw: 0 },
      { x: 44, y: 0, z: 0, yaw: -Math.PI / 2 }, { x: -44, y: 0, z: 0, yaw: Math.PI / 2 },
      { x: 32, y: 0, z: 32, yaw: -2.35 }, { x: -32, y: 0, z: -32, yaw: 0.8 },
    ],
    pads: [pad(0, -42, 0, 9, 19), pad(38, 0, -9, 0, 19), pad(-38, 0, 9, 0, 19)],
    targets: [
      { id: 'vertex-core', x: 0, y: ringY + ringH, z: 0 },
      { id: 'vertex-ring-n', x: 0, y: ringY + ringH, z: -(radius - band / 2) },
      { id: 'vertex-ring-s', x: 0, y: ringY + ringH, z: radius - band / 2 },
    ],
    zones: [
      { id: 'zone-a', x: 0, z: 0, radius: 6 },
      { id: 'zone-b', x: 0, z: -(radius - band / 2), radius: 6 },
      { id: 'zone-c', x: 0, z: radius - band / 2, radius: 6 },
    ],
    ropes: [
      rope('vertex-ascender', -44, 0, -44, -(radius + band / 2), ringY + ringH, -(radius - band / 2) + 2, 9),
      rope('vertex-descender', radius + band / 2, ringY + ringH, radius - band / 2 - 2, 44, 0, 44, 9),
    ],
    theme: {
      sky: '#aec4e8', fog: '#c3d6ef', ground: '#8e9fc4', hemisphere: '#dce6fb', ambientGround: '#6b7aa3', sun: '#eef3ff',
      palette: { floor: '#9aacc9', hull: '#b7c3de', wall: '#b7c3de', deck: '#c7d2e8', core: '#aebde0', glass: '#bdeefa', glow: '#8be9ff', step: '#cdd8ec', bridge: '#c7d2e8', cover: '#9fb0d1' },
    },
    preview: { position: { x: 58, y: 48, z: 58 }, target: { x: 0, y: 5, z: 0 } },
  };
}
