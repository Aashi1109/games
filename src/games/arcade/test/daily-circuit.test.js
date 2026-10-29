import test from 'node:test';
import assert from 'node:assert/strict';
import { createCircuit, inspectCircuit, rotateTile } from '../src/games/daily-circuit.ts';

test('wire rotations preserve connections and reverse correctly', () => {
  assert.equal(rotateTile(1), 2);
  assert.equal(rotateTile(8), 1);
  assert.equal(rotateTile(3), 6);
  assert.equal(rotateTile(7), 14);
  for (let mask = 1; mask <= 15; mask += 1) {
    assert.equal(rotateTile(mask, 4), mask);
    assert.equal(rotateTile(rotateTile(mask), -1), mask);
  }
});

test('power only crosses reciprocal connections and detects open perimeter wires', () => {
  const closed = inspectCircuit([6, 8, 1, 0], 2, 0);
  assert.deepEqual([...closed.powered].sort(), [0, 1, 2]);
  assert.equal(closed.openEnds, 0);
  assert.equal(closed.solved, false);
  const disconnected = inspectCircuit([2, 2, 0, 0], 2, 0);
  assert.deepEqual([...disconnected.powered], [0]);
  assert.equal(disconnected.openEnds, 2);
});

test('daily boards are deterministic and every generated board has a complete solution', () => {
  assert.deepEqual(createCircuit('2026-10-06'), createCircuit('2026-10-06'));
  assert.notDeepEqual(createCircuit('2026-10-06').tiles, createCircuit('2026-10-07').tiles);
  for (let size = 2; size <= 8; size += 1) {
    for (let i = 0; i < 24; i += 1) {
      const board = createCircuit(`daily-${i}`, size);
      const solved = inspectCircuit(board.solution, size, board.source);
      assert.equal(solved.solved, true, `size ${size}, seed ${i}`);
      assert.equal(solved.openEnds, 0);
      assert.equal(inspectCircuit(board.tiles, size, board.source).solved, false);
      board.tiles.forEach((mask, index) => {
        assert.ok([0, 1, 2, 3].some(turns => rotateTile(mask, turns) === board.solution[index]));
      });
    }
  }
});

test('invalid board dimensions are rejected', () => {
  assert.throws(() => createCircuit('seed', 1), RangeError);
  assert.throws(() => createCircuit('seed', 5.5), RangeError);
  assert.equal(inspectCircuit([1], 2, 0).solved, false);
});
