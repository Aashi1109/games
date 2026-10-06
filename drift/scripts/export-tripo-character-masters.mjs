import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, resolve } from 'node:path';

const sourceDir = resolve('output/models/tripo-master');
const outputDir = resolve('output/models/tripo-characters-master');
const hash = data => createHash('sha256').update(data).digest('hex');
const manifest = JSON.parse(await readFile(`${sourceDir}/manifest.json`, 'utf8'));
const sourceFile = manifest.combinedFile ?? manifest.combined;
const original = await readFile(sourceFile);
const jsonLength = original.readUInt32LE(12);
const doc = JSON.parse(original.subarray(20, 20 + jsonLength).toString());
const bin = original.subarray(28 + jsonLength);
const ids = ['ember-body', 'wisp-body', 'dash-body', 'rook-body'];
const meshes = ids.map(id => {
  const mesh = doc.meshes.find(mesh => mesh.name === id);
  if (!mesh) throw new Error(`Missing body ${id}`);
  return structuredClone(mesh);
});
const accessorIds = new Set();
for (const mesh of meshes) for (const primitive of mesh.primitives) {
  Object.values(primitive.attributes).forEach(id => accessorIds.add(id));
  if (primitive.indices !== undefined) accessorIds.add(primitive.indices);
}
const accessorMap = new Map([...accessorIds].map((id, index) => [id, index]));
const accessors = [...accessorIds].map(id => structuredClone(doc.accessors[id]));
const viewIds = new Set(accessors.map(accessor => accessor.bufferView));
for (const image of doc.images ?? []) if (image.bufferView !== undefined) viewIds.add(image.bufferView);
const viewMap = new Map([...viewIds].map((id, index) => [id, index]));
let byteLength = 0;
const chunks = [], bufferViews = [];
for (const id of viewIds) {
  const source = doc.bufferViews[id];
  if (source.buffer !== 0 || source.extensions) throw new Error('Expected the decoded single-buffer master');
  const padding = (4 - byteLength % 4) % 4;
  if (padding) { chunks.push(Buffer.alloc(padding)); byteLength += padding; }
  bufferViews.push({ ...source, buffer: 0, byteOffset: byteLength });
  chunks.push(bin.subarray(source.byteOffset ?? 0, (source.byteOffset ?? 0) + source.byteLength));
  byteLength += source.byteLength;
}
for (const accessor of accessors) accessor.bufferView = viewMap.get(accessor.bufferView);
for (const mesh of meshes) for (const primitive of mesh.primitives) {
  for (const name of Object.keys(primitive.attributes)) primitive.attributes[name] = accessorMap.get(primitive.attributes[name]);
  if (primitive.indices !== undefined) primitive.indices = accessorMap.get(primitive.indices);
}
const images = (doc.images ?? []).map(image => ({ ...image, ...(image.bufferView === undefined ? {} : { bufferView: viewMap.get(image.bufferView) }) }));
const bodyDoc = {
  ...doc, asset: { ...doc.asset, generator: 'DRIFT validated character-body master pack' },
  scenes: [{ nodes: [0, 1, 2, 3] }], scene: 0,
  nodes: ids.map((id, index) => ({ name: id, mesh: index, extras: { character: id.split('-')[0], part: 'body' } })),
  meshes, accessors, bufferViews, images, buffers: [{ byteLength }],
};
const json = Buffer.from(JSON.stringify(bodyDoc));
const paddedJson = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
const bodyBin = Buffer.concat([...chunks, Buffer.alloc((4 - byteLength % 4) % 4)]);
const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + paddedJson.length + bodyBin.length, 8);
header.writeUInt32LE(paddedJson.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
binHeader.writeUInt32LE(bodyBin.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
const combined = Buffer.concat([header, paddedJson, binHeader, bodyBin]);
await mkdir(`${outputDir}/ownership`, { recursive: true });
const pieces = [];
for (const id of ids) {
  const source = manifest.pieces.find(piece => piece.id === id);
  const file = `${outputDir}/${id}.glb`;
  await copyFile(source.file, file);
  const sourceTriangleIds = `${outputDir}/ownership/${basename(source.sourceTriangleIds)}`;
  const sourceVertexIds = `${outputDir}/ownership/${basename(source.sourceVertexIds)}`;
  await copyFile(source.sourceTriangleIds, sourceTriangleIds);
  await copyFile(source.sourceVertexIds, sourceVertexIds);
  const bytes = await readFile(file), sourceBytes = await readFile(source.file);
  if (hash(bytes) !== hash(sourceBytes)) throw new Error(`Body copy changed: ${id}`);
  pieces.push({ ...source, file, sourceTriangleIds, sourceVertexIds, sha256: hash(bytes), copiedUnchangedFrom: source.file });
}
const combinedFile = `${outputDir}/characters-master.glb`;
await writeFile(combinedFile, combined);
const ownershipSource = resolve('output/models/tripo-working/triangle-ownership.npy');
const ownershipFile = `${outputDir}/ownership/final-source-partition.npy`;
await copyFile(ownershipSource, ownershipFile);
const sourceOwnership = { file: ownershipFile, sha256: hash(await readFile(ownershipFile)), copiedFrom: ownershipSource, scope: 'Full final eight-way source assignment retained as provenance; old gun meshes superseded.' };
const refinement = process.argv[2] ? resolve(process.argv[2]) : null;
const refinementEvidence = [];
if (refinement) for (const name of ['report.json', 'confirmed-weapon-source-faces.u32', 'triangle-ownership-candidate.npy']) {
  const from = `${refinement}/${name}`, to = `${outputDir}/ownership/rook-final-${name}`;
  await copyFile(from, to);
  refinementEvidence.push({ file: to, sha256: hash(await readFile(to)), copiedFrom: from });
}
const output = {
  ...manifest, packKind: 'character-body-masters', pieces, combinedFile, sourceOwnership, refinementEvidence,
  combinedSha256: hash(combined), sourceWorkingPack: { file: sourceFile, sha256: hash(original), status: 'superseded mixed working pack; extracted old weapons are not authoritative' },
};
delete output.combined;
await writeFile(`${outputDir}/manifest.json`, JSON.stringify(output, null, 2) + '\n');
await writeFile(`${sourceDir}/SUPERSEDED.md`, '# Superseded mixed working pack\n\nThis pack contains earlier experimental gun extractions. The user supplied a separate weapon source, so these old gun meshes are not the final weapons.\n\nThe authoritative character-only masters are in [../tripo-characters-master](../tripo-characters-master/). Their four standalone body GLBs are unchanged copies; the combined file contains only those four bodies and the shared embedded textures. Original Tripo downloads remain preserved separately.\n');
console.log(JSON.stringify({ outputDir, combinedFile, bytes: combined.length, sha256: hash(combined), bodies: pieces.map(p => ({ id: p.id, sha256: p.sha256 })) }, null, 2));
