import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Independent audit of a lossless source-triangle partition. A manifest records
// each output's source triangle IDs, followed optionally by new repair faces.
// Usage: node scripts/validate-tripo.mjs <manifest.json> [report.json]
// Source-only: node scripts/validate-tripo.mjs --source-only <source.glb>
// Any GLB: node scripts/validate-tripo.mjs --asset <asset.glb> [report.json]
// Bodies: node scripts/validate-tripo.mjs --bodies <manifest.json> [report.json]
const sha256 = data => createHash('sha256').update(data).digest('hex');
const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const readers = { 5120: ['getInt8', 1], 5121: ['getUint8', 1], 5122: ['getInt16', 2], 5123: ['getUint16', 2], 5125: ['getUint32', 4], 5126: ['getFloat32', 4] };
await MeshoptDecoder.ready;

async function loadGLB(file, allowMany = false) {
  const bytes = await readFile(file);
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error(`Invalid GLB header: ${file}`);
  let json, bin;
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString());
    if (type === 0x004e4942) bin = data;
    offset += length + 8;
  }
  if (!json || !bin) throw new Error(`Missing embedded JSON or BIN chunk: ${file}`);
  const cache = new Map();
  function view(index) {
    if (cache.has(index)) return cache.get(index);
    const spec = json.bufferViews[index], ext = spec.extensions?.EXT_meshopt_compression;
    let data;
    if (ext) {
      if (ext.buffer !== 0) throw new Error('External compressed buffers are unsupported');
      data = new Uint8Array(ext.count * ext.byteStride);
      MeshoptDecoder.decodeGltfBuffer(data, ext.count, ext.byteStride, bin.subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength), ext.mode, ext.filter ?? 'NONE');
    } else {
      if (spec.buffer !== 0) throw new Error('External buffers are unsupported');
      data = bin.subarray(spec.byteOffset ?? 0, (spec.byteOffset ?? 0) + spec.byteLength);
    }
    cache.set(index, data);
    return data;
  }
  function accessor(index) {
    const spec = json.accessors[index];
    if (spec.sparse) throw new Error('Sparse accessor unsupported by this audit');
    const data = view(spec.bufferView), reader = readers[spec.componentType];
    if (!reader || !widths[spec.type]) throw new Error('Unsupported accessor format');
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength), width = widths[spec.type];
    const stride = json.bufferViews[spec.bufferView].byteStride ?? reader[1] * width;
    const values = spec.componentType === 5125 ? new Uint32Array(spec.count * width) : new Float64Array(spec.count * width);
    for (let row = 0; row < spec.count; row++) for (let col = 0; col < width; col++) {
      const raw = dv[reader[0]]((spec.byteOffset ?? 0) + row * stride + col * reader[1], true);
      values[row * width + col] = spec.normalized ? spec.componentType === 5120 ? Math.max(-1, raw / 127) : spec.componentType === 5121 ? raw / 255 : spec.componentType === 5122 ? Math.max(-1, raw / 32767) : raw / 65535 : raw;
    }
    return values;
  }
  const meshes = json.meshes ?? [];
  if (!allowMany && (meshes.length !== 1 || meshes[0].primitives.length !== 1)) throw new Error(`Expected one mesh primitive: ${file}`);
  const primitives = meshes.flatMap(mesh => mesh.primitives.map(primitive => {
    if ((primitive.mode ?? 4) !== 4) throw new Error('Expected triangle geometry');
    const positions = accessor(primitive.attributes.POSITION);
    const uv = primitive.attributes.TEXCOORD_0 === undefined ? null : accessor(primitive.attributes.TEXCOORD_0);
    const normals = primitive.attributes.NORMAL === undefined ? null : accessor(primitive.attributes.NORMAL);
    const indices = primitive.indices === undefined ? Uint32Array.from({ length: positions.length / 3 }, (_, i) => i) : accessor(primitive.indices);
    return { name: mesh.name, positions, indices, uv, normals };
  }));
  const embeddedImages = (json.images ?? []).map(image => {
    if (image.bufferView === undefined) throw new Error(`External image unsupported in master audit: ${file}`);
    return { mimeType: image.mimeType, sha256: sha256(view(image.bufferView)), bytes: view(image.bufferView).length };
  });
  const materialSignature = sha256(JSON.stringify({ materials: json.materials, textures: json.textures, samplers: json.samplers, images: embeddedImages }));
  return { file, bytes: bytes.length, sha256: sha256(bytes), json, embeddedImages, materialSignature, ...primitives[0], primitives };
}

