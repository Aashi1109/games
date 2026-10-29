import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasPoint } from '../viewport.ts';

test('drawing coordinates preserve center and corners in a wide viewport', () => {
  const box = { left: 20, top: 10, width: 1000, height: 310 };
  assert.deepEqual(canvasPoint(520, 165, box), [.5, .5]);
  assert.deepEqual(canvasPoint(295, 10, box), [0, 0]);
  assert.deepEqual(canvasPoint(745, 320, box), [1, 1]);
});
test('drawing coordinates account for vertical letterboxing on phones', () => {
  const box = { left: 10, top: 100, width: 450, height: 500 };
  assert.deepEqual(canvasPoint(10, 195, box), [0, 0]);
  assert.deepEqual(canvasPoint(460, 505, box), [1, 1]);
  assert.deepEqual(canvasPoint(235, 350, box), [.5, .5]);
});
test('letterbox and collapsed-surface input remains within the drawing', () => {
  assert.deepEqual(canvasPoint(-20, 1000, { left: 0, top: 0, width: 450, height: 310 }), [0, 1]);
  assert.deepEqual(canvasPoint(5, 5, { left: 0, top: 0, width: 0, height: 0 }), [0, 0]);
});
