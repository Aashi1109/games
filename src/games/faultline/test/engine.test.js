import test from 'node:test';
import assert from 'node:assert/strict';
import { COLS, ROWS, SURFACE, TILE, BASE_X, TURRET_HEIGHT, UPGRADE_DEFS, createGame, step, interact, buyUpgrade, serialize, restore, nearBase } from '../engine.ts';

function advance(state, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds * 10); i++) step(state, input, 0.1);
}
function atBase(state) {
  state.player.x = BASE_X * TILE;
  state.player.y = SURFACE * TILE - TILE / 2;
  return state;
}

test('seeded map is reproducible, bounded, and has reachable starter ore', () => {
  const a = createGame({ seed: 54321 });
  assert.deepEqual(a, createGame({ seed: 54321 }));
  assert.notDeepEqual(a.tiles, createGame({ seed: 99 }).tiles);
  assert.equal(a.tiles.length, ROWS);
  assert.ok(a.tiles.every((row) => row.length === COLS));
  assert.ok(a.tiles.slice(0, SURFACE).flat().every((cell) => cell.type === 'air'));
  assert.ok(a.tiles[ROWS - 1].every((cell) => cell.type === 'bedrock'));
  assert.equal(a.tiles[8][13].type, 'iron');
  assert.equal(a.tiles[8][14].type, 'air');
  assert.equal(a.waveTimer, 65);
  assert.equal(createGame({ difficulty: 'relaxed' }).base.hp, 220);
  assert.equal(createGame({ difficulty: 'invalid', seed: NaN }).difficulty, 'normal');
});

test('movement stops at solid tiles and does not escape the surface or world', () => {
  const s = createGame();
  const start = s.player.x;
  advance(s, 2, { dx: -1 });
  assert.ok(s.player.x < start);
  assert.ok(s.player.x >= 14 * TILE + 15 - 0.01);
  advance(s, 3, { dy: -1 });
  assert.equal(s.player.y, SURFACE * TILE - TILE / 2);
  advance(s, 20, { dx: -1 });
  assert.ok(s.player.x >= 15);
  advance(s, 25, { dx: 1 });
  assert.ok(s.player.x <= COLS * TILE - 15);
});

test('move and drill mines the adjacent deposit, records value, and opens a passage', () => {
  const s = createGame();
  advance(s, 0.8, { dx: -1, drill: true });
  assert.equal(s.tiles[8][13].type, 'air');
  assert.deepEqual(s.player.cargo, [{ type: 'iron', value: 3 }]);
  assert.equal(s.oreMined, 1);
  const before = s.player.x;
  advance(s, 0.1, { dx: -1 });
  assert.ok(s.player.x < before - 10);
});

test('cargo limit preserves ore but still permits digging ordinary rock', () => {
  const s = createGame();
  s.player.cargo = Array.from({ length: 6 }, () => ({ type: 'iron', value: 3 }));
  advance(s, 2, { dx: -1, drill: true });
  assert.equal(s.tiles[8][13].hp, 1.4);
  assert.equal(s.player.cargo.length, 6);
  assert.equal(s.events.at(-1).type, 'full');
  s.tiles[8][13] = { type: 'rock', hp: 1, maxHp: 1, variant: 0 };
  advance(s, 0.6, { dx: -1, drill: true });
  assert.equal(s.tiles[8][13].type, 'air');
  assert.equal(s.player.cargo.length, 6);
});

test('surface cap and bedrock cannot be drilled', () => {
  const s = atBase(createGame());
  s.player.x = 10.5 * TILE;
  advance(s, 3, { dy: 1, drill: true });
  assert.equal(s.tiles[SURFACE][10].type, 'rock');
  s.player.x = 1.5 * TILE;
  s.player.y = 8.5 * TILE;
  s.tiles[8][1] = { type: 'air', hp: 0, maxHp: 0, variant: 0 };
  advance(s, 3, { dx: -1, drill: true });
  assert.equal(s.tiles[8][0].type, 'bedrock');
});

test('recall deposits all cargo once, respects cooldown, and keeps cargo on repeat', () => {
  const s = createGame();
  s.player.cargo.push({ type: 'iron', value: 3 }, { type: 'gold', value: 10 });
  step(s, { recall: true }, 0.1);
  assert.equal(s.credits, 21);
  assert.equal(s.player.cargo.length, 0);
  assert.equal(s.player.recallCooldown, 25);
  assert.equal(nearBase(s), true);
  s.player.y = 10.5 * TILE;
  s.player.cargo.push({ type: 'crystal', value: 6 });
  step(s, { recall: true }, 0.1);
  assert.equal(s.player.y, 10.5 * TILE);
  assert.equal(s.player.cargo.length, 1);
  assert.equal(s.credits, 21);
});

test('interaction is restricted to shelter; switching to cannon deposits and can be reversed', () => {
  const s = createGame();
  assert.equal(interact(s), false);
  atBase(s);
  s.player.cargo.push({ type: 'iron', value: 3 });
  assert.equal(interact(s), true);
  assert.equal(s.player.mode, 'turret');
  assert.equal(s.credits, 11);
  assert.equal(interact(s), true);
  assert.equal(s.player.mode, 'mine');
});