function triangleDataSha256({ positions, indices, uv }) {
  // Expanded corners make the hash independent of vertex indexing/deduplication.
  const hash = createHash('sha256'), scratch = Buffer.alloc(8 * 5 * 1024);
  let offset = 0;
  for (const index of indices) {
    for (let k = 0; k < 3; k++) { scratch.writeDoubleLE(positions[index * 3 + k], offset); offset += 8; }
    for (let k = 0; k < 2; k++) { scratch.writeDoubleLE(uv?.[index * 2 + k] ?? 0, offset); offset += 8; }
    if (offset === scratch.length) { hash.update(scratch); offset = 0; }
  }
  if (offset) hash.update(scratch.subarray(0, offset));
  return hash.digest('hex');
}

function audit(model) {
  const { positions: p, indices: ix, uv, normals } = model;
  const triangles = ix.length / 3, vertices = p.length / 3;
  if (!Number.isInteger(triangles)) throw new Error('Index count is not divisible by three');
  let nonfinite = 0, invalidIndices = 0, degenerateTriangles = 0, zeroNormals = 0;
  for (const array of [p, uv, normals].filter(Boolean)) for (const value of array) if (!Number.isFinite(value)) nonfinite++;
  if (normals) for (let i = 0; i < normals.length; i += 3) if (normals[i] ** 2 + normals[i + 1] ** 2 + normals[i + 2] ** 2 === 0) zeroNormals++;
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const welded = new Uint32Array(vertices), positionIds = new Map(), uniquePositions = [];
  for (let i = 0; i < vertices; i++) {
    const key = `${p[3 * i]},${p[3 * i + 1]},${p[3 * i + 2]}`;
    if (!positionIds.has(key)) { positionIds.set(key, positionIds.size); uniquePositions.push([p[3 * i], p[3 * i + 1], p[3 * i + 2]]); }
    welded[i] = positionIds.get(key);
    for (let k = 0; k < 3; k++) { bounds.min[k] = Math.min(bounds.min[k], p[3 * i + k]); bounds.max[k] = Math.max(bounds.max[k], p[3 * i + k]); }
  }
  // Integer pair keys fit exactly in JavaScript's 53-bit safe integer range here.
  const edgeBase = positionIds.size, edges = new Map(), parents = Uint32Array.from({ length: edgeBase }, (_, i) => i);
  const findRoot = i => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
  for (let t = 0; t < triangles; t++) {
    const corners = [ix[t * 3], ix[t * 3 + 1], ix[t * 3 + 2]];
    if (corners.some(i => i >= vertices || i < 0 || !Number.isInteger(i))) { invalidIndices++; continue; }
    const [a, b, c] = corners.map(i => i * 3);
    const ab = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]], ac = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    if ((ab[1] * ac[2] - ab[2] * ac[1]) ** 2 + (ab[2] * ac[0] - ab[0] * ac[2]) ** 2 + (ab[0] * ac[1] - ab[1] * ac[0]) ** 2 === 0) degenerateTriangles++;
    for (let k = 0; k < 3; k++) {
      const x = welded[corners[k]], y = welded[corners[(k + 1) % 3]], key = Math.min(x, y) * edgeBase + Math.max(x, y);
      // Pack occurrence count and oriented edge balance into a single integer.
      edges.set(key, (edges.get(key) ?? 0) + 1024 + (x < y ? 1 : -1));
      const rootX = findRoot(x), rootY = findRoot(y); if (rootX !== rootY) parents[rootY] = rootX;
    }
  }
  const components = new Map();
  for (let t = 0; t < triangles; t++) {
    const root = findRoot(welded[ix[t * 3]]);
    if (!components.has(root)) components.set(root, { triangles: 0, firstTriangle: t, lastTriangle: t });
    const component = components.get(root); component.triangles++; component.lastTriangle = t;
  }
  const componentDetails = [...components.values()].sort((a, b) => b.triangles - a.triangles);
  let openEdges = 0, nonmanifoldEdges = 0, inconsistentWindingEdges = 0;
  const boundaryBounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const boundaryVertices = new Set(), topologyDefects = [];
  for (const [key, packed] of edges) {
    const count = Math.round(packed / 1024), orientation = packed - count * 1024;
    const a = Math.floor(key / edgeBase), b = key % edgeBase;
    if (count === 1) { openEdges++; boundaryVertices.add(a); boundaryVertices.add(b); }
    if (count > 2) nonmanifoldEdges++;
    if (count === 2 && orientation !== 0) inconsistentWindingEdges++;
    if (count !== 2 || orientation !== 0) topologyDefects.push({ count, orientation, endpoints: [uniquePositions[a], uniquePositions[b]] });
  }
  for (let i = 0; i < vertices; i++) if (boundaryVertices.has(welded[i])) for (let k = 0; k < 3; k++) { boundaryBounds.min[k] = Math.min(boundaryBounds.min[k], p[i * 3 + k]); boundaryBounds.max[k] = Math.max(boundaryBounds.max[k], p[i * 3 + k]); }
  const primitive = model.json.meshes[0].primitives[0];
  return { bytes: model.bytes, sha256: model.sha256, triangles, vertices, weldedVertices: positionIds.size, bounds, nonfinite, invalidIndices, degenerateTriangles, zeroNormals, connectedComponents: components.size, componentTriangleCounts: componentDetails.map(c => c.triangles), componentDetails, openEdges, nonmanifoldEdges, inconsistentWindingEdges, boundaryBounds: openEdges ? boundaryBounds : null, topologyDefects, skins: model.json.skins?.length ?? 0, animations: model.json.animations?.length ?? 0, morphTargets: primitive.targets?.length ?? 0, images: model.json.images?.length ?? 0, materials: model.json.materials?.length ?? 0 };
}

