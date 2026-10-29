import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

// Bake the sky once: clouds and atmospheric light need no per-frame noise or
// asset requests. Every map shares this small background and reflection map.
export function createDaylight(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  const sky = new Sky();
  sky.scale.setScalar(1000);
  const uniforms = sky.material.uniforms;
  uniforms.sunPosition.value.set(-28, 48, 22);
  uniforms.turbidity.value = 4;
  uniforms.rayleigh.value = 2;
  uniforms.cloudCoverage.value = 0.48;
  uniforms.cloudDensity.value = 0.55;
  scene.add(sky);
  const background = new THREE.WebGLCubeRenderTarget(256, {
    type: THREE.HalfFloatType,
  });
  new THREE.CubeCamera(0.1, 2000, background).update(renderer, scene);
  const generator = new THREE.PMREMGenerator(renderer);
  const reflections = generator.fromCubemap(background.texture);
  generator.dispose();
  sky.geometry.dispose();
  sky.material.dispose();
  return {
    background: background.texture,
    environment: reflections.texture,
    dispose() {
      background.dispose();
      reflections.dispose();
    },
  };
}