test('upgrades enforce location, prices, limits, and repair without over-healing', () => {
  const s = createGame();
  s.credits = 500;
  assert.equal(buyUpgrade(s, 'cargo'), false);
  atBase(s);
  assert.equal(buyUpgrade(s, '__proto__'), false);
  assert.equal(buyUpgrade(s, 'repair'), false);
  assert.equal(buyUpgrade(s, 'cargo'), true);
  assert.equal(s.player.capacity, 9);
  assert.equal(s.credits, 490);
  assert.equal(buyUpgrade(s, 'armor'), true);
  assert.equal(s.base.maxHp, 205);
  assert.equal(s.base.hp, 205);
  s.base.hp = 190;
  assert.equal(buyUpgrade(s, 'repair'), true);
  assert.equal(s.base.hp, 205);
  for (let i = 0; i < 3; i++) assert.equal(buyUpgrade(s, 'drill'), true);
  assert.equal(buyUpgrade(s, 'drill'), false);
  s.credits = 0;
  assert.equal(buyUpgrade(s, 'turret'), false);
  assert.equal(UPGRADE_DEFS.length, 5);
});

test('first wave starts at countdown, spawns from both sides, and grants a respite', () => {
  const s = createGame();
  s.waveTimer = 0.05;
  step(s, {}, 0.1);
  assert.equal(s.phase, 'wave');
  assert.equal(s.wave, 1);
  assert.equal(s.enemies.length, 1);
  assert.equal(s.waveRemaining, 5);
  advance(s, 2.2);
  assert.ok(s.enemies.some((enemy) => enemy.side === 1));
  s.enemies = []; s.waveRemaining = 0;
  step(s, {}, 0.1);
  assert.equal(s.phase, 'mining');
  assert.equal(s.waveTimer, 50);
  assert.equal(s.credits, 13);
});

test('manual aiming creates visible projectiles and swept hits cannot tunnel through enemies', () => {
  const s = atBase(createGame());
  interact(s);
  s.phase = 'wave'; s.wave = 1; s.waveRemaining = 1; s.spawnTimer = 2;
  s.enemies.push({ id: s.nextId++, type: 'crawler', x: s.base.x + 55, y: s.base.y - TURRET_HEIGHT,
    hp: 12, maxHp: 12, speed: 1, damage: 1, attackTimer: 2, side: 1 });
  step(s, { fire: true, aimX: s.base.x + 100, aimY: s.base.y - TURRET_HEIGHT }, 0.1);
  assert.equal(s.kills, 1);
  assert.equal(s.enemies.length, 0);
  assert.ok(s.events.some((event) => event.type === 'kill'));
});

function equippedCampaign({ mine = true, dt = 1 / 60, seed = 104729 } = {}) {
  const s = atBase(createGame({ seed }));
  if (mine) {
    // Three attainable cargo trips: 18 + 18 + 15 salvage. No combat income
    // is granted here; all funds pass through the actual deposit mechanic.
    for (const types of [Array(6).fill('iron'), Array(6).fill('iron'), ['crystal', 'iron', 'iron', 'iron']]) {
      s.player.cargo = types.map((type) => ({ type, value: type === 'crystal' ? 6 : 3 }));
      step(s, {}, dt);
    }
  }
  interact(s);
  const cleared = [];
  for (let i = 0; i < 600 / dt && !['won', 'lost'].includes(s.phase); i++) {
    if (s.upgrades.turret < 2) buyUpgrade(s, 'turret');
    else if (s.upgrades.armor < 1) buyUpgrade(s, 'armor');
    if (s.base.hp < s.base.maxHp - 45) buyUpgrade(s, 'repair');
    step(s, { fire: true }, dt);
    if (s.events.some((event) => event.type === 'wave-clear')) cleared.push(s.wave);
  }
  return { state: s, cleared };
}

test('three cargo trips fund cannon, plating and repair for a complete campaign with damage', () => {
  const { state: s, cleared } = equippedCampaign();
  assert.deepEqual(cleared, [1, 2, 3]);
  assert.equal(s.upgrades.turret, 2);
  assert.equal(s.upgrades.armor, 1);
  assert.equal(s.upgrades.repair, 1);
  assert.equal(s.phase, 'won');
  assert.equal(s.wave, 4);
  assert.equal(s.kills, 43);
  assert.ok(s.base.hp > 0 && s.base.hp < s.base.maxHp);
  const completed = serialize(s);
  step(s, { fire: true, recall: true }, 0.1);
  assert.equal(s.totalTime, JSON.parse(completed).totalTime);
  assert.ok(restore(serialize(s)));
});

