import test from 'node:test';
import assert from 'node:assert/strict';
import { WORDS, adjacent, validPath, extendPath, findWords, makeBoard, assessWord, wordScore } from '../engine.ts';

test('paths allow diagonals, reject wrapping and reuse, and support backtracking', () => {
  assert.equal(adjacent(0, 5), true);
  assert.equal(adjacent(3, 4), false);
  assert.equal(validPath([0, 1, 5, 10]), true);
  assert.equal(validPath([0, 1, 0]), false);
  assert.equal(validPath([0, 3]), false);
  assert.equal(validPath([-1, 0]), false);
  assert.deepEqual(extendPath([0, 1, 5], 1), [0, 1]);
  assert.equal(extendPath([0, 1, 5], 0), null);
});

test('every discovered word has a legal path and matches the disclosed wordbook', () => {
  const letters = [...'CATSREANLIDOTEGS'];
  const solutions = findWords(letters);
  assert.ok(solutions.length >= 24);
  assert.equal(new Set(solutions.map(item => item.word)).size, solutions.length);
  for (const { word, path } of solutions) {
    assert.equal(validPath(path), true);
    assert.equal(path.map(index => letters[index]).join('').toLowerCase(), word);
    assert.ok(WORDS.includes(word));
  }
});

test('daily and practice generators are deterministic and never produce barren boards', () => {
  assert.deepEqual(makeBoard('daily-2026-10-06'), makeBoard('daily-2026-10-06'));
  for (let index = 0; index < 35; index += 1) {
    const board = makeBoard(`test-${index}`);
    assert.equal(board.letters.length, 16);
    assert.ok(board.solutions.length >= 24);
    assert.ok(board.solutions.some(item => item.word.length >= 5));
  }
});

test('short words, duplicates, off-list words and illegal paths cannot earn points', () => {
  const board = { letters: [...'CATSREANLIDOTEGS'] };
  assert.deepEqual(assessWord(board, [0, 1, 2]), { ok: true, word: 'cat', score: 1 });
  assert.equal(assessWord(board, [0, 1]).ok, false);
  assert.equal(assessWord(board, [0, 1, 2], new Set(['cat'])).ok, false);
  assert.equal(assessWord(board, [0, 1, 0]).ok, false);
  assert.equal(assessWord({ letters: Array(16).fill('Z') }, [0, 1, 2]).ok, false);
  assert.deepEqual([3, 4, 5, 6, 7, 8].map(length => wordScore('a'.repeat(length))), [1, 2, 5, 7, 9, 11]);
});
