import test from 'node:test';
import assert from 'node:assert/strict';
import { TRAP_LEVELS, createRunner, stepTrap, trapPhase, circleHitsRunner, sprintScore } from '../src/games/trap-sprint.ts';

const emptyLevel = { platforms: [{ x: 0, y: 510, w: 960, h: 90 }], spikes: [], traps: [], saws: [] };
const advance = (state, level, seconds, input = {}) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) state = stepTrap(state, level, input, 1 / 120);
  return state;
};

test('runner lands exactly on the floor and can jump again', () => {
  let state = stepTrap(createRunner(emptyLevel), emptyLevel, { jump: true }, 1 / 120);
  assert.ok(state.vy < 0);
  assert.equal(state.grounded, false);
  state = advance(state, emptyLevel, 1);
  assert.equal(state.y, 474);
  assert.equal(state.grounded, true);
  assert.ok(stepTrap(state, emptyLevel, { jump: true }, 1 / 120).vy < 0);
});

test('walking into a gap falls, jumping the same gap safely lands', () => {
  const level = TRAP_LEVELS[1];
  let walked = { ...createRunner(level), x: 210 };
  walked = advance(walked, level, 1, { move: 1 });
  assert.equal(walked.dead, true);
  let jumped = { ...createRunner(level), x: 210, vx: 244 };
  jumped = stepTrap(jumped, level, { move: 1, jump: true }, 1 / 120);
  jumped = advance(jumped, level, 0.73, { move: 1 });
  assert.equal(jumped.dead, false);
  assert.equal(jumped.grounded, true);
  assert.ok(jumped.x >= 335);
});

test('thorns kill a grounded runner but not a runner jumping over them', () => {
  const level = TRAP_LEVELS[0];
  const grounded = stepTrap({ ...createRunner(level), x: 290 }, level, {}, 1 / 120);
  assert.equal(grounded.dead, true);
  const airborne = stepTrap({ ...createRunner(level), x: 290, y: 380, grounded: false }, level, {}, 1 / 120);
  assert.equal(airborne.dead, false);
});

test('surprise tiles telegraph before becoming dangerous and reset with each attempt', () => {
  const level = TRAP_LEVELS[2];
  const state = stepTrap({ ...createRunner(level), x: 355 }, level, {}, 1 / 120);
  assert.notEqual(state.trapStarts[0], null);
  assert.equal(trapPhase(state.time, state.trapStarts[0]), 'warning');
  assert.equal(trapPhase(state.time + 0.6, state.trapStarts[0]), 'active');
  assert.equal(trapPhase(state.time + 1.5, state.trapStarts[0]), 'sleep');
  assert.equal(createRunner(level).trapStarts[0], null);
});

test('platform sides do not permit walking through the raised rooftop', () => {
  const level = TRAP_LEVELS[3];
  let state = { ...createRunner(level), x: 249, y: 450, grounded: false, vx: 244 };
  state = stepTrap(state, level, { move: 1 }, 1 / 30);
  assert.equal(state.x, 250);
});

test('a courier must land at the final door to complete the route', () => {
  assert.equal(stepTrap({ ...createRunner(emptyLevel), x: 894 }, emptyLevel, {}, 1 / 120).won, true);
  assert.equal(stepTrap({ ...createRunner(emptyLevel), x: 894, y: 350, grounded: false }, emptyLevel, {}, 1 / 120).won, false);
});

test('circular saw collision respects clear space and score rewards cleaner faster runs', () => {
  assert.equal(circleHitsRunner({ x: 70, y: 490, r: 15 }, createRunner()), true);
  assert.equal(circleHitsRunner({ x: 70, y: 430, r: 15 }, createRunner()), false);
  assert.ok(sprintScore(40, 0) > sprintScore(50, 0));
  assert.ok(sprintScore(40, 0) > sprintScore(40, 1));
  assert.equal(sprintScore(10000, 1000), 100);
});

test('every handcrafted room has a complete playable route through its actual hazards', () => {
  const jumpFrames = [[1, 95, 203, 303], [40, 130, 233, 327], [66, 181, 271, 378],
    [61, 147, 230, 337], [1, 91, 186, 284, 381], [22, 128, 218, 323]];
  for (const [index, level] of TRAP_LEVELS.entries()) {
    let state = createRunner(level);
    for (let frame = 0; frame < 700 && !state.dead && !state.won; frame++) {
      state = stepTrap(state, level, { move: 1, jump: jumpFrames[index].includes(frame) }, 1 / 120);
    }
    assert.equal(state.dead, false, `${level.name} has an unsafe scripted crossing`);
    assert.equal(state.won, true, `${level.name} must have a reachable exit`);
  }
});