test('skipping mining survives the opening but loses late despite spending earned combat funds', () => {
  const { state: s, cleared } = equippedCampaign({ mine: false });
  assert.deepEqual(cleared, [1, 2, 3]);
  assert.equal(s.phase, 'lost');
  assert.equal(s.wave, 4);
  assert.equal(s.upgrades.turret, 1);
  assert.equal(s.base.hp, 0);
});

test('the funded campaign remains winnable at 30 fps and coarse bounded frame steps', () => {
  for (const dt of [1 / 30, 0.1]) {
    const { state: s } = equippedCampaign({ dt, seed: 99 });
    assert.equal(s.phase, 'won');
    assert.equal(s.kills, 43);
    assert.ok(s.base.hp > 0 && s.base.hp < s.base.maxHp);
  }
});

test('firing cadence carries fractional cooldown across frames without accumulating idle bursts', () => {
  const counts = [];
  for (const dt of [1 / 60, 1 / 30, 0.1]) {
    const s = atBase(createGame());
    interact(s);
    let shots = 0;
    for (let i = 0; i < Math.round(10 / dt); i++) {
      step(s, { fire: true }, dt);
      shots += s.events.filter((event) => event.type === 'shoot').length;
    }
    counts.push(shots);
    advance(s, 3);
    step(s, { fire: true }, dt);
    assert.equal(s.events.filter((event) => event.type === 'shoot').length, 1);
  }
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
});

test('the final siege beast can be safely saved and restored while alive', () => {
  const s = atBase(createGame());
  s.wave = 3; s.waveTimer = 0;
  step(s, {}, 0.1);
  assert.equal(s.phase, 'wave');
  assert.equal(s.wave, 4);
  assert.equal(s.enemies[0].type, 'brute');
  assert.equal(s.enemies[0].maxHp, 950);
  assert.ok(restore(serialize(s)));
});

test('shelter loss is terminal and remains a valid saved state', () => {
  const s = createGame();
  s.phase = 'wave'; s.wave = 1; s.waveRemaining = 1; s.spawnTimer = 2; s.base.hp = 1;
  s.enemies.push({ id: s.nextId++, type: 'brute', x: s.base.x + 50, y: 250,
    hp: 200, maxHp: 200, speed: 20, damage: 17, attackTimer: 0, side: 1 });
  step(s, {}, 0.1);
  assert.equal(s.phase, 'lost');
  assert.equal(s.base.hp, 0);
  const time = s.totalTime;
  step(s, { recall: true }, 0.1);
  assert.equal(s.totalTime, time);
  assert.equal(interact(s), false);
  assert.ok(restore(serialize(s)));
});

test('save round trip preserves simulation and restores safely during an active wave', () => {
  const s = createGame({ seed: 4567 });
  advance(s, 0.8, { dx: -1, drill: true });
  step(s, { recall: true }, 0.1);
  s.waveTimer = 0;
  advance(s, 7);
  const copy = restore(serialize(s));
  assert.ok(copy);
  assert.equal(copy.credits, s.credits);
  assert.deepEqual(copy.tiles, s.tiles);
  assert.deepEqual(copy.enemies, s.enemies);
  advance(s, 20); advance(copy, 20);
  assert.deepEqual(copy, s);
});

test('invalid saves cannot inject prototypes, oversized state, invalid cells, or nonnumeric values', () => {
  const source = serialize(createGame());
  assert.equal(restore(null), null);
  assert.equal(restore('{'), null);
  assert.equal(restore(' '.repeat(500001)), null);
  assert.equal(restore(source.replace('"version":1', '"__proto__":{"polluted":true},"version":1')), null);
  assert.equal({}.polluted, undefined);
  for (const edit of [
    (s) => { s.credits = '999'; },
    (s) => { s.wave = 8; },
    (s) => { s.base.hp = 10000; },
    (s) => { s.player.capacity = 999; },
    (s) => { s.player.x = null; },
    (s) => { s.player.cargo.push({ type: 'gold', value: 999 }); },
    (s) => { s.upgrades.drill = -1; },
    (s) => { s.tiles[8][8].hp = -1; },
    (s) => { s.tiles.pop(); },
    (s) => { s.tiles[0][0] = { type: 'rock', hp: 1, maxHp: 1, variant: 0 }; },
    (s) => { s.enemies.push({ type: 'crawler' }); },
    (s) => { s.projectiles.push({ x: Infinity }); },
  ]) {
    const candidate = JSON.parse(source); edit(candidate);
    assert.equal(restore(JSON.stringify(candidate)), null);
  }
});

test('frame input rejects nonfinite values and clamps huge elapsed time', () => {
  const s = createGame();
  const p = { ...s.player };
  step(s, { dx: NaN, dy: Infinity }, NaN);
  assert.equal(s.totalTime, 0);
  step(s, { dx: NaN, dy: Infinity, aimX: NaN }, 10);
  assert.equal(s.totalTime, 0.1);
  assert.equal(s.player.x, p.x);
  assert.equal(s.player.y, p.y);
  assert.ok(Number.isFinite(s.player.x));
  step(s, null, 0.1);
  assert.equal(s.totalTime, 0.2);
});
