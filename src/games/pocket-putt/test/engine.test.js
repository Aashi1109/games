import test from 'node:test';
import assert from 'node:assert/strict';
import { HOLES, BOUNDS, createBall, createRound, takeShot, tickRound, nextTurn, stepBall, totalScore, scoreName } from '../engine.ts';

function settle(round) { for (let i = 0; i < 2400 && round.phase === 'rolling'; i++) round = tickRound(round, 1 / 120); return round; }
function targetShot(round, target) {
  const distance = Math.hypot(target.x - round.ball.x, target.y - round.ball.y);
  return settle(takeShot(round, Math.atan2(target.y - round.ball.y, target.x - round.ball.x), Math.sqrt(2 * 115 * distance) / 6.2));
}

test('a shot consumes one stroke, blocks another while rolling, and settles', () => {
  const round = createRound(); const rolling = takeShot(round, 0, 35);
  assert.equal(rolling.strokes, 1); assert.equal(takeShot(rolling, 1, 100), rolling);
  const resting = settle(rolling); assert.equal(resting.phase, 'aiming'); assert.equal(resting.ball.vx, 0);
  assert.equal(round.strokes, 0, 'previous state is preserved');
  assert.equal(takeShot(round, NaN, 50), round); assert.equal(takeShot(round, 0, 0), round);
});

test('rail and flowerbed impacts stay outside solids and lose energy', () => {
  let ball = { ...createBall({ x: BOUNDS.right - 9, y: 160 }), vx: 620, vy: 0, status: 'rolling' };
  ball = stepBall(ball, HOLES[0], 1 / 30); assert.ok(ball.vx < 0); assert.ok(ball.x <= BOUNDS.right - 8);
  ball = { ...createBall({ x: 402, y: 380 }), vx: 600, vy: 0, status: 'rolling' };
  ball = stepBall(ball, HOLES[1], 1 / 30); assert.ok(ball.x <= 406.01); assert.ok(ball.vx < 0); assert.ok(Math.abs(ball.vx) < 600);
});

test('a gentle ball drops in while an overpowered putt runs past the cup', () => {
  const cup = HOLES[0].cup;
  const gentle = stepBall({ ...createBall({ x: cup.x - 15, y: cup.y }), vx: 90, vy: 0, status: 'rolling' }, HOLES[0], 0.05);
  const fast = stepBall({ ...createBall({ x: cup.x - 15, y: cup.y }), vx: 600, vy: 0, status: 'rolling' }, HOLES[0], 0.05);
  assert.equal(gentle.status, 'sunk'); assert.notEqual(fast.status, 'sunk');
});

test('sand dissipates more speed and water charges one penalty then restores the lie', () => {
  const ball = { ...createBall({ x: 450, y: 320 }), vx: 200, vy: 0, status: 'rolling' };
  assert.ok(stepBall(ball, HOLES[3], 0.1).vx < stepBall(ball, HOLES[0], 0.1).vx);
  let round = { ...createRound(), hole: 4, ball: createBall({ x: 380, y: 330 }) };
  round = takeShot(round, 0, 30); round = settle(round);
  assert.equal(round.strokes, 2); assert.equal(round.phase, 'aiming'); assert.equal(round.ball.x, 380);
  assert.equal(tickRound(round, 1).strokes, 2); assert.match(round.notice, /penalty/);
});

test('eight unsuccessful putts score a nine and stop further shots', () => {
  let round = createRound();
  for (let i = 0; i < 8; i++) round = settle(takeShot(round, 0, 5));
  assert.equal(round.phase, 'hole-complete'); assert.equal(round.result, 'pickup'); assert.equal(round.scores[0][0], 9);
  assert.equal(takeShot(round, 0, 80), round);
});

const routes = [
  [HOLES[0].cup],
  [{ x: 318, y: 198 }, { x: 581, y: 198 }, HOLES[1].cup],
  [{ x: 358, y: 435 }, { x: 358, y: 210 }, HOLES[2].cup],
  [{ x: 300, y: 220 }, { x: 574, y: 220 }, HOLES[3].cup],
  [{ x: 301, y: 151 }, { x: 710, y: 130 }, HOLES[4].cup],
  [{ x: 239, y: 210 }, { x: 439, y: 224 }, { x: 440, y: 357 }, { x: 620, y: 356 }, HOLES[5].cup],
];

test('all six authored holes are completable with ordinary legal putts', () => {
  let round = createRound();
  for (const [index, route] of routes.entries()) {
    assert.equal(round.hole, index);
    for (const target of route) round = targetShot(round, target);
    assert.equal(round.phase, 'hole-complete', HOLES[index].name);
    assert.equal(round.result, 'sunk', HOLES[index].name);
    assert.ok(round.scores[0][index] <= 5, HOLES[index].name);
    round = nextTurn(round);
  }
  assert.equal(round.phase, 'complete'); assert.equal(totalScore(round.scores[0]), 18);
});

test('two players alternate each hole and complete exactly twelve score cells', () => {
  let round = createRound(2);
  for (let hole = 0; hole < 6; hole++) for (let player = 0; player < 2; player++) {
    assert.equal(round.player, player); assert.equal(round.hole, hole);
    for (const target of routes[hole]) round = targetShot(round, target);
    assert.equal(round.result, 'sunk'); round = nextTurn(round);
  }
  assert.equal(round.phase, 'complete'); assert.deepEqual(round.scores.map(totalScore), [18, 18]);
  assert.equal(round.scores.flat().filter(n => n !== null).length, 12);
  assert.equal(nextTurn(round), round);
});

test('score labels distinguish a hole in one, birdie, par and bogey', () => {
  assert.equal(scoreName(1, 3), 'Hole in one!'); assert.match(scoreName(2, 3), /birdie/);
  assert.match(scoreName(3, 3), /par/); assert.match(scoreName(4, 3), /bogey/);
});