function assert(condition, message) { if (!condition) throw new Error(message); }
function transformPosition(p, i, matrix) {
  const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
  return matrix ? [matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12], matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13], matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]] : [x, y, z];
}

export { loadGLB, audit, triangleDataSha256 };
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
const args = process.argv.slice(2);
if (args[0] === '--source-only') {
  console.log(JSON.stringify(audit(await loadGLB(resolve(args[1]))), null, 2));
} else if (args[0] === '--asset') {
  const model = await loadGLB(resolve(args[1]), true);
  const report = { file: model.file, bytes: model.bytes, sha256: model.sha256, primitives: model.primitives.map((primitive, index) => ({ id: primitive.name ?? `primitive-${index}`, ...audit({ ...model, ...primitive }) })) };
  if (args[2]) await writeFile(resolve(args[2]), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(args[2] ? { file: model.file, primitives: report.primitives.map(({ id, triangles, connectedComponents, nonfinite, invalidIndices, degenerateTriangles, openEdges, nonmanifoldEdges, inconsistentWindingEdges }) => ({ id, triangles, connectedComponents, nonfinite, invalidIndices, degenerateTriangles, openEdges, nonmanifoldEdges, inconsistentWindingEdges })), report: resolve(args[2]) } : report, null, 2));
} else {
  const bodyOnly = args[0] === '--bodies', manifestArg = args[bodyOnly ? 1 : 0], reportArg = args[bodyOnly ? 2 : 1];
  if (!manifestArg) throw new Error('Pass manifest.json or --source-only source.glb');
  const manifestFile = resolve(manifestArg), root = dirname(manifestFile), manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  const source = await loadGLB(resolve(root, manifest.source.file));
  assert(source.sha256 === manifest.source.sha256, 'Source checksum changed from the recorded original');
  const pieces = bodyOnly ? manifest.pieces.filter(p => p.id.endsWith('-body')) : manifest.pieces;
  assert(pieces.length === (bodyOnly ? 4 : 8), bodyOnly ? 'Exactly four body pieces are required' : 'Exactly eight master pieces are required');
  const expectedIds = ['ember', 'wisp', 'dash', 'rook'].flatMap(c => bodyOnly ? [`${c}-body`] : [`${c}-body`, `${c}-gun`]);
  assert(expectedIds.every(id => pieces.filter(p => p.id === id).length === 1), 'Missing or repeated required character pieces');
  const sourceAudit = audit(source);
  const ownership = new Uint8Array(source.indices.length / 3), reports = [];
  const repairs = manifest.repairedSourceTriangles ?? (manifest.repairedSourceTriangleIds ?? []).map(id => ({ id, reason: manifest.sourceRepairReason ?? manifest.repairReason ?? (id === 1930308 ? 'Original dangling Dash triangle attached as a third face to an already closed edge' : null) }));
  for (const repair of repairs) {
    assert(Number.isInteger(repair.id) && repair.id >= 0 && repair.id < ownership.length && repair.reason, 'Every omitted structural-defect face needs its original ID and reason');
    assert(ownership[repair.id] === 0, 'Repeated repair triangle ID');
    ownership[repair.id] = 1;
  }
  for (const piece of pieces) {
    const model = await loadGLB(resolve(root, piece.file));
    const report = { id: piece.id, file: piece.file, ...audit(model), triangleDataSha256: triangleDataSha256(model), materialSignature: model.materialSignature, embeddedImages: model.embeddedImages };
    assert(report.nonfinite === 0 && report.invalidIndices === 0 && report.degenerateTriangles === 0 && report.zeroNormals === 0, `${piece.id}: invalid geometry or normals`);
    report.reconstructedParts = piece.reconstructedParts ?? [];
    report.smallComponentConcerns = report.componentDetails.filter(component => component.triangles < 100 && !report.reconstructedParts.some(part => part.firstTriangle === component.firstTriangle && part.firstTriangle + part.triangles - 1 === component.lastTriangle && part.triangles === component.triangles));
    assert(report.openEdges === 0 && report.nonmanifoldEdges === 0, `${piece.id}: ${report.openEdges} open and ${report.nonmanifoldEdges} nonmanifold edges; close split boundaries before optimization`);
    const defectKey = defect => `${defect.count}:${Math.abs(defect.orientation)}:${defect.endpoints.map(p => p.join(',')).sort().join('|')}`;
    const baselineDefects = new Set(sourceAudit.topologyDefects.map(defectKey));
    report.newTopologyDefects = report.topologyDefects.filter(defect => !baselineDefects.has(defectKey(defect))).length;
    assert(report.newTopologyDefects === 0, `${piece.id}: ${report.newTopologyDefects} new open or nonmanifold edges; close split boundaries before optimization`);
    assert(report.skins === 0 && report.animations === 0, `${piece.id}: unexpected rig/animation changes`);
    assert(report.images > 0 && model.uv, `${piece.id}: missing embedded textures or UVs`);
    const idBytes = await readFile(resolve(root, piece.sourceTriangleIds));
    assert(idBytes.length % 4 === 0, `${piece.id}: invalid source triangle ID file`);
    const ids = new Uint32Array(idBytes.buffer.slice(idBytes.byteOffset, idBytes.byteOffset + idBytes.byteLength));
    const addedTriangles = piece.addedTriangles ?? 0;
    assert(ids.length + addedTriangles === report.triangles, `${piece.id}: source plus repair face count does not match output`);
    let mismatchedTriangles = 0, uvMismatches = 0;
    for (let t = 0; t < ids.length; t++) {
      const src = ids[t];
      assert(src < ownership.length, `${piece.id}: source triangle ID outside source range`);
      ownership[src]++;
      assert(ownership[src] === 1, `${piece.id}: source triangle ${src} assigned more than once`);
      let positionMatches = false, uvMatches = false;
      for (let rotation = 0; rotation < 3; rotation++) {
        let posOk = true, uvOk = true;
        for (let corner = 0; corner < 3; corner++) {
          const si = source.indices[src * 3 + (corner + rotation) % 3], oi = model.indices[t * 3 + corner];
          const expected = transformPosition(source.positions, si, piece.sourceToLocalMatrix);
          for (let k = 0; k < 3; k++) if (Math.abs(expected[k] - model.positions[oi * 3 + k]) > 1e-6) posOk = false;
          if (source.uv && model.uv) for (let k = 0; k < 2; k++) if (Math.abs(source.uv[si * 2 + k] - model.uv[oi * 2 + k]) > 1e-6) uvOk = false;
        }
        if (posOk) { positionMatches = true; if (uvOk) uvMatches = true; }
      }
      if (!positionMatches) mismatchedTriangles++;
      if (!uvMatches) uvMismatches++;
    }
    report.sourceTriangles = ids.length; report.addedTriangles = addedTriangles;
    report.mismatchedTriangles = mismatchedTriangles; report.uvMismatches = uvMismatches;
    assert(mismatchedTriangles === 0 && uvMismatches === 0, `${piece.id}: exported triangles differ from claimed original positions/UVs`);
    reports.push(report);
    console.error(`${piece.id}: ${report.triangles} triangles, ${report.openEdges} open edges, source geometry/UVs verified`);
  }
  const unassignedSourceTriangles = ownership.reduce((n, count) => n + (count === 0), 0);
  const missingTriangles = bodyOnly ? null : unassignedSourceTriangles;
  if (!bodyOnly) assert(missingTriangles === 0, `${missingTriangles} original triangles missing from split`);
  let combined = null;
  const combinedFile = manifest.combinedFile ?? manifest.combined;
  if (combinedFile && (!bodyOnly || manifest.packKind === 'character-body-masters')) {
    const model = await loadGLB(resolve(root, combinedFile), true);
    assert(model.primitives.length === pieces.length, `Combined master must contain exactly ${pieces.length} primitives`);
    assert((model.json.skins?.length ?? 0) === 0 && (model.json.animations?.length ?? 0) === 0, 'Combined master unexpectedly changes rig/animation data');
    const expected = reports.map(p => p.triangleDataSha256).sort(), actual = model.primitives.map(triangleDataSha256).sort();
    assert(expected.every((hash, index) => hash === actual[index]), 'Combined master geometry/UVs differ from separately validated pieces');
    assert(reports.every(piece => piece.materialSignature === model.materialSignature), 'Combined master texture bytes or material bindings differ from standalone pieces');
    combined = { file: combinedFile, sha256: model.sha256, bytes: model.bytes, primitives: pieces.length, triangles: model.primitives.reduce((n, p) => n + p.indices.length / 3, 0), matchedStandaloneGeometry: true, matchedStandaloneMaterialsAndImages: true, materialSignature: model.materialSignature, embeddedImages: model.embeddedImages };
  }
  const report = { schemaVersion: 1, validatedAt: new Date().toISOString(), validationKind: bodyOnly ? 'four-body-source-preservation' : 'master-partition-with-tracked-repairs', source: { file: manifest.source.file, sha256: source.sha256, triangles: ownership.length, topologyDefects: sourceAudit.topologyDefects }, missingTriangles, unassignedSourceTriangles, coverageScope: bodyOnly ? 'Body subset only; weapon source triangles intentionally outside this audit' : 'Complete original source except tracked structural repair', duplicateTriangles: 0, omittedDefectiveSourceTriangles: repairs, pieces: reports, combined, visualReviewRequired: bodyOnly ? ['no remaining weapon fragments', 'preserved hands and clothing', 'skin and clothing colors under matched lighting', 'standalone GLB rendering', 'post-repair cap surface appearance'] : ['gun/body contact boundaries', 'no fingers or clothing assigned to guns', 'skin and clothing colors under matched lighting', 'standalone GLB rendering', 'post-repair cap topology if present'], passedStructuralValidation: true };
  if (reportArg) await writeFile(resolve(reportArg), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(reportArg ? { passedStructuralValidation: report.passedStructuralValidation, validationKind: report.validationKind, pieces: reports.length, sourceTriangles: ownership.length, missingTriangles, duplicateTriangles: 0, omittedDefectiveSourceTriangles: repairs.map(r => r.id), outputTriangles: reports.reduce((n, p) => n + p.triangles, 0), combined, report: resolve(reportArg), visualReviewRequired: report.visualReviewRequired } : report, null, 2));
}

}
