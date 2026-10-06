import { box, perimeter, stairs, rope, pad } from './helpers.js';

export function freightYard() {
  const boxes = perimeter(104, 'metal');
  for (const wall of boxes.slice(1)) wall.h = 3.2;

  // A single long, open-sided freight shed anchors the west side of the yard.
  // Its loading floor, columns, end doors and roof are all shared collision.
  boxes.push(
    box(-43.7, 0, -5, 0.6, 9.28, 48, 'warehouse'),
    box(-31, 9.28, -5, 26, 0.32, 48, 'roof', { label: '01 / LOADING HALL' }),
    box(-36, 0, -8, 10, 1.28, 42, 'loading'),
  );
  for (const z of [-28.7, 18.7]) {
    boxes.push(
      box(-39.5, 0, z, 9, 9.28, 0.6, 'warehouse'),
      box(-22.5, 0, z, 9, 9.28, 0.6, 'warehouse'),
      box(-31, 4.8, z, 8, 4.48, 0.6, 'warehouse'),
    );
  }
  for (const z of [-27, -12, 4, 17]) {
    boxes.push(box(-18.8, 0, z, 1.2, 9.28, 1.2, 'metal'));
  }
  boxes.push(
    box(-18.8, 8.5, -5, 1.2, 0.78, 48, 'metal'),
    box(-37, 1.28, -21, 4, 1.28, 5, 'cover'),
    box(-37, 1.28, -5, 3, 2.56, 4, 'containerBlue'),
    box(-36, 1.28, 7, 5, 1.28, 4, 'cover'),
    box(-24, 0, -20, 3, 1.2, 4, 'machinery'),
    box(-25, 0, 5, 3, 1.2, 4, 'machinery'),
    box(-37, 9.6, -24, 8, 1.28, 5, 'warehouse'),
    box(-37, 9.6, 8, 8, 1.28, 6, 'warehouse'),
  );
  stairs(boxes, -36, 17.22, 1.28);
  // The exterior stair terminates beside the roof, then joins it laterally.
  stairs(boxes, -47, 5, 9.6);
  boxes.push(box(-44, 9.28, -13.6, 7, 0.32, 2.4, 'bridge'));

  // Twin full-length rail beds establish a long axis rather than a central court.
  for (const x of [-4, 9]) {
    boxes.push(box(x, 0, 0, 4.8, 0.04, 92, 'ballast'));
    for (let z = -44; z <= 44; z += 4) {
      boxes.push(box(x, 0.04, z, 4.2, 0.02, 0.32, 'sleeper'));
    }
    for (const offset of [-1.25, 1.25]) {
      boxes.push(box(x + offset, 0.06, 0, 0.14, 0.02, 92, 'rail'));
    }
  }
  boxes.push(
    box(-4, 0.08, 8, 3.8, 0.56, 15, 'metal'),
    box(-4, 0.64, 8, 3.4, 1.28, 7.2, 'cover'),
    box(9, 0.08, -24, 3.8, 0.56, 15, 'metal'),
    box(9, 0.64, -24, 3.4, 3.2, 9.6, 'containerBlue'),
  );

  // Offset stacks form narrow cargo streets and two generous drive-through
  // container portals. The suspended crosswise containers have 3.2 m clearance.
  const cargo = (x, y, z, w, d, style = 'container') => boxes.push(box(x, y, z, w, 3.2, d, style));
  cargo(20, 0, -31, 6.4, 14.4);
  cargo(20, 3.2, -30, 6.4, 12.8, 'containerBlue');
  cargo(34, 0, -35, 6.4, 14.4, 'containerBlue');
  cargo(34, 3.2, -33, 6.4, 12.8);
  cargo(27, 3.2, -31, 20.4, 5.6, 'containerYellow');

  cargo(20, 0, 4, 6.4, 12.8, 'containerBlue');
  cargo(34, 0, 4, 6.4, 12.8);
  cargo(27, 3.2, 4, 20.4, 5.6, 'containerYellow');
  cargo(36, 0, 18, 6.4, 7.2, 'containerBlue');

  cargo(20, 0, 30, 6.4, 14.4);
  cargo(20, 3.2, 30, 6.4, 12.8, 'containerBlue');
  cargo(35, 0, 33, 6.4, 14.4, 'containerBlue');
  cargo(35, 3.2, 32, 6.4, 12.8);
  cargo(27, 3.2, 30, 22.4, 5.6, 'containerYellow');

  // A full stair and bridge reach the stack roofs without requiring a mantle.
  stairs(boxes, 42, 18.4, 6.4, 1);
  boxes.push(box(38.8, 6.08, 31.2, 8, 0.32, 2.4, 'bridge'));

  // The gantry spans the whole working yard. Its tower legs sit outside the
  // walking deck, and the upper beams leave generous standing headroom.
  boxes.push(
    box(11, 9.28, -11, 58, 0.32, 4, 'bridge', { label: '02 / GANTRY' }),
    box(11, 8.7, -13.2, 58, 0.58, 0.6, 'crane'),
    box(11, 8.7, -8.8, 58, 0.58, 0.6, 'crane'),
  );
  for (const x of [-13, 35]) {
    for (const z of [-14.5, -7.5]) {
      boxes.push(box(x, 0, z, 1.3, 15.4, 1.3, 'crane'));
      boxes.push(box(x, 0, z, 3, 0.64, 2.8, 'metal'));
    }
    boxes.push(box(x, 15.4, -11, 1.7, 1.2, 10, 'crane'));
  }
  boxes.push(
    box(11, 15.4, -14.5, 51, 1.2, 1.2, 'crane'),
    box(11, 15.4, -7.5, 51, 1.2, 1.2, 'crane'),
    box(5, 14.1, -11, 5, 1.3, 4.2, 'machinery'),
    box(-10, 0, 13, 4, 1.28, 6, 'machinery'),
    box(-7, 0, 25, 5, 1.2, 4, 'cover'),
    box(5, 0, -34, 5, 1.1, 3, 'cover'),
    box(-11, 0, -34, 4, 2.4, 5, 'machinery'),
    box(18, 0, 17, 4, 1.2, 5, 'cover'),
    box(45, 0, -4, 4, 2.4, 7, 'machinery'),
  );

  return {
    id: 'freight-yard', name: 'Freight Yard', subtitle: 'RAIL DEPOT / HEAVY INDUSTRY',
    description: 'Race the rail lines through an open loading hall, stacked-container tunnels, and a towering gantry crane.',
    size: 104, boxes,
    spawns: [
      { x: 0, y: 0, z: 43, yaw: 0 },
      { x: 0, y: 0, z: -43, yaw: Math.PI },
      { x: -27, y: 0, z: 28, yaw: 0 },
      { x: 44, y: 0, z: 38, yaw: 0.85 },
      { x: -30, y: 0, z: -40, yaw: Math.PI },
      { x: 44, y: 0, z: -38, yaw: 2.35 },
    ],
    pads: [pad(0, 35, 0, -15, 19), pad(-24, 25, 0, -10, 26), pad(44, -19, -8, 6, 24)],
    targets: [
      { id: 'freight-a', x: -28, y: 9.6, z: 13 },
      { id: 'freight-b', x: 35, y: 6.4, z: 34 },
      { id: 'freight-c', x: 18, y: 9.6, z: -11 },
    ],
    zones: [
      { id: 'zone-a', x: -28, z: 13, radius: 6 },
      { id: 'zone-b', x: 35, z: 34, radius: 6 },
      { id: 'zone-c', x: 18, z: -11, radius: 6 },
    ],
    ropes: [
      rope('freight-gantry', -28, 9.6, -11, 36, 9.6, -11, 14),
      rope('freight-longhaul', 27, 6.4, -31, 27, 6.4, 30, 14),
      rope('freight-stack-link', 20, 6.4, 30, 35, 6.4, 32, 11),
      rope('freight-hall-ascender', -45, 0, 16, -45, 9.6, 16, 7),
      rope('freight-cargo-ascender', 38.2, 0, -34, 38.2, 6.4, -34, 7),
    ],
    theme: {
      sky: '#a6bdc7', fog: '#a6bdc7', ground: '#667674', hemisphere: '#d4e6f0', ambientGround: '#6b6254', sun: '#ffedcb',
      palette: {
        floor: '#788681', wall: '#a9b7b3', warehouse: '#c2c8bc', roof: '#526c71', step: '#85938e',
        metal: '#42585f', bridge: '#61797a', cover: '#aa9271', loading: '#a6aca0', machinery: '#566b70',
        container: '#bf5439', containerBlue: '#477f8d', containerYellow: '#bba454', crane: '#e3b950',
        ballast: '#535d59', sleeper: '#665f52', rail: '#9faeaa',
      },
    },
    preview: { position: { x: 54, y: 43, z: 59 }, target: { x: -3, y: 4, z: -4 } },
  };
}
