import test from 'node:test';
import assert from 'node:assert/strict';
import { createDamageFeedback } from '../client/damage-feedback.ts';

function fixture() {
  const flash = { style: { opacity: '0' } };
  const direction = { hidden: true, style: { setProperty(name, value) { this[name] = value; } } };
  const nodes = { '#damage-flash': flash, '#damage-direction': direction };
  return { flash, direction, feedback: createDamageFeedback({ querySelector: (selector) => nodes[selector] }) };
}

const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
const angle = (direction) => Number.parseFloat(direction.style['--damage-angle']);
const sameDirection = (actual, expected) => {
  close(Math.sin(actual), Math.sin(expected));
  close(Math.cos(actual), Math.cos(expected));
};

test('incoming hits point forward, right, behind and left relative to player position', () => {
  const player = { x: 7, z: -4 };
  for (const [origin, expected] of [
    [{ x: 7, z: -14 }, 0],
    [{ x: 17, z: -4 }, Math.PI / 2],
    [{ x: 7, z: 6 }, Math.PI],
    [{ x: -3, z: -4 }, -Math.PI / 2],
  ]) {
    const { feedback, flash, direction } = fixture();
    feedback.hit(20, origin);
    feedback.update(0, player, 0);
    assert.equal(direction.hidden, false);
    assert.ok(Number(flash.style.opacity) > 0);
    sameDirection(angle(direction), expected);
    assert.equal(direction.style.transform, undefined, 'the viewport border must stay fixed while its colored sector changes');
  }
});

test('the direction follows camera yaw, including both turn directions and wrapped yaw', () => {
  for (const [origin, yaw, expected] of [
    [{ x: -10, z: 0 }, Math.PI / 2, 0],
    [{ x: 10, z: 0 }, -Math.PI / 2, 0],
    [{ x: 0, z: -10 }, Math.PI / 2, Math.PI / 2],
    [{ x: 0, z: 10 }, Math.PI, 0],
    [{ x: 10, z: -10 }, -Math.PI / 4, 0],
    [{ x: 0, z: -10 }, Math.PI * 4, 0],
  ]) {
    const { feedback, direction } = fixture();
    feedback.hit(18, origin);
    feedback.update(0, { x: 0, z: 0 }, yaw);
    sameDirection(angle(direction), expected);
  }
});

test('the hit origin is captured once while player movement updates the bearing', () => {
  const { feedback, direction } = fixture();
  const origin = { x: 10, z: 0 };
  feedback.hit(20, origin);
  origin.x = -10;
  feedback.update(0.05, { x: 0, z: 0 }, 0);
  sameDirection(angle(direction), Math.PI / 2);
  feedback.update(0.05, { x: 10, z: 10 }, 0);
  sameDirection(angle(direction), 0);
});

test('fade and expiry follow elapsed time at 30, 60 and 144 Hz', () => {
  const samples = [];
  for (const rate of [30, 60, 144]) {
    const { feedback, flash, direction } = fixture();
    feedback.hit(24, { x: 0, z: -10 });
    feedback.update(0, { x: 0, z: 0 }, 0);
    let previous = Number(flash.style.opacity);
    let frames = 0;
    while (!direction.hidden) {
      feedback.update(1 / rate, { x: 0, z: 0 }, 0);
      frames++;
      const opacity = Number(flash.style.opacity);
      assert.ok(opacity >= 0 && opacity <= previous, `${rate} Hz fade must be monotonic`);
      previous = opacity;
      if (frames === rate / 6) samples.push(opacity);
      assert.ok(frames < rate, 'the short effect must expire within one second');
    }
    assert.ok(frames / rate >= 0.7 && frames / rate <= 0.7 + 1 / rate);
    assert.equal(Number(flash.style.opacity), 0);
    feedback.update(1, { x: 0, z: 0 }, 0);
    assert.equal(direction.hidden, true);
    assert.equal(Number(flash.style.opacity), 0);
  }
  assert.equal(samples.length, 3);
  samples.forEach((sample) => close(sample, samples[0]));
});

test('sustained hits stay bounded, refresh the latest direction and reset immediately', () => {
  const { feedback, flash, direction } = fixture();
  for (let hit = 0; hit < 100; hit++) {
    feedback.hit(1_000, { x: hit % 2 ? 10 : -10, z: 0 });
    feedback.update(0.01, { x: 0, z: 0 }, 0);
    assert.ok(Number(flash.style.opacity) > 0 && Number(flash.style.opacity) <= 0.72);
    assert.ok(Number(direction.style.opacity) > 0 && Number(direction.style.opacity) <= 1);
  }
  sameDirection(angle(direction), Math.PI / 2);
  feedback.reset();
  assert.equal(direction.hidden, true);
  assert.equal(Number(flash.style.opacity), 0);
  feedback.update(0.01, { x: 0, z: 0 }, 0);
  assert.equal(direction.hidden, true);
  assert.equal(Number(flash.style.opacity), 0);
  feedback.hit(10, { x: 0, z: -5 });
  feedback.update(0, { x: 0, z: 0 }, 0);
  assert.equal(direction.hidden, false);
  assert.ok(Number(flash.style.opacity) > 0);
});

test('missing or malformed origins retain the vignette without a stale directional cue', () => {
  const { feedback, flash, direction } = fixture();
  for (const origin of [undefined, null, {}, { x: 1 }, { x: NaN, z: 1 }, { x: 1, z: Infinity }, { x: '1', z: 2 }]) {
    feedback.hit(18, { x: 10, z: 0 });
    feedback.update(0, { x: 0, z: 0 }, 0);
    assert.equal(direction.hidden, false);
    feedback.hit(18, origin);
    feedback.update(0, { x: 0, z: 0 }, 0);
    assert.equal(direction.hidden, true);
    assert.ok(Number(flash.style.opacity) > 0);
    assert.ok(Number.isFinite(Number(flash.style.opacity)));
  }
  feedback.hit(18, { x: 10, z: 0 });
  feedback.update(0, null, 0);
  assert.equal(direction.hidden, true);
  assert.ok(Number(flash.style.opacity) > 0);
});

test('non-damaging or malformed amounts do not create hit cues', () => {
  const { feedback, flash, direction } = fixture();
  for (const amount of [0, -1, NaN, Infinity, undefined, null, '20']) {
    feedback.hit(amount, { x: 10, z: 0 });
    feedback.update(0.01, { x: 0, z: 0 }, 0);
    assert.equal(direction.hidden, true);
    assert.equal(Number(flash.style.opacity), 0);
  }
});

test('reduced motion keeps a low static cue until expiry without a fade or pulse', () => {
  const { feedback, flash, direction } = fixture();
  feedback.hit(100, { x: 0, z: -10 });
  for (const delta of [0, 0.2, 0.2, 0.2]) {
    feedback.update(delta, { x: 0, z: 0 }, 0, false);
    assert.equal(direction.hidden, false);
    assert.equal(Number(flash.style.opacity), 0.14);
    assert.equal(Number(direction.style.opacity), 1);
    sameDirection(angle(direction), 0);
  }
  feedback.update(0.2, { x: 0, z: 0 }, 0, false);
  assert.equal(direction.hidden, true);
  assert.equal(Number(flash.style.opacity), 0);
});
