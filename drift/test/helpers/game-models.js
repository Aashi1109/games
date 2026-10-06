import { readFile } from 'node:fs/promises';
import { Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { loadGameModels } from '../../client/game-models.js';

export async function loadTestGameModels() {
  const parser = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  // Node tests exercise real geometry, rigs and material bindings without a DOM
  // image decoder. Browser checks cover the actual atlas pixels.
  parser.register((gltf) => {
    gltf.loadTexture = () => Promise.resolve(new Texture({ width: 1, height: 1 }));
    return { name: 'test-image-decoding' };
  });
  const loader = {
    async loadAsync(url) {
      const bytes = await readFile(new URL(url));
      return parser.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    },
  };
  await Promise.all(['assault', 'sniper', 'scout', 'heavy'].map((id) => loadGameModels(id, loader)));
}
