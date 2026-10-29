import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPS } from '../shared/world.ts';

test('every map defines exactly 3 capture zones with id/x/z/radius', () => {
  for (const [mapId, map] of Object.entries(MAPS)) {
    assert.equal(map.zones.length, 3, `${mapId} should have 3 zones`);
    const ids = new Set();
    for (const zone of map.zones) {
      assert.equal(typeof zone.id, 'string');
      assert.equal(typeof zone.x, 'number');
      assert.equal(typeof zone.z, 'number');
      assert.equal(typeof zone.radius, 'number');
      ids.add(zone.id);
    }
    assert.equal(ids.size, 3, `${mapId} zone ids should be unique`);
  }
});
