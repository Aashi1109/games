import * as THREE from 'three';

export const PLAYER_LABEL_HEIGHT = 0.32;

export function createPlayerLabel(name, initialHealth = 100) {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, transparent: true, depthTest: true, depthWrite: false, toneMapped: false,
  }));
  sprite.scale.set(1.6, PLAYER_LABEL_HEIGHT, 1);
  sprite.position.y = 2.04;
  let displayedHealth = -1;

  function update(health) {
    const next = Number.isFinite(health) ? Math.ceil(Math.max(0, Math.min(100, health))) : 0;
    if (next === displayedHealth) return;
    displayedHealth = next;
    sprite.visible = next > 0;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.textAlign = 'center';
    context.font = '600 32px "Avenir Next", sans-serif';
    context.lineWidth = 2.5;
    context.lineJoin = 'round';
    context.strokeStyle = '#102017cc';
    context.shadowColor = '#102017';
    context.shadowBlur = 4;
    context.shadowOffsetY = 1;
    context.strokeText(String(name), 160, 33, 302);
    context.fillStyle = '#f5f2e8';
    context.fillText(String(name), 160, 33, 302);
    context.shadowBlur = 2;
    context.fillStyle = '#13251be6';
    context.fillRect(46, 45, 228, 6);
    context.fillStyle = next <= 35 ? '#ff836c' : next <= 60 ? '#f1c96d' : '#b5e9b4';
    context.fillRect(46, 45, 228 * next / 100, 6);
    texture.needsUpdate = true;
  }

  update(initialHealth);
  return { sprite, update };
}
