import * as THREE from 'three';
import { createAvatar } from './arena.js';
import { CLASSES } from '../shared/classes.js';
import { disposeModel } from './game-models.js';

// Render the actual models once; the class cards reuse these small images.
export function createCharacterPortraits(renderer, environment = null) {
  const width = 224, height = 280;
  const previousTarget = renderer.getRenderTarget();
  const previousFace = renderer.getActiveCubeFace();
  const previousLevel = renderer.getActiveMipmapLevel();
  const previousSize = renderer.getSize(new THREE.Vector2());
  const previousRatio = renderer.getPixelRatio();
  const previousViewport = renderer.getViewport(new THREE.Vector4());
  const previousScissor = renderer.getScissor(new THREE.Vector4());
  const previousScissorTest = renderer.getScissorTest();
  const previousAutoClear = renderer.autoClear;
  const scene = new THREE.Scene();
  scene.environment = environment;
  scene.environmentIntensity = 0.045;
  scene.background = new THREE.Color('#1b2d29');
  scene.add(new THREE.HemisphereLight('#e3f1fa', '#304135', 1.45));
  const light = new THREE.DirectionalLight('#fff0d5', 3.1);
  light.position.set(-3, 5, -4);
  scene.add(light);
  const fill = new THREE.DirectionalLight('#d7e8f4', 0.8);
  fill.position.set(3, 2, -3);
  scene.add(fill);
  const rim = new THREE.DirectionalLight('#b8ddd5', 1.8);
  rim.position.set(3, 3, 2);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(25, width / height, 0.05, 20);
  camera.position.set(-0.9, 1.59, -2.18);
  camera.lookAt(0, 1.37, -0.03);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  const portraits = new Map();
  try {
    // Render to the normal canvas so portraits get the same ACES exposure and
    // antialiasing as gameplay. Ordinary render targets bypass tone mapping.
    renderer.setRenderTarget(null);
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.setViewport(0, 0, width, height);
    renderer.setScissorTest(false);
    renderer.autoClear = true;
    for (const loadout of Object.values(CLASSES)) {
      const model = createAvatar(loadout.color, loadout.id);
      scene.add(model);
      try {
        renderer.render(scene, camera);
        context.drawImage(renderer.domElement, 0, 0, width, height);
        portraits.set(loadout.id, canvas.toDataURL('image/png'));
      } finally {
        disposeModel(model);
      }
    }
  } finally {
    renderer.setPixelRatio(previousRatio);
    renderer.setSize(previousSize.x, previousSize.y, false);
    renderer.setViewport(previousViewport);
    renderer.setScissor(previousScissor);
    renderer.setScissorTest(previousScissorTest);
    renderer.setRenderTarget(previousTarget, previousFace, previousLevel);
    renderer.autoClear = previousAutoClear;
  }
  return portraits;
}
