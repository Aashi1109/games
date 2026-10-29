import type { ArenaMap, MapDetail } from '../types.ts';
import { box, perimeter, stairs, rope, pad } from './helpers.ts';

export function skyGarden(): ArenaMap {
  const boxes = perimeter(96, 'facade');
  for (const wall of boxes.slice(1)) wall.h = 1.4;
  const details: MapDetail[] = [];

  function tree(x: number, y: number, z: number, height = 4.2, radius = 2.5) {
    boxes.push(box(x, y, z, 0.55, height - 0.9, 0.55, 'trunk'));
    details.push({ kind: 'tree', x, y, z, height, radius });
  }
  function plantedBed(
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    height = 0.64,
  ) {
    boxes.push(box(x, y, z, w, height, d, 'planter'));
    boxes.push(box(x, y + height, z, w - 0.35, 0.12, d - 0.35, 'garden'));
  }

  // Open-ended octagonal seating rings descend into a small performance court.
  // The north/south gaps are ground-level entrances, while clipped corners make
  // sideways mantle routes through the white stone and planted seating tiers.
  const court = { x: -4, z: 8 };
  for (const [radius, height] of [
    [14, 1.28],
    [10.8, 0.96],
    [7.6, 0.64],
  ]) {
    const band = 2.5;
    const straight = radius * 0.53;
    const segment = (radius - straight) / 3;
    for (const side of [-1, 1]) {
      boxes.push(
        box(
          court.x + side * (radius - band / 2),
          0,
          court.z,
          band,
          height,
          straight * 2,
          'stone',
        ),
      );
      // Split front and rear seating to leave a generous passage to the court.
      for (const edge of [-1, 1]) {
        boxes.push(
          box(
            court.x + (edge * (straight + 2.4)) / 2,
            0,
            court.z + side * (radius - band / 2),
            straight - 2.4,
            height,
            band,
            'stone',
          ),
        );
      }
      for (const corner of [-1, 1])
        for (let step = 0; step < 3; step++) {
          boxes.push(
            box(
              court.x + corner * (straight + (step + 0.5) * segment),
              0,
              court.z + side * (radius - (step + 0.5) * segment),
              segment + 0.35,
              height,
              band,
              step === 1 && height > 1 ? 'garden' : 'stone',
            ),
          );
        }
    }
  }
  boxes.push(
    box(-4, 0, 8, 12, 0.32, 6.5, 'court'),
    box(-4, 0, 3.75, 8, 0.32, 2, 'court'),
    box(-4, 0, 12.25, 8, 0.32, 2, 'court'),
    box(-4, 0, 1.95, 4.5, 0.32, 1.6, 'court'),
    box(-4, 0, 14.05, 4.5, 0.32, 1.6, 'court'),
  );

  // A long gallery floats above a covered west-side passage. Its offset stair
  // and landing join the roof from the side, keeping full standing headroom.
  boxes.push(
    box(-25, 6.08, 3, 12, 0.32, 30, 'roof', { label: '01 / PALM GALLERY' }),
    box(-30.4, 0, 3, 0.45, 6.08, 30, 'facade'),
    box(-25, 0, -11.5, 11, 2.4, 0.45, 'facade'),
    box(-25, 0, 17.5, 11, 2.4, 0.45, 'facade'),
    box(-31.5, 6.08, 10.2, 6, 0.32, 3.2, 'bridge'),
  );
  for (const z of [-10, -3, 5, 13]) {
    boxes.push(box(-19.7, 0, z, 0.55, 6.08, 0.55, 'facade'));
    boxes.push(box(-24.7, 0, z, 0.4, 2.8, 0.4, 'metal'));
  }
  stairs(boxes, -34, 23, 6.4);
  plantedBed(-27, 6.4, 12, 5, 5);
  tree(-27, 7.16, 12, 4.3, 2.7);
  plantedBed(-27, 6.4, -8.5, 5, 3);
  tree(-27, 7.16, -8.5, 3.4, 2.1);
  plantedBed(-21.2, 0, 10, 2.2, 5);

  // The conservatory is a tall ribbed pavilion, open between real structural
  // posts. The raised botanical floor, beam crown, and broken clerestory make a
  // landmark with a walk-under lower level rather than another sealed cuboid.
  boxes.push(
    box(7, 2.88, -24, 30, 0.32, 18, 'stone', {
      label: '02 / CLOUD CONSERVATORY',
    }),
    box(-10.2, 2.88, -16, 7.6, 0.32, 3, 'bridge'),
    box(7, 10.5, -24, 31, 0.3, 1, 'metal'),
    box(7, 12.1, -24, 22, 0.3, 0.6, 'facade'),
  );
  for (const x of [-8, 0, 8, 16, 22]) {
    for (const z of [-32.5, -15.5])
      boxes.push(box(x, 0, z, 0.5, 10.5, 0.5, 'facade'));
    boxes.push(box(x, 10.5, -24, 0.55, 0.3, 18, 'facade'));
    if (x > -8 && x < 22) {
      boxes.push(box(x, 10.8, -27, 0.45, 1.3, 0.45, 'metal'));
      boxes.push(box(x, 10.8, -21, 0.45, 1.3, 0.45, 'metal'));
      boxes.push(box(x, 12.1, -24, 0.5, 0.3, 6.5, 'facade'));
    }
  }
  for (const [x, z] of [
    [-4, -29],
    [13, -18.5],
    [2, -20],
  ]) {
    plantedBed(x, 3.2, z, 4, 3.2);
    tree(x, 3.96, z, 4.2, 2.6);
  }
  stairs(boxes, -12, -9, 3.2);

  // Two stacked east gardens create three routes: beneath the terrace, over its
  // planted lower deck, and across an offset upper station into a long skywalk.
  boxes.push(
    box(27, 2.88, 14, 20, 0.32, 28, 'stone', { label: '03 / TERRACE GARDENS' }),
    box(35, 2.88, 25, 6, 0.32, 14, 'stone'),
    box(39, 2.88, 30, 6, 0.32, 3.2, 'bridge'),
    box(28, 6.08, 23, 12, 0.32, 8, 'roof', { label: '04 / CANOPY WALK' }),
    box(35, 6.08, 19, 4, 0.32, 2.4, 'bridge'),
    box(28, 6.08, -26, 12, 0.32, 10, 'roof'),
    box(28, 6.08, -2, 3.6, 0.32, 44, 'bridge'),
    box(21, 6.08, -28, 6, 0.32, 3.2, 'bridge'),
  );
  for (const [x, z] of [
    [18, 1],
    [35, 2],
    [18, 26],
    [36, 29],
  ])
    boxes.push(box(x, 0, z, 0.65, 2.88, 0.65, 'facade'));
  for (const [x, z] of [
    [23, 20],
    [33, 26],
    [23, -30],
    [33, -22],
    [28, -8],
    [28, 8],
  ]) {
    boxes.push(box(x, 0, z, 0.65, 6.08, 0.65, 'facade'));
  }
  stairs(boxes, 40, 37, 3.2);
  stairs(boxes, 35, 12, 3.2, 1, 3.2);
  stairs(boxes, 18, -21, 3.2, -1, 3.2);
  for (const [x, z] of [
    [21, 7],
    [31, 8],
    [22, 25],
  ]) {
    plantedBed(x, 3.2, z, 4, 3.5);
    tree(x, 3.96, z, 4, 2.5);
  }
  plantedBed(31.5, 6.4, -28.5, 3.2, 3);
  tree(31.5, 7.16, -28.5, 4.1, 2.5);

  // Ground-level garden islands and broken walls interrupt long sight lines
  // without closing the two broad entrances to the central bowl.
  for (const [x, z] of [
    [-37, -24],
    [-27, 31],
    [16, 35],
    [5, -39],
  ]) {
    plantedBed(x, 0, z, 5, 4);
    tree(x, 0.76, z, 4.6, 2.8);
  }
  boxes.push(
    box(-17, 0, -26, 4, 0.64, 8, 'stone'),
    box(-19, 0.64, -29, 3, 0.64, 3, 'garden'),
    box(-24, 0, -29, 3, 1.2, 2, 'cover'),
    box(11, 0, 29, 4, 0.64, 7, 'stone'),
    box(13, 0.64, 31, 3, 0.64, 3, 'garden'),
    box(-14, 0, 30, 3, 1.1, 1, 'facade'),
    box(9, 0, -8, 5, 1.2, 1, 'facade'),
    box(11, 0, -6, 1, 1.2, 5, 'facade'),
  );

  return {
    id: 'sky-garden',
    name: 'Sky Garden',
    subtitle: 'BOTANICAL CITY / CLOUD CONSERVATORY',
    description:
      'Drop into the octagonal amphitheatre, weave through the open conservatory, and chain gallery rooftops with the floating garden skywalk.',
    size: 96,
    boxes,
    details,
    spawns: [
      { x: -4, y: 0, z: 38, yaw: 0 },
      { x: -39, y: 0, z: -36, yaw: -2.35 },
      { x: 39, y: 0, z: 39, yaw: 0.8 },
      { x: 39, y: 0, z: -38, yaw: 2.35 },
      { x: -39, y: 0, z: 36, yaw: -0.8 },
      { x: 5, y: 2.88 + 0.32, z: -27, yaw: Math.PI },
    ],
    pads: [
      pad(-12, 32, 4, -10, 18),
      pad(38, -3, -9, -4, 19),
      pad(-39, 4, 10, -1, 18),
    ],
    targets: [
      { id: 'garden-a', x: -23, y: 6.4, z: 12 },
      { id: 'garden-b', x: 27, y: 6.4, z: 25 },
      { id: 'garden-c', x: -4, y: 0.32, z: 7 },
    ],
    zones: [
      { id: 'zone-a', x: -23, z: 12, radius: 6 },
      { id: 'zone-b', x: 27, z: 25, radius: 6 },
      { id: 'zone-c', x: -4, z: 7, radius: 6 },
    ],
    ropes: [
      rope('garden-court-crossing', -25, 6.4, 0, 28, 6.4, 23, 13),
      rope('garden-conservatory', -24, 6.4, -4, 28, 6.4, -26),
      rope('garden-skywalk', 28, 6.4, -26, 28, 6.4, 23),
      rope('garden-ascender', -31.4, 0, 2, -31.4, 6.4, 2, 7),
    ],
    theme: {
      sky: '#b6dce9',
      fog: '#c6e5ed',
      ground: '#95b5ae',
      hemisphere: '#e5f9fc',
      ambientGround: '#728d7b',
      sun: '#fff6dc',
      palette: {
        floor: '#b8d0c9',
        wall: '#e5ece2',
        facade: '#f1eee4',
        roof: '#d6e3dc',
        step: '#dce8df',
        bridge: '#e7f1e8',
        metal: '#427b83',
        stone: '#e1e4d6',
        court: '#8ebac0',
        planter: '#759e90',
        garden: '#75a86b',
        trunk: '#8a7963',
        cover: '#78978e',
      },
    },
    preview: {
      position: { x: 54, y: 45, z: 55 },
      target: { x: -1, y: 3, z: -2 },
    },
  };
}
