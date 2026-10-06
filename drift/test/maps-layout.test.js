import test from 'node:test';
import assert from 'node:assert/strict';
import { getMap } from '../shared/world.js';
import { createPlayer, stepPlayer, STEP, PLAYER_HEIGHT, RADIUS } from '../shared/simulation.js';

function stairFlights(map) {
  const flights = [];
  let flight = [];
  for (const box of map.boxes) {
    if (box.style === 'step') {
      if (flight.length && (box.x !== flight[0].x || Math.abs(box.z - flight.at(-1).z) > 0.6)) {
        flights.push(flight);
        flight = [];
      }
      flight.push(box);
    } else if (flight.length) {
      flights.push(flight);
      flight = [];
    }
  }
  if (flight.length) flights.push(flight);
  return flights;
}

for (const mapId of ['canyon-relay', 'freight-yard', 'sky-garden', 'vertex']) {
  test(`${mapId}: launch pads have headroom and return players to a solid surface`, () => {
    const map = getMap(mapId);
    for (const [index, pad] of map.pads.entries()) {
      const player = createPlayer('jumper', 'Jumper', 0, 'assault', map);
      Object.assign(player, { x: pad.x, y: pad.y, z: pad.z });
      stepPlayer(player, {}, STEP, map);
      assert.ok(player.padCooldown > 0, `pad ${index}: launches from its marked position`);
      let highestFeet = player.y;
      let landed = false;
      for (let tick = 0; tick < 480; tick++) {
        stepPlayer(player, {}, STEP, map);
        highestFeet = Math.max(highestFeet, player.y);
        if (player.grounded) { landed = true; break; }
      }
      assert.ok(highestFeet > pad.y + 2, `pad ${index}: clear overhead launch space`);
      assert.ok(landed, `pad ${index}: lands after its flight`);
      assert.equal(map.boxes.some((box) => Math.abs(player.x - box.x) < box.w / 2 + RADIUS
        && Math.abs(player.z - box.z) < box.d / 2 + RADIUS
        && player.y + PLAYER_HEIGHT > box.y + 0.0001 && player.y < box.y + box.h - 0.0001), false,
      `pad ${index}: landing does not overlap a solid`);
    }
  });
}

for (const mapId of ['canyon-relay', 'freight-yard', 'sky-garden', 'vertex']) {
  test(`${mapId}: every stair flight reaches its landing on foot with full headroom`, () => {
    const map = getMap(mapId);
    const flights = stairFlights(map);
    assert.ok(flights.length >= 2, 'elevated routes need multiple ways up on foot');
    for (const [index, flight] of flights.entries()) {
      const first = flight[0];
      const last = flight.at(-1);
      const direction = Math.sign(flight[1].z - first.z);
      const player = createPlayer('walker', 'Walker', 0, 'assault', map);
      Object.assign(player, {
        x: first.x, y: first.y, z: first.z - direction * 0.85,
        yaw: direction > 0 ? Math.PI : 0,
      });
      let highestFeet = player.y;
      let crossedLanding = false;
      const travelDistance = Math.abs(last.z - first.z) + 4;
      const walkTicks = Math.ceil(travelDistance / 6 / STEP) + 30;
      for (let tick = 0; tick < walkTicks; tick++) {
        // No jumping, crouching, sprinting, or rope interaction: stairs must
        // work through normal walking and preserve the standing hit volume.
        stepPlayer(player, { forward: 1 }, STEP, map);
        highestFeet = Math.max(highestFeet, player.y);
        assert.equal(player.crouching, false, `flight ${index}: headroom at tick ${tick}`);
        assert.equal(player.padCooldown, 0, `flight ${index}: did not use a launch pad`);
        if ((player.z - last.z) * direction > 1 && player.y >= last.y + last.h - 0.001) crossedLanding = true;
      }
      assert.ok(highestFeet >= last.y + last.h - 0.001, `flight ${index}: reached ${highestFeet}, expected ${last.y + last.h}`);
      assert.ok(crossedLanding, `flight ${index}: has room to walk onto the upper landing`);
    }
  });
}
