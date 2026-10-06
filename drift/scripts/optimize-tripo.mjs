/**
 * Optimize byte-for-byte COPIES of split assets, after an external validation gate.
 * Temporary authoring tools live outside the game dependencies:
 * mkdir -p /private/tmp/drift-tripo-tools
 * pnpm --dir /private/tmp/drift-tripo-tools add --save-exact \
 *   @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 \
 *   @gltf-transform/functions@4.5.1 meshoptimizer@1.3.0 sharp@0.35.5
 *
 * Gate JSON: {status:"passed", files:[{path:"/absolute/master.glb",sha256:"...",
 *   standalone:{scale:1,rotationYRadians:-1.5707963267948966,units:"source units"}}],
 *   protectedFiles:[{path:"/absolute/standalone-master.glb",sha256:"..."}]}
 * Run: node scripts/optimize-tripo.mjs --validation /absolute/validation.json
 * Sources: https://meshoptimizer.org/ and https://gltf-transform.dev/
 */
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const outputRoot = path.join(projectRoot, 'output/models/tripo-optimized');
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) => {
  if (arg.startsWith('--')) pairs.push([arg.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true]);
  return pairs;
}, []));
if (args.help || !args.validation) {
  console.log('Usage: node scripts/optimize-tripo.mjs --validation FILE [--character-triangles 30000] [--gun-triangles 4000] [--texture-size 2048] [--error 0.003] [--position-bits 16|32] [--label candidate-name] [--tools /private/tmp/drift-tripo-tools]');
  process.exit(args.help ? 0 : 1);
}
const positiveNumber = (name, fallback) => {
  const value = Number(args[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid --${name}`);
  return value;
};
const settings = {
  characterTriangles: Math.floor(positiveNumber('character-triangles', 30_000)),
  gunTriangles: Math.floor(positiveNumber('gun-triangles', 4_000)),
  textureSize: Math.floor(positiveNumber('texture-size', 2048)),
  errorLimit: positiveNumber('error', 0.003),
  positionBits: positiveNumber('position-bits', 32),
  topologyLock: !args['no-topology-lock'],
  normalWeight: 0.15,
  uvWeight: 1,
  flags: ['LockBorder'],
};
if (![16, 32].includes(settings.positionBits)) throw new Error('--position-bits must be 16 or 32');
const label = args.label ?? '';
if (label && !/^[a-z0-9][a-z0-9_-]*$/i.test(label)) throw new Error('Invalid candidate label');
const output = path.join(outputRoot, label);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gatePath = path.resolve(args.validation);
const gate = JSON.parse(await readFile(gatePath, 'utf8'));
if (gate.status !== 'passed' || !Array.isArray(gate.files) || !gate.files.length) {
  throw new Error('Optimization blocked: split validation must pass with a hashed files list.');
}
const names = new Set();
const protectedFiles = [...new Map([...gate.files, ...(gate.protectedFiles ?? [])].map((file) => [file.path, file])).values()];
for (const file of protectedFiles) {
  if (!path.isAbsolute(file.path) || !file.path.endsWith('.glb')) throw new Error('Gate paths must be absolute GLB paths.');
  if (path.resolve(file.path).startsWith(`${outputRoot}${path.sep}`)) throw new Error('Expected validated masters outside optimized output.');
  if (!/^[0-9a-f]{64}$/i.test(file.sha256)) throw new Error(`Missing SHA-256: ${file.path}`);
  if (hash(await readFile(file.path)) !== file.sha256) throw new Error(`Master changed since validation: ${file.path}`);
}
for (const file of gate.files) {
  if (names.has(path.basename(file.path))) throw new Error('Duplicate source basenames.');
  names.add(path.basename(file.path));
}

const requireTools = createRequire(path.join(path.resolve(args.tools ?? '/private/tmp/drift-tripo-tools'), 'package.json'));
const loadTool = (name) => import(pathToFileURL(requireTools.resolve(name)).href);
const [{ Document, NodeIO, getBounds }, { ALL_EXTENSIONS, EXTMeshoptCompression }, { compactPrimitive, copyToDocument, dequantize, meshopt, prune, quantize, reorder, textureCompress, weld },
  { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier }] = await Promise.all([
  loadTool('@gltf-transform/core'), loadTool('@gltf-transform/extensions'), loadTool('@gltf-transform/functions'), loadTool('meshoptimizer'),
]);
const sharp = requireTools('sharp');
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const summary = (document) => {
  const root = document.getRoot();
  let triangles = 0, vertices = 0;
  const meshes = root.listMeshes().map((mesh) => {
    let count = 0;
    for (const primitive of mesh.listPrimitives()) {
      count += (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount()) / 3;
      vertices += primitive.getAttribute('POSITION').getCount();
    }
    triangles += count;
    return { name: mesh.getName(), triangles: count };
  });
  return {
    triangles, vertices, meshes,
    bounds: getBounds(root.getDefaultScene() ?? root.listScenes()[0]),
    meshNodes: root.listNodes().filter((node) => node.getMesh()).map((node) => node.getName()).sort(),
    textures: root.listTextures().map((texture) => ({ name: texture.getName(), size: texture.getSize(), mime: texture.getMimeType(), bytes: texture.getImage()?.byteLength })),
  };
};

// Retain every node, material and texture relationship. Never flatten/join these
// meshes: bodies and guns need to remain independently selectable.
function simplify(document) {
  const results = [];
  for (const mesh of document.getRoot().listMeshes()) {
    const role = /gun|weapon|rifle|carbine|sniper|smg|lmg/i.test(mesh.getName()) ? 'gun' : 'character';
    const meshTriangles = mesh.listPrimitives().reduce((sum, primitive) => sum + primitive.getIndices().getCount() / 3, 0);
    const meshTarget = settings[role === 'gun' ? 'gunTriangles' : 'characterTriangles'];
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4 || primitive.listTargets().length) throw new Error(`Unsupported geometry: ${mesh.getName()}`);
      const positions = primitive.getAttribute('POSITION');
      const normals = primitive.getAttribute('NORMAL');
      const uv = primitive.getAttribute('TEXCOORD_0');
      if (!normals || !uv) throw new Error(`Expected normals and UVs: ${mesh.getName()}`);
      const indices = primitive.getIndices();
      const input = Uint32Array.from(indices.getArray());
      const target = Math.max(1, Math.min(input.length / 3, Math.round(meshTarget * (input.length / 3) / meshTriangles)));
      const attributes = new Float32Array(positions.getCount() * 5);
      const normalArray = normals.getArray(), uvArray = uv.getArray();
      for (let v = 0; v < positions.getCount(); v++) {
        attributes.set(normalArray.subarray(v * 3, v * 3 + 3), v * 5);
        attributes.set(uvArray.subarray(v * 2, v * 2 + 2), v * 5 + 3);
      }
      const positionArray = positions.getArray();
      const positionRemap = settings.topologyLock ? MeshoptSimplifier.generatePositionRemap(positionArray, 3) : null;
      const locks = settings.topologyLock ? new Uint8Array(positions.getCount()) : null;
      const protectedPositions = new Set();
      const topologyPasses = [];
      const baselineWinding = new Set();
      if (settings.topologyLock) {
        const sourceEdges = new Map(), edgeBase = positions.getCount();
        for (let i = 0; i < input.length; i += 3) for (let j = 0; j < 3; j++) {
          const start = positionRemap[input[i + j]], end = positionRemap[input[i + (j + 1) % 3]];
          const key = Math.min(start, end) * edgeBase + Math.max(start, end);
          const edge = sourceEdges.get(key) ?? { count: 0, orientation: 0 };
          edge.count++; edge.orientation += start < end ? 1 : -1; sourceEdges.set(key, edge);
        }
        for (const [key, edge] of sourceEdges) if (edge.count === 2 && edge.orientation !== 0) baselineWinding.add(key);
      }
      let simplified, error;
      for (let attempt = 0; ; attempt++) {
        [simplified, error] = MeshoptSimplifier.simplifyWithAttributes(
          input, positionArray, 3, attributes, 5,
          [settings.normalWeight, settings.normalWeight, settings.normalWeight, settings.uvWeight, settings.uvWeight],
          locks, target * 3, settings.errorLimit, settings.flags,
        );
        if (!settings.topologyLock) break;
        const edges = new Map(), bad = new Set();
        let zeroArea = 0;
        const edgeBase = positions.getCount();
        for (let i = 0; i < simplified.length; i += 3) {
          const face = [simplified[i], simplified[i + 1], simplified[i + 2]];
          const a = face[0] * 3, b = face[1] * 3, c = face[2] * 3;
          const ux = positionArray[b] - positionArray[a], uy = positionArray[b + 1] - positionArray[a + 1], uz = positionArray[b + 2] - positionArray[a + 2];
          const vx = positionArray[c] - positionArray[a], vy = positionArray[c + 1] - positionArray[a + 1], vz = positionArray[c + 2] - positionArray[a + 2];
          if (uy * vz - uz * vy === 0 && uz * vx - ux * vz === 0 && ux * vy - uy * vx === 0) {
            zeroArea++;
            face.forEach((index) => bad.add(positionRemap[index]));
          }
          for (let j = 0; j < 3; j++) {
            const start = positionRemap[face[j]], end = positionRemap[face[(j + 1) % 3]];
            const lo = Math.min(start, end), hi = Math.max(start, end), key = lo * edgeBase + hi;
            const edge = edges.get(key) ?? { count: 0, orientation: 0, lo, hi };
            edge.count++; edge.orientation += start < end ? 1 : -1; edges.set(key, edge);
          }
        }
        let defects = 0, inheritedWinding = 0;
        for (const [key, edge] of edges) {
          const inherited = edge.count === 2 && edge.orientation !== 0 && baselineWinding.has(key);
          if (inherited) inheritedWinding++;
          if (edge.count !== 2 || (edge.orientation !== 0 && !inherited)) {
            defects++; bad.add(edge.lo); bad.add(edge.hi);
          }
        }
        topologyPasses.push({ attempt, triangles: simplified.length / 3, newDefectiveEdges: defects, inheritedWindingEdges: inheritedWinding, zeroAreaTriangles: zeroArea, lockedVertices: locks.reduce((sum, value) => sum + value, 0) });
        console.log(JSON.stringify({ mesh: mesh.getName(), ...topologyPasses.at(-1) }));
        if (!bad.size) break;
        if (attempt >= 11) throw new Error(`Topology-preserving simplification did not converge: ${mesh.getName()}`);
        // Freeze surviving endpoints that exposed a collapsed fold, plus their
        // immediate original-surface neighborhood. All UV copies of each
        // position receive the same lock. Every retry starts from master data.
        const ring = new Set(bad);
        for (let i = 0; i < input.length; i += 3) {
          const a = positionRemap[input[i]], b = positionRemap[input[i + 1]], c = positionRemap[input[i + 2]];
          if (bad.has(a) || bad.has(b) || bad.has(c)) { ring.add(a); ring.add(b); ring.add(c); }
        }
        for (const position of ring) protectedPositions.add(position);
        for (let i = 0; i < locks.length; i++) if (protectedPositions.has(positionRemap[i])) locks[i] = 1;
      }
      primitive.setIndices(document.createAccessor().setType('SCALAR').setArray(simplified).setBuffer(positions.getBuffer()));
      compactPrimitive(primitive);
      results.push({ name: mesh.getName(), role, beforeTriangles: input.length / 3, targetTriangles: target, afterTriangles: simplified.length / 3, combinedAttributeError: error, topologyPasses });
    }
  }
  return results;
}

function validate(document, before) {
  const after = summary(document);
  if (JSON.stringify(after.meshNodes) !== JSON.stringify(before.meshNodes)) throw new Error('Named body/gun mesh nodes changed.');
  if (after.triangles > before.triangles || !after.triangles) throw new Error('Invalid output triangle count.');
  for (const accessor of document.getRoot().listAccessors()) {
    if (!Array.from(accessor.getArray()).every(Number.isFinite)) throw new Error('Nonfinite output accessor data.');
  }
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const count = primitive.getAttribute('POSITION').getCount();
      for (const index of primitive.getIndices().getArray()) if (index >= count) throw new Error('Out-of-range output index.');
    }
  }
  const maximumSpan = Math.max(...before.bounds.max.map((v, i) => v - before.bounds.min[i]));
  for (let i = 0; i < 3; i++) {
    if (Math.abs(before.bounds.min[i] - after.bounds.min[i]) > maximumSpan * 0.01 || Math.abs(before.bounds.max[i] - after.bounds.max[i]) > maximumSpan * 0.01) {
      throw new Error('Output bounds changed by more than 1% of overall extent.');
    }
  }
  if (after.textures.some((texture) => texture.size.some((size) => size > settings.textureSize))) throw new Error('Texture resize failed.');
  return after;
}

async function exportPieces(document, basename, validatedSourceBounds, standalone = {}) {
  const pieceDirectory = path.join(output, 'pieces', path.parse(basename).name);
  await mkdir(pieceDirectory, { recursive: true });
  const pieces = [];
  const sourceBounds = validatedSourceBounds;
  const meshNodes = document.getRoot().listNodes().filter((candidate) => candidate.getMesh());
  const gunsOnly = meshNodes.every((node) => /gun|weapon/i.test(node.getName()));
  const sourceHeight = sourceBounds.max[1] - sourceBounds.min[1];
  const scale = standalone.scale ?? (gunsOnly ? 1 : 1.8 / sourceHeight);
  const rotation = standalone.rotationYRadians ?? -Math.PI / 2;
  const units = standalone.units ?? (gunsOnly ? 'source units; physical weapon scale is not established' : 'normalized character review units');
  if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(rotation)) throw new Error('Invalid standalone normalization config');
  const cosine = Math.cos(rotation), sine = Math.sin(rotation);
  const rotationScale = [scale * cosine, 0, -scale * sine, 0, 0, scale, 0, 0, scale * sine, 0, scale * cosine, 0, 0, 0, 0, 1];
  const multiplyMatrices = (a, b) => Array.from({ length: 16 }, (_, index) => {
    const row = index % 4, column = Math.floor(index / 4);
    return a[row] * b[column * 4] + a[4 + row] * b[column * 4 + 1] + a[8 + row] * b[column * 4 + 2] + a[12 + row] * b[column * 4 + 3];
  });
  for (const node of meshNodes) {
    const piece = new Document();
    for (const extension of document.getRoot().listExtensionsUsed()) {
      piece.createExtension(extension.constructor).setRequired(extension.isRequired());
    }
    piece.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
    const mapping = copyToDocument(piece, document, [node]);
    const pieceNode = mapping.get(node).setMatrix(multiplyMatrices(rotationScale, node.getWorldMatrix()));
    piece.getRoot().setDefaultScene(piece.createScene('Asset').addChild(pieceNode));
    const bounds = getBounds(pieceNode);
    const gun = /gun|weapon/i.test(node.getName());
    // Bodies have a foot pivot; guns use their bounding-box center, never an
    // inferred grip. Separate gun packs retain source units unless configured.
    const pivot = [
      (bounds.min[0] + bounds.max[0]) / 2,
      gun ? (bounds.min[1] + bounds.max[1]) / 2 : bounds.min[1],
      (bounds.min[2] + bounds.max[2]) / 2,
    ];
    const sourceToLocal = [...rotationScale];
    sourceToLocal[12] = -pivot[0]; sourceToLocal[13] = -pivot[1]; sourceToLocal[14] = -pivot[2];
    pieceNode.setMatrix(multiplyMatrices(sourceToLocal, node.getWorldMatrix()));
    for (const texture of piece.getRoot().listTextures()) {
      const extension = texture.getMimeType() === 'image/jpeg' ? 'jpg' : texture.getMimeType().split('/')[1];
      texture.setURI(`../../textures/atlas-${hash(texture.getImage()).slice(0, 16)}.${extension}`);
    }
    const pieceName = node.getName().replace(/[^a-z0-9_-]/gi, '-');
    if (!pieceName || pieces.some((entry) => entry.name === pieceName)) throw new Error('Unique named mesh nodes are required.');
    const piecePath = path.join(pieceDirectory, `${pieceName}.gltf`);
    await io.write(piecePath, piece);
    const glbPath = path.join(pieceDirectory, `${pieceName}.glb`);
    await io.write(glbPath, piece);
    const reloaded = await io.read(piecePath);
    const pieceSummary = summary(reloaded);
    if (pieceSummary.meshNodes.length !== 1 || pieceSummary.meshNodes[0] !== node.getName()) throw new Error(`Piece export lost identity: ${pieceName}`);
    const glbSummary = summary(await io.read(glbPath));
    if (glbSummary.triangles !== pieceSummary.triangles || JSON.stringify(glbSummary.bounds) !== JSON.stringify(pieceSummary.bounds)) throw new Error(`Standalone GLB differs from shared-texture piece: ${pieceName}`);
    const centeredBounds = pieceSummary.bounds;
    const tolerance = 1e-5;
    if (Math.abs((centeredBounds.min[0] + centeredBounds.max[0]) / 2) > tolerance || Math.abs((centeredBounds.min[2] + centeredBounds.max[2]) / 2) > tolerance || Math.abs(gun ? (centeredBounds.min[1] + centeredBounds.max[1]) / 2 : centeredBounds.min[1]) > tolerance) {
      throw new Error(`Standalone pivot verification failed: ${pieceName}`);
    }
    pieces.push({ name: pieceName, file: piecePath, standaloneGLB: glbPath, standaloneGLBBytes: (await stat(glbPath)).size, triangles: pieceSummary.triangles, origin: gun ? 'Bounding-box center' : 'Feet: horizontal bounding-box center at minimum Y', normalization: { rotationYRadians: rotation, uniformScale: scale, units, sourceHeight, transformedPackHeight: sourceHeight * scale, note: standalone.note ?? '' }, sourceToLocalMatrixColumnMajor: sourceToLocal, assemblyOffsetNormalized: pivot, reassembly: 'Add assemblyOffsetNormalized as parent translation to reassemble in the rotated/scaled source layout. Combined GLB retains original source coordinates.', bounds: centeredBounds, textures: reloaded.getRoot().listTextures().map((texture) => texture.getURI()) });
  }
  return pieces;
}

await mkdir(path.join(output, 'source-copy'), { recursive: true });
const report = { status: 'in-progress', validationGate: gatePath, settings, assets: [], protectedFiles: [] };
for (const file of gate.files) {
  const basename = path.basename(file.path);
  const copy = path.join(output, 'source-copy', basename);
  const target = path.join(output, basename);
  await copyFile(file.path, copy);
  if (hash(await readFile(copy)) !== file.sha256) throw new Error(`Source copy differs: ${basename}`);
  const document = await io.read(copy);
  const before = summary(document);
  await document.transform(dequantize(), weld());
  const simplification = simplify(document);
  await document.transform(
    prune({ keepLeaves: true, keepAttributes: true }),
    textureCompress({ encoder: sharp, resize: [settings.textureSize, settings.textureSize], quality: 92, chromaSubsampling: '4:4:4' }),
  );
  if (settings.positionBits === 32) {
    // Tiny repaired contact loops may have distinct vertices closer together
    // than a 16-bit position grid. Keep their original float32 coordinates;
    // meshopt still compresses their byte stream losslessly.
    await document.transform(
      reorder({ encoder: MeshoptEncoder, target: 'size' }),
      quantize({ pattern: /^(TEXCOORD|JOINTS|WEIGHTS|COLOR)(_\d+)?$/, quantizeTexcoord: 16 }),
    );
    document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  } else {
    await document.transform(meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 16, quantizeTexcoord: 16 }));
  }
  await io.write(target, document);
  const reloaded = await io.read(target);
  const after = validate(reloaded, before);
  if (hash(await readFile(file.path)) !== file.sha256) throw new Error(`Original master changed: ${basename}`);
  const pieces = await exportPieces(reloaded, basename, before.bounds, file.standalone);
  const asset = { source: file.path, sourceSha256: file.sha256, copy, optimized: target, optimizedSha256: hash(await readFile(target)), before: { ...before, bytes: (await stat(copy)).size }, after: { ...after, bytes: (await stat(target)).size }, simplification, pieces };
  report.assets.push(asset);
  console.log(JSON.stringify({ file: basename, beforeTriangles: before.triangles, afterTriangles: after.triangles, bytes: asset.after.bytes }));
}
report.status = 'passed';
for (const file of protectedFiles) {
  const afterSha256 = hash(await readFile(file.path));
  report.protectedFiles.push({ path: file.path, beforeSha256: file.sha256, afterSha256, unchanged: afterSha256 === file.sha256 });
}
if (report.protectedFiles.some((file) => !file.unchanged)) report.status = 'failed';
report.note = 'Structural checks passed; visual comparison is still required. Texture memory reductions are independent of meshopt disk compression.';
report.packaging = 'Combined GLB, shared-texture glTF pieces, and standalone GLBs are alternative import formats. Standalone GLBs duplicate atlas bytes. Do not add all formats together when quoting application download size.';
await writeFile(path.join(output, 'optimization-report.json'), `${JSON.stringify(report, null, 2)}\n`);
if (report.status !== 'passed') throw new Error('Protected masters changed; see optimization-report.json.');
console.log(`Optimized COPIES written to ${output}`);
