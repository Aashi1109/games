import type { ArenaMap } from '../types.ts';
import { box, perimeter, stairs, building, rope, pad } from './helpers.ts';

export function canyonRelay(): ArenaMap {
  const boxes = perimeter(96, 'rock');

  // Broad, offset strata give the canyon an irregular silhouette and leave
  // winding slots between the western escarpment and the eastern outcrops.
  const mesa = (
    x: number,
    z: number,
    w: number,
    d: number,
    height: number,
    shift = 1,
  ) => {
    boxes.push(
      box(x, 0, z, w, height * 0.55, d, 'rock'),
      box(
        x + shift,
        height * 0.55,
        z - 0.8,
        w - 1.8,
        height * 0.25,
        d - 1.4,
        'rockLight',
      ),
      box(
        x + shift * 0.5,
        height * 0.8,
        z + 0.4,
        w - 3.2,
        height * 0.2,
        d - 2.8,
        'rock',
      ),
    );
  };
  mesa(-41, -7, 12, 63, 15.36);
  mesa(-33, -22, 10, 24, 11.52, -1);
  mesa(-19, -36, 16, 17, 17.28, -1);
  mesa(-3, -42, 15, 10, 13.44);
  mesa(17, -42, 21, 10, 16.64, -1);
  mesa(43, 18, 10, 36, 12.8, -1);
  mesa(34, 35, 14, 12, 8.32, -1);
  mesa(-40, 36, 11, 13, 10.88);
  mesa(-17, -17, 11, 14, 7.68, -1);
  mesa(13, -8, 11, 10, 6.4);
  mesa(25, 13, 13, 16, 6.4);
  mesa(9, 26, 10, 11, 3.84, -1);

  // The natural arch is the main landmark: an eight-metre-high underpass,
  // stepped buttresses, and a genuinely walkable stone span overhead.
  boxes.push(
    box(-13, 0, 5, 6, 8.32, 7.2, 'rock'),
    box(13, 0, 5, 6, 8.32, 7.2, 'rock'),
    box(-17, 0, 5.5, 3, 4.48, 9, 'rockLight'),
    box(17, 0, 5.5, 3, 4.48, 9, 'rockLight'),
    box(-13, 8.32, 5, 6, 1.28, 6.4, 'rockLight'),
    box(-9, 5.12, 5, 2, 4.48, 6.4, 'rockLight'),
    box(-6, 7.04, 5, 4, 2.56, 6.4, 'rockLight'),
    box(0, 8.32, 5, 8, 1.28, 6.4, 'rockLight'),
    box(6, 7.04, 5, 4, 2.56, 6.4, 'rockLight'),
    box(9, 5.12, 5, 2, 4.48, 6.4, 'rockLight'),
    box(13, 8.32, 5, 6, 1.28, 6.4, 'rockLight'),
    box(-13, 9.28, 9.4, 5, 0.32, 2.4, 'bridge'),
  );

  // One relay compound occupies the eastern cliff. Ground-floor doorways,
  // its raised service apron and its roof all offer different fighting levels.
  boxes.push(box(31, 0, -20, 24, 3.2, 26, 'sand'));
  stairs(boxes, 37, 0, 3.2);
  building(boxes, 32, -22, 12, 12, 6.4, {
    base: 3.2,
    side: -1,
    style: 'sand',
    label: 'RELAY / 07',
  });
  boxes.push(
    box(22, 3.2, -30, 4, 1.1, 3, 'cover'),
    box(40, 3.2, -12, 3, 1.1, 4, 'cover'),
    box(40.5, 3.2, -27, 1, 4.8, 1, 'metal'),
    box(39, 8, -27, 4, 0.4, 0.6, 'metal'),
    box(30, 9.6, -25.8, 4, 0.8, 1.4, 'cover'),
  );

  // The southwest mesa is reached by a long exposed stair and a short
  // cantilever bridge. It forms a third high station without another building.
  boxes.push(
    box(-27, 0, 26, 14, 6.4, 14, 'rock'),
    box(-27.6, 6.4, 25, 11, 3.2, 12, 'rockLight'),
  );
  stairs(boxes, -18, 39, 9.6);
  boxes.push(box(-23, 9.28, 20.4, 13, 0.32, 2.4, 'bridge'));

  // Lower shelves make a second, winding floor route through the northern
  // slot. Their stairs stay separate from the three overhead cable routes.
  boxes.push(box(5, 0, -25, 12, 2.56, 14, 'rockLight'));
  stairs(boxes, -3.5, -12, 2.56);
  boxes.push(
    box(-1, 2.24, -17.84, 5, 0.32, 2.4, 'bridge'),
    box(3, 2.56, -27, 3.8, 1.1, 2.8, 'rock'),
    box(8, 2.56, -22, 2.8, 1.1, 4, 'rock'),
    box(-3, 0, 19, 5, 0.32, 5, 'rockLight'),
    box(-4, 0.32, 18.5, 3, 0.32, 3, 'rockLight'),
    box(-5, 0.64, 18, 2, 0.32, 2, 'rock'),
    box(3, 0, 13, 3, 1.05, 2.8, 'rock'),
    box(-7, 0, -5, 2.6, 1.15, 4.5, 'rockLight'),
    box(17, 0, 32, 3, 1.1, 4, 'cover'),
    box(-28, 0, -3, 4, 1.2, 6, 'rockLight'),
    box(-29, 1.2, -4, 2.8, 1.1, 3, 'rock'),
    box(8, 0, -36, 5, 1.1, 2, 'cover'),
    box(-3, 0, 35, 3, 1.1, 2, 'cover'),
  );

  return {
    id: 'canyon-relay',
    name: 'Canyon Relay',
    subtitle: 'ROCK ARCH / CLIFFSIDE RELAY',
    description:
      'Wind through towering sandstone slots, fight beneath a natural rock arch, then ride its cables to a cliffside relay or exposed mesa.',
    size: 96,
    boxes,
    spawns: [
      { x: 0, y: 0, z: 40, yaw: 0 },
      { x: -29, y: 0, z: -39, yaw: -2.2 },
      { x: 42.5, y: 0, z: 42.5, yaw: 0.65 },
      { x: 35, y: 3.2, z: -31, yaw: 2.6 },
      { x: -33, y: 0, z: 13, yaw: -1.5 },
      { x: 5, y: 0, z: -38, yaw: Math.PI },
    ],
    pads: [
      pad(1, 31, -7, -19, 24),
      pad(34, 0, -17, 3.5, 24),
      pad(-25, -9, -1.4, 24, 24),
    ],
    targets: [
      { id: 'canyon-a', x: 33, y: 9.6, z: -19 },
      { id: 'canyon-b', x: -28, y: 9.6, z: 27 },
      { id: 'canyon-c', x: 0, y: 9.6, z: 5 },
    ],
    zones: [
      { id: 'zone-a', x: 33, z: -19, radius: 6 },
      { id: 'zone-b', x: -28, z: 27, radius: 6 },
      { id: 'zone-c', x: 0, z: 5, radius: 6 },
    ],
    ropes: [
      rope('canyon-relay-span', -12, 9.6, 5, 30, 9.6, -19, 13),
      rope('canyon-mesa-span', -12, 9.6, 5, -27, 9.6, 24, 12),
      rope('canyon-basin-crossing', -27, 9.6, 24, 30, 9.6, -19, 14),
      rope('canyon-arch-ascender', -13, 0, 11.15, -13, 9.6, 11.15, 7),
    ],
    details: [
      { kind: 'dish', x: -19, y: 17.28, z: -36, radius: 2.8, yaw: -0.7 },
    ],
    theme: {
      sky: '#c6dce4',
      fog: '#c6dce4',
      ground: '#ba9d7c',
      hemisphere: '#d8f0ff',
      ambientGround: '#997055',
      sun: '#fff0cf',
      palette: {
        floor: '#c2aa86',
        wall: '#d9c2a0',
        sand: '#d5c3a3',
        rock: '#aa6c4c',
        rockLight: '#d59d70',
        roof: '#ece1c8',
        step: '#c6ab86',
        bridge: '#536969',
        metal: '#465d60',
        cover: '#647975',
      },
    },
    preview: {
      position: { x: 48, y: 42, z: 50 },
      target: { x: 0, y: 5, z: 0 },
    },
  };
}
