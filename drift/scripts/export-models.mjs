import { mkdir, writeFile } from 'node:fs/promises';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { WEAPON_MODELS, createWeaponModel } from '../client/weapon-models.js';
import { createCharacterModel } from '../client/character-models.js';

// The exporter uses the browser FileReader API for binary blobs. These models
// have no images, so Node only needs this small ArrayBuffer adapter.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    }, (error) => { this.error = error; this.onerror?.(error); });
  }
};

const output = new URL('../output/models/', import.meta.url);
await mkdir(output, { recursive: true });
const exporter = new GLTFExporter();
const manifest = {};
for (const id of Object.keys(WEAPON_MODELS)) {
  for (const [kind, create] of [['weapon', createWeaponModel], ['character', createCharacterModel]]) {
    const model = create(id);
    let triangles = 0;
    let meshes = 0;
    model.traverse((part) => {
      if (!part.isMesh) return;
      meshes++;
      triangles += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3;
    });
    // Export only serializable metadata; runtime articulation references can
    // contain parents and circular graphs and are not part of the asset.
    model.traverse((part) => { part.userData = {}; });
    const data = await exporter.parseAsync(model, { binary: true });
    const file = `${id}-${kind}.glb`;
    await writeFile(new URL(file, output), Buffer.from(data));
    manifest[`${id}-${kind}`] = { file, triangles, meshes, bytes: data.byteLength };
    model.traverse((part) => {
      if (part.isMesh) { part.geometry.dispose(); part.material.dispose(); }
    });
  }
}
await writeFile(new URL('manifest.json', output), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
