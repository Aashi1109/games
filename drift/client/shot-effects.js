import * as THREE from 'three';

const TRACER_LENGTH = 0.45;

// Fixed pools keep sustained fire from allocating geometry or growing GPU memory.
export function createShotEffects(scene, camera, { viewportHeight = () => 720 } = {}) {
  const root = new THREE.Group();
  root.name = 'shot-effects';
  scene.add(root);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 5);
  const plane = new THREE.PlaneGeometry(1, 1);
  const chip = new THREE.TetrahedronGeometry(1);
  const up = new THREE.Vector3(0, 1, 0);
  const front = new THREE.Vector3(0, 0, 1);
  const direction = new THREE.Vector3();
  const end = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const viewPosition = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const materials = [];
  const textures = [];

  function material(options) {
    const value = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, ...options });
    materials.push(value);
    return value;
  }

  function texture(draw) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    draw(canvas.getContext('2d'));
    const value = new THREE.CanvasTexture(canvas);
    value.colorSpace = THREE.SRGBColorSpace;
    textures.push(value);
    return value;
  }

  const markTexture = texture((ctx) => {
    // A chipped rim and dark pit read on both pale concrete and painted cover.
    ctx.translate(32, 32);
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const angle = i * Math.PI / 10;
      const radius = i % 2 ? 18 : 25;
      ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    ctx.closePath(); ctx.fillStyle = '#a58e73'; ctx.fill();
    ctx.strokeStyle = '#eadac0'; ctx.lineWidth = 3; ctx.stroke();
    const gradient = ctx.createRadialGradient(-3, -3, 1, 0, 0, 18);
    gradient.addColorStop(0, '#201c18'); gradient.addColorStop(0.5, '#352d24');
    gradient.addColorStop(1, '#75634e');
    ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#544333'; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const angle = i * 2.4;
      ctx.beginPath(); ctx.moveTo(Math.cos(angle) * 13, Math.sin(angle) * 13);
      ctx.lineTo(Math.cos(angle + 0.15) * 29, Math.sin(angle + 0.15) * 29); ctx.stroke();
    }
  });
  const dustTexture = texture((ctx) => {
    const gradient = ctx.createRadialGradient(32, 32, 3, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(218,196,162,0.7)');
    gradient.addColorStop(0.45, 'rgba(167,144,111,0.45)');
    gradient.addColorStop(1, 'rgba(167,144,111,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  });
  const flashTexture = texture((ctx) => {
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    gradient.addColorStop(0, '#fffce7');
    gradient.addColorStop(0.2, '#ffe3a0');
    gradient.addColorStop(0.5, 'rgba(255,185,72,0.5)');
    gradient.addColorStop(1, 'rgba(255,185,72,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  });

  function pool(size, make) {
    let cursor = 0;
    const slots = Array.from({ length: size }, () => {
      const slot = make(); slot.life = 0; slot.object.visible = false;
      root.add(slot.object); return slot;
    });
    return { slots, take(life) {
      const slot = slots[cursor]; cursor = (cursor + 1) % size;
      slot.life = slot.duration = life; slot.object.visible = true; return slot;
    } };
  }

  const streaks = pool(24, () => {
    const object = new THREE.Group();
    object.name = 'bullet-tracer';
    const glow = new THREE.Mesh(cylinder, material({ color: '#ffbd59', opacity: 0.65 }));
    const core = new THREE.Mesh(cylinder, material({ color: '#fff6cb', opacity: 1 }));
    core.scale.set(0.5, 1, 0.5);
    glow.renderOrder = 1; core.renderOrder = 2;
    object.add(glow, core);
    return { object, glow, core, start: new THREE.Vector3(), direction: new THREE.Vector3(), distance: 0, speed: 0 };
  });
  const marks = pool(64, () => ({ object: new THREE.Mesh(plane, material({ map: markTexture, alphaTest: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })) }));
  const flashes = pool(16, () => ({ object: new THREE.Mesh(plane, material({ map: flashTexture })) }));
  const dust = pool(24, () => ({ object: new THREE.Mesh(plane, material({ map: dustTexture })), velocity: new THREE.Vector3() }));
  const fragments = pool(96, () => ({ object: new THREE.Mesh(chip, material({ color: '#e5b778' })), velocity: new THREE.Vector3(), size: 0 }));
  const pools = [streaks, marks, flashes, dust, fragments];

  function placeStreak(streak) {
    // A short pulse moves down the shot path; neither end can extend past the
    // muzzle or hit point. Damage and impact feedback remain immediate hitscan.
    const head = Math.min(streak.distance, Math.min(TRACER_LENGTH, streak.distance) + (streak.duration - streak.life) * streak.speed);
    const tail = Math.max(0, head - TRACER_LENGTH);
    const tip = Math.min(streak.distance, head);
    streak.object.position.copy(streak.start).addScaledVector(streak.direction, (tail + tip) / 2);
    // A millimetre-wide world mesh disappears at range, especially on low
    // resolution settings. Keep a 3.2-pixel glow and a 1.6-pixel bright core.
    camera.updateWorldMatrix(true, false);
    viewPosition.copy(streak.object.position).applyMatrix4(camera.matrixWorldInverse);
    const depth = Math.max(camera.near, -viewPosition.z);
    const width = Math.max(0.0005, 3.2 * depth / (Math.max(1, viewportHeight()) * camera.projectionMatrix.elements[5]));
    streak.object.scale.set(width, Math.max(0, tip - tail), width);
    const opacity = Math.min(1, streak.life / (streak.duration * 0.4));
    streak.glow.material.opacity = opacity * 0.65;
    streak.core.material.opacity = opacity;
  }

  function shoot(event, { origin, tracer = true } = {}) {
    if (!event.from || !event.to) return;
    end.set(event.to.x, event.to.y, event.to.z);
    direction.copy(end).sub(event.from);
    const distance = direction.length();
    if (tracer && distance > 0.01) {
      // Avoid placing the muzzle beyond a surface at point-blank range.
      const start = origin && distance > origin.distanceTo(event.from) + 0.1 ? origin : event.from;
      direction.copy(end).sub(start);
      const length = direction.length();
      // Effects advance before rendering. Give even a nearby hit several
      // display frames, instead of expiring between receipt and the first draw.
      const streak = streaks.take(Math.max(0.09, Math.min(0.13, length / 160)));
      streak.start.copy(start);
      streak.direction.copy(direction).normalize();
      streak.distance = length;
      streak.speed = Math.max(0, length - TRACER_LENGTH) / streak.duration;
      streak.object.quaternion.setFromUnitVectors(up, streak.direction);
      placeStreak(streak);
    }
    if (!event.surface) return;
    normal.set(event.surface.normal.x, event.surface.normal.y, event.surface.normal.z).normalize();
    if (normal.lengthSq() < 0.5) return;
    rotation.setFromUnitVectors(front, normal);
    const mark = marks.take(12);
    mark.object.position.copy(end).addScaledVector(normal, 0.008);
    mark.object.quaternion.copy(rotation);
    mark.object.rotateZ(Math.random() * Math.PI * 2);
    mark.object.scale.setScalar(0.25 + Math.random() * 0.08);
    mark.object.material.opacity = 1;
    const flash = flashes.take(0.12);
    flash.object.position.copy(end).addScaledVector(normal, 0.018);
    flash.object.quaternion.copy(rotation);
    flash.object.scale.setScalar(0.55);
    flash.object.material.opacity = 1;
    const puff = dust.take(0.48);
    puff.object.position.copy(end).addScaledVector(normal, 0.05);
    puff.object.quaternion.copy(camera.quaternion);
    puff.object.scale.setScalar(0.4);
    puff.object.material.opacity = 0.9;
    puff.velocity.copy(normal).multiplyScalar(0.8);
    for (let i = 0; i < 6; i++) {
      const fragment = fragments.take(i < 2 ? 0.16 : 0.38 + Math.random() * 0.15);
      fragment.object.position.copy(end).addScaledVector(normal, 0.035);
      fragment.velocity.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2).applyQuaternion(rotation);
      fragment.size = i < 2 ? 0.035 : 0.022 + Math.random() * 0.025;
      fragment.object.scale.setScalar(fragment.size);
      fragment.object.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      fragment.object.material.color.set(i < 2 ? '#fff0b0' : '#af9674');
      fragment.object.material.opacity = 1;
    }
  }

  function update(delta) {
    for (const set of pools) for (const slot of set.slots) {
      if (slot.life <= 0) continue;
      slot.life = Math.max(0, slot.life - delta);
      slot.object.visible = slot.life > 0;
    }
    for (const slot of streaks.slots) if (slot.life > 0) placeStreak(slot);
    for (const slot of marks.slots) if (slot.life > 0) slot.object.material.opacity = Math.min(1, slot.life / 3);
    for (const slot of flashes.slots) if (slot.life > 0) slot.object.material.opacity = slot.life / slot.duration;
    for (const slot of dust.slots) if (slot.life > 0) {
      slot.object.position.addScaledVector(slot.velocity, delta);
      slot.object.quaternion.copy(camera.quaternion);
      slot.object.scale.setScalar(0.4 + (1 - slot.life / slot.duration) * 0.85);
      slot.object.material.opacity = 0.9 * slot.life / slot.duration;
    }
    for (const slot of fragments.slots) if (slot.life > 0) {
      slot.object.position.addScaledVector(slot.velocity, delta);
      slot.velocity.y -= 5 * delta;
      slot.object.rotation.x += delta * 8;
      slot.object.scale.setScalar(slot.size * Math.min(1, slot.life / 0.15));
    }
  }

  function clear() {
    for (const set of pools) for (const slot of set.slots) { slot.life = 0; slot.object.visible = false; }
  }

  return { shoot, update, clear, dispose() {
    scene.remove(root);
    cylinder.dispose(); plane.dispose(); chip.dispose();
    materials.forEach((value) => value.dispose());
    textures.forEach((value) => value.dispose());
  } };
}
