import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewMotion } from '../client/view-motion.js';
import { createPlayer } from '../shared/simulation.js';
import { getMap } from '../shared/world.js';

test('camera clearance follows the active arena, including prediction correction', () => {
  const player = { ...createPlayer('camera', 'Camera'), x: 0, y: 0, z: 0 };
  const view = createViewMotion();
  view.reset(player);
  const lowRoom = { ...getMap(), boxes: [{ x: 0, y: 1.3, z: 0, w: 4, h: 0.5, d: 4 }] };
  const openRoom = { ...getMap(), boxes: [] };
  const correction = { x: 0, y: 0.5, z: 0 };
  assert.ok(view.sample(player, 1, 0, false, false, correction, lowRoom).y <= 1.22);
  assert.equal(view.sample(player, 1, 0, false, false, correction, openRoom).y, 2.1);
});
