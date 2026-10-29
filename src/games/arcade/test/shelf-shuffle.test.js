import test from 'node:test';
import assert from 'node:assert/strict';
import { SHELF_LEVELS, createShelfPuzzle, moveParcel, shelfIsSorted, availableShelfMoves } from '../src/games/shelf-shuffle.ts';

test('parcels only move from the top onto a matching kind or empty space', () => {
  const board = [[0, 1], [1], [], [0, 0, 0]];
  assert.deepEqual(moveParcel(board, 0, 1, 3), [[0], [1, 1], [], [0, 0, 0]]);
  assert.deepEqual(moveParcel(board, 0, 2, 3), [[0], [1], [1], [0, 0, 0]]);
  assert.equal(moveParcel(board, 0, 3, 3), null);
  assert.equal(moveParcel(board, 2, 0, 3), null);
  assert.equal(moveParcel(board, 3, 1, 3), null);
  assert.equal(moveParcel(board, 0, 0, 3), null);
  assert.equal(moveParcel(board, -1, 0, 3), null);
  assert.deepEqual(board, [[0, 1], [1], [], [0, 0, 0]], 'moves never mutate the previous board');
});

test('win requires complete uniform shelves, not merely matching top parcels', () => {
  assert.equal(shelfIsSorted([[0, 0, 0], [], [1, 1, 1], []], 3), true);
  assert.equal(shelfIsSorted([[0, 0], [0], [1, 1, 1], []], 3), false);
  assert.equal(shelfIsSorted([[0, 1, 0], [], [1, 0, 1], []], 3), false);
  assert.equal(shelfIsSorted([[], []], 3), false);
});

test('all difficulty levels are reachable from a solved state using only legal moves', () => {
  for (let level = 0; level < SHELF_LEVELS.length; level += 1) {
    for (let seed = 0; seed < 20; seed += 1) {
      const puzzle = createShelfPuzzle(`parcel-${seed}`, level);
      let board = puzzle.board;
      assert.equal(shelfIsSorted(board, puzzle.capacity), false);
      assert.ok(availableShelfMoves(board, puzzle.capacity).length);
      const counts = board.flat().reduce((result, color) => { result[color] = (result[color] || 0) + 1; return result; }, {});
      assert.equal(Object.keys(counts).length, puzzle.colors);
      assert.ok(Object.values(counts).every(count => count === puzzle.capacity));
      for (const { from, to } of puzzle.solutionMoves) {
        board = moveParcel(board, from, to, puzzle.capacity);
        assert.ok(board, `Illegal solution step for level ${level}, seed ${seed}`);
        assert.ok(board.every(shelf => shelf.length <= puzzle.capacity));
      }
      assert.equal(shelfIsSorted(board, puzzle.capacity), true, `Unsolved level ${level}, seed ${seed}`);
      assert.equal(board.filter(shelf => !shelf.length).length, 2);
    }
  }
});

test('puzzle seeds are reproducible and progress cannot request unknown levels', () => {
  assert.deepEqual(createShelfPuzzle('morning', 2), createShelfPuzzle('morning', 2));
  assert.throws(() => createShelfPuzzle('morning', 8), RangeError);
  assert.throws(() => createShelfPuzzle('morning', -1), RangeError);
});
