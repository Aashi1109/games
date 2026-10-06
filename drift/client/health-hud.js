export function createHealthHud(root = document) {
  const block = root.querySelector('#health-block');
  const value = root.querySelector('#health');
  const fill = root.querySelector('#health-fill');
  const trail = root.querySelector('#health-trail');
  const meter = root.querySelector('#health-meter');
  const status = root.querySelector('#health-status');
  let previous;
  let pulse;

  function render(amount, animate, force = false) {
    const health = Math.max(0, Math.min(100, Number(amount) || 0));
    if (!force && health === previous) {
      if (!animate && (pulse || trail.style.transition !== 'none' || fill.style.transition !== 'none')) {
        pulse?.cancel();
        pulse = undefined;
        fill.style.transition = 'none';
        trail.style.transition = 'none';
      }
      return;
    }
    const damage = animate && previous !== undefined && health < previous;
    previous = health;
    pulse?.cancel();
    pulse = undefined;
    value.textContent = Math.ceil(health);
    fill.style.transition = damage ? 'transform 120ms var(--ease)' : 'none';
    fill.style.transform = `scaleX(${health / 100})`;
    trail.style.transition = damage ? 'transform 320ms ease-out 120ms' : 'none';
    trail.style.transform = `scaleX(${health / 100})`;
    meter.setAttribute('aria-valuenow', String(health));
    meter.setAttribute('aria-valuetext', `${Math.ceil(health)} of 100 health`);
    block.dataset.health = health === 0 ? 'empty' : health <= 35 ? 'critical' : health <= 60 ? 'wounded' : 'healthy';
    status.textContent = health === 0 ? 'ELIMINATED' : health <= 35 ? 'LOW HEALTH' : '';
    if (damage && value.animate) {
      pulse = value.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(1.12)', offset: 0.3 },
        { transform: 'scale(1)' },
      ], { duration: 220, easing: 'ease-out' });
    }
  }

  return {
    update(amount, { animate = true } = {}) { render(amount, animate); },
    reset(amount = 100) { render(amount, false, true); },
  };
}
