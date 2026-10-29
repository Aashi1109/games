import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCourse, pointAlongCourse, nearestTrackPoint, crossedGate, advanceRace, driveCar, raceScore } from '../src/games/corner-rush.ts';

test('daily circuits are deterministic, change by date, and stay inside the playfield', () => {
  const course = makeCourse('2026-10-06');
  assert.deepEqual(course, makeCourse('2026-10-06'));
  assert.notDeepEqual(course.points, makeCourse('2026-10-07').points);
  assert.equal(course.checkpoints.length, 8);
  for (const p of course.points) {
    assert.ok(p.x > 65 && p.x < 895);
    assert.ok(p.y > 115 && p.y < 520);
  }
  assert.ok(course.length > 1400 && course.length < 1800);
});

test('course interpolation wraps and projection finds the road', () => {
  const course = makeCourse('projection');
  assert.deepEqual(pointAlongCourse(course, 0), pointAlongCourse(course, 1));
  const position = pointAlongCourse(course, 0.37);
  assert.ok(nearestTrackPoint(course, position.x, position.y).distance < 0.001);
  assert.ok(nearestTrackPoint(course, 480, 309).distance > 120);
});

test('gates count only forward crossings inside the road', () => {
  const gate = { x: 100, y: 100, angle: 0 };
  assert.equal(crossedGate({ x: 90, y: 100 }, { x: 110, y: 100 }, gate), true);
  assert.equal(crossedGate({ x: 110, y: 100 }, { x: 90, y: 100 }, gate), false);
  assert.equal(crossedGate({ x: 90, y: 170 }, { x: 110, y: 170 }, gate), false);
  assert.equal(crossedGate({ x: 90, y: 100 }, { x: 95, y: 100 }, gate), false);
});

test('all eight gates must be passed in order for each of three laps', () => {
  const course = makeCourse('gates');
  let progress = { laps: 0, nextGate: 1, gates: 0 };
  const cross = index => {
    const gate = course.checkpoints[index]; const dx = Math.cos(gate.angle) * 4; const dy = Math.sin(gate.angle) * 4;
    progress = advanceRace(progress, { x: gate.x - dx, y: gate.y - dy }, { x: gate.x + dx, y: gate.y + dy }, course);
  };
  cross(0);
  assert.equal(progress.laps, 0, 'crossing the finish first must not award a lap');
  cross(3);
  assert.equal(progress.gates, 0, 'a skipped checkpoint must not count');
  for (let lap = 0; lap < 3; lap++) {
    for (let gate = 1; gate < 8; gate++) cross(gate);
    cross(0);
    assert.equal(progress.laps, lap + 1);
  }
  assert.equal(progress.gates, 24);
  cross(1);
  assert.equal(progress.gates, 24, 'completed races cannot gain more gates');
});

test('grass slows the car, steering changes direction, and bounds remain recoverable', () => {
  const course = makeCourse('driving'); const start = pointAlongCourse(course, 0);
  const onRoad = driveCar({ ...start, speed: 120 }, course, 0, 1 / 30);
  const offRoad = driveCar({ x: 480, y: 309, speed: 120, angle: 0 }, course, 0, 1 / 30);
  assert.ok(onRoad.speed > offRoad.speed);
  assert.equal(offRoad.offRoad, true);
  assert.ok(driveCar({ ...start, speed: 120 }, course, 1, 1 / 30).angle > start.angle);
  const wall = driveCar({ x: 944, y: 300, speed: 190, angle: 0 }, course, 0, 1 / 30);
  assert.equal(wall.x, 945);
  assert.ok(wall.speed <= 35);
});

test('faster finishes score higher and any finish beats an unfinished race', () => {
  assert.ok(raceScore(35, 24, true) > raceScore(45, 24, true));
  assert.ok(raceScore(150, 24, true) > raceScore(150, 23, false));
  assert.equal(raceScore(150, 0, false), 0);
});

test('daily course geometry permits all three laps using only ordinary steering and throttle', () => {
  for (let day = 1; day <= 7; day++) {
    const course = makeCourse(`2026-10-${String(day).padStart(2, '0')}`);
    let car = { ...pointAlongCourse(course, 0.007), speed: 0 };
    let progress = { laps: 0, nextGate: 1, gates: 0 };
    for (let frame = 0; frame < 60 * 45 && progress.laps < 3; frame++) {
      const near = nearestTrackPoint(course, car.x, car.y);
      const target = pointAlongCourse(course, near.fraction + 32 / course.length);
      const aim = Math.atan2(target.y - car.y, target.x - car.x);
      const error = Math.atan2(Math.sin(aim - car.angle), Math.cos(aim - car.angle));
      const next = driveCar(car, course, Math.max(-1, Math.min(1, error * 3.5)), 1 / 60);
      progress = advanceRace(progress, car, next, course);
      car = next;
      assert.equal(car.offRoad, false, `daily course ${day} should be drivable on its road`);
    }
    assert.equal(progress.laps, 3, `daily course ${day} must be completable`);
    assert.equal(progress.gates, 24);
  }
});
