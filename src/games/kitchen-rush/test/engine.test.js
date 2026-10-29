import test from 'node:test';
import assert from 'node:assert/strict';
import { createShift, startShift, pauseShift, advanceShift, chooseOrder, addIngredient, undoIngredient, clearPlate, serveOrder, RECIPES, safeScore } from '../engine.ts';
const started = () => { const s = createShift(() => 0); startShift(s); return s; };
const build = s => RECIPES[s.orders.find(o => o.id === s.selected).recipe].items.forEach(i => addIngredient(s, i));
test('only the exact ordered stack serves and combo increases tips', () => {
  const s = started(); build(s); const first = serveOrder(s); assert.equal(first.ok, true); assert.equal(s.served, 1); assert.equal(s.assembly.length, 0);
  build(s); const second = serveOrder(s); assert.equal(second.earned, first.earned + 25); assert.equal(s.combo, 2); assert.equal(s.score, first.earned + second.earned);
});
test('wrong stacks cost patience and reset combo but can be repaired', () => {
  const s = started(); s.combo = 3; build(s); addIngredient(s, 'tomato'); const patience = s.orders[0].patience;
  assert.equal(serveOrder(s).reason, 'recipe'); assert.equal(s.orders[0].patience, patience - 5); assert.equal(s.combo, 0); assert.equal(s.mistakes, 1); assert.equal(s.score, 0);
  undoIngredient(s); assert.equal(serveOrder(s).ok, true);
});
test('expired customers cannot be served between frames and four walkouts end the shift', () => {
  const s = started(); build(s); s.orders[0].patience = 0; assert.equal(serveOrder(s).reason, 'expired'); advanceShift(s, .1); assert.equal(s.walkouts, 1);
  for (let i = 0; i < 1200 && s.phase === 'running'; i++) advanceShift(s, .1);
  assert.equal(s.phase, 'ended'); assert.equal(s.result, 'closed'); const score = s.score; assert.equal(addIngredient(s, 'bun'), false); advanceShift(s, 20); assert.equal(s.score, score);
});
test('pause freezes clock, queue and input; restart creates a clean shift', () => {
  const s = started(); addIngredient(s, 'bun'); pauseShift(s); const snapshot = JSON.stringify(s); advanceShift(s, 99); addIngredient(s, 'patty'); clearPlate(s); chooseOrder(s, s.orders[1].id); assert.equal(serveOrder(s).reason, 'inactive'); assert.equal(JSON.stringify(s), snapshot);
  pauseShift(s); advanceShift(s, 1); assert.equal(s.remaining, 119); assert.equal(s.assembly.length, 1);
  const fresh = started(); assert.equal(fresh.remaining, 120); assert.equal(fresh.combo, 0); assert.equal(fresh.score, 0); assert.deepEqual(fresh.assembly, []);
});
test('shift can finish on time without walkouts and cannot start twice', () => {
  const s = started(); assert.equal(startShift(s), false); for (let second = 0; second < 120; second++) { while (s.orders.length) { build(s); serveOrder(s); } advanceShift(s, 1); }
  assert.equal(s.phase, 'ended'); assert.equal(s.result, 'complete'); assert.equal(s.remaining, 0); assert.equal(s.walkouts, 0);
});
test('ingredient capacity, selection and saved best reject invalid values', () => {
  const s = started(); assert.equal(addIngredient(s, '<script>'), false); assert.equal(chooseOrder(s, 999), false); for (let i = 0; i < 12; i++) addIngredient(s, 'bun'); assert.equal(s.assembly.length, 8);
  for (const v of [null, '200', -1, Infinity, NaN, {}, []]) assert.equal(safeScore(v), 0); assert.equal(safeScore(22.9), 22);
});
