import type { Box, Pad, Rope } from '../types.ts';
// Shared solid geometry. Coordinates use box centers in x/z and bottom faces in y.
export const box = (
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  style = 'wall',
  extra: Pick<Box, 'label' | 'facadeBase'> = {},
): Box => ({ x, y, z, w, h, d, style, ...extra });
export function perimeter(size: number, style = 'wall') {
  const edge = size / 2;
  return [
    box(0, -1, 0, size, 1, size, 'floor'),
    box(-edge, 0, 0, 1, 9, size, style),
    box(edge, 0, 0, 1, 9, size, style),
    box(0, 0, -edge, size, 9, 1, style),
    box(0, 0, edge, size, 9, 1, style),
  ];
}
export function stairs(
  boxes: Box[],
  x: number,
  z: number,
  height: number,
  direction = -1,
  base = 0,
  width = 3,
) {
  const count = Math.ceil(height / 0.32);
  for (let step = 1; step <= count; step++) {
    boxes.push(
      box(
        x,
        base,
        z + direction * (step - 0.5) * 0.58,
        width,
        (height * step) / count,
        0.58,
        'step',
      ),
    );
  }
  // A full-width landing gives players room to turn onto the roof at speed.
  boxes.push(
    box(
      x,
      base + height - 0.32,
      z + direction * (count * 0.58 + 1.2),
      width,
      0.32,
      2.4,
      'bridge',
    ),
  );
}
export function building(
  boxes: Box[],
  x: number,
  z: number,
  w: number,
  d: number,
  height: number,
  {
    side = 1,
    style = 'wall',
    label = '01',
    base = 0,
    stairOffset = w / 2 + 1.5,
    stairWidth = 3,
  } = {},
) {
  const thickness = 0.45;
  const doorway = 3.4;
  const doorHeight = 2.8;
  // North and south doors form an uninterrupted ground-floor passage.
  for (const face of [-1, 1]) {
    for (const section of [-1, 1]) {
      boxes.push(
        box(
          x + (section * (w + doorway)) / 4,
          base,
          z + (face * (d - thickness)) / 2,
          (w - doorway) / 2,
          height - 0.32,
          thickness,
          style,
        ),
      );
    }
    boxes.push(
      box(
        x,
        base + doorHeight,
        z + (face * (d - thickness)) / 2,
        doorway,
        height - doorHeight - 0.32,
        thickness,
        style,
      ),
    );
  }
  for (const face of [-1, 1])
    boxes.push(
      box(
        x + (face * (w - thickness)) / 2,
        base,
        z,
        thickness,
        height - 0.32,
        d,
        style,
      ),
    );
  boxes.push(
    box(x, base + height - 0.32, z, w + 0.4, 0.32, d + 0.4, 'roof', {
      label,
      facadeBase: base,
    }),
  );
  stairs(
    boxes,
    x + side * stairOffset,
    z + d / 2 + 1.2,
    height,
    -1,
    base,
    stairWidth,
  );
}
export const rope = (
  id: string,
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  speed = 12,
): Rope => ({
  id,
  from: { x: x1, y: y1, z: z1 },
  to: { x: x2, y: y2, z: z2 },
  speed,
});
export const pad = (
  x: number,
  z: number,
  vx: number,
  vz: number,
  vy = 17,
  y = 0,
): Pad => ({ x, y, z, radius: 1.7, vx, vy, vz });
