import test from 'node:test';
import assert from 'node:assert/strict';
import { createHealthHud } from '../client/health-hud.ts';

function fixture() {
  const elements = Object.fromEntries(['health-block', 'health', 'health-fill', 'health-trail', 'health-meter', 'health-status']
    .map((id) => [id, { style: {}, dataset: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } }]));
  const pulses = [];
  elements.health.animate = () => {
    const pulse = { cancelled: false, cancel() { this.cancelled = true; } };
    pulses.push(pulse);
    return pulse;
  };
  const hud = createHealthHud({ querySelector: (selector) => elements[selector.slice(1)] });
  return { hud, elements, pulses };
}

test('damage updates accessible health immediately and repeated snapshots do not restart feedback', () => {
  const { hud, elements, pulses } = fixture();
  hud.update(100);
  assert.equal(pulses.length, 0, 'initial state should snap');
  assert.equal(elements['health-fill'].style.transition, 'none');
  assert.equal(elements['health-trail'].style.transition, 'none');
  hud.update(34.2);
  assert.equal(elements.health.textContent, '35');
  assert.equal(elements['health-meter'].attributes['aria-valuenow'], '34.2');
  assert.equal(elements['health-meter'].attributes['aria-valuetext'], '35 of 100 health');
  assert.equal(elements['health-block'].dataset.health, 'critical');
  assert.equal(elements['health-status'].textContent, 'LOW HEALTH');
  assert.equal(elements['health-fill'].style.transform, `scaleX(${34.2 / 100})`);
  assert.notEqual(elements['health-fill'].style.transition, 'none');
  assert.notEqual(elements['health-trail'].style.transition, 'none');
  hud.update(34.2);
  assert.equal(pulses.length, 1);
  assert.equal(pulses[0].cancelled, false);
  hud.update(12);
  assert.equal(pulses.length, 2);
  assert.equal(pulses[0].cancelled, true, 'successive hits must cancel the previous pulse');
});

test('healing, respawn and reset snap the trail and clear active damage feedback', () => {
  const { hud, elements, pulses } = fixture();
  hud.update(100);
  hud.update(50);
  hud.update(80);
  assert.equal(pulses.length, 1, 'healing must not produce a damage pulse');
  assert.equal(pulses[0].cancelled, true);
  assert.equal(elements['health-fill'].style.transition, 'none');
  assert.equal(elements['health-trail'].style.transition, 'none');
  assert.equal(elements['health-trail'].style.transform, 'scaleX(0.8)');
  hud.update(0);
  assert.equal(elements['health-status'].textContent, 'ELIMINATED');
  assert.equal(elements['health-block'].dataset.health, 'empty');
  hud.reset();
  assert.equal(elements.health.textContent, '100');
  assert.equal(elements['health-status'].textContent, '');
  assert.equal(elements['health-fill'].style.transition, 'none');
  assert.equal(elements['health-fill'].style.transform, 'scaleX(1)');
  assert.equal(elements['health-trail'].style.transform, 'scaleX(1)');
  assert.equal(elements['health-trail'].style.transition, 'none');
  assert.equal(pulses[1].cancelled, true);
  hud.update(50);
  hud.reset(50);
  assert.equal(pulses[2].cancelled, true, 'reset must cancel even when the amount is unchanged');
  assert.equal(elements['health-fill'].style.transition, 'none');
  assert.equal(elements['health-trail'].style.transition, 'none');
});

test('disabled motion and invalid or out-of-range health preserve a bounded static HUD', () => {
  const { hud, elements, pulses } = fixture();
  hud.update(250);
  assert.equal(elements.health.textContent, '100');
  hud.update(60);
  hud.update(60, { animate: false });
  assert.equal(pulses[0].cancelled, true, 'turning motion off must stop feedback without another hit');
  assert.equal(elements['health-fill'].style.transition, 'none');
  assert.equal(elements['health-trail'].style.transition, 'none');
  hud.update(20, { animate: false });
  assert.equal(pulses.length, 1);
  assert.equal(pulses[0].cancelled, true);
  assert.equal(elements['health-fill'].style.transition, 'none');
  assert.equal(elements['health-trail'].style.transition, 'none');
  hud.update(-5, { animate: false });
  assert.equal(elements.health.textContent, '0');
  assert.equal(elements['health-meter'].attributes['aria-valuenow'], '0');
  hud.reset(NaN);
  assert.equal(elements['health-fill'].style.transform, 'scaleX(0)');
  hud.reset(100);
  delete elements.health.animate;
  assert.doesNotThrow(() => hud.update(40), 'health should still update without the optional number animation API');
  assert.equal(elements.health.textContent, '40');
});
