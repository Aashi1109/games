import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const game = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(game, '../../..');
const assets = resolve(root, 'public/faultline/assets');
const manifest = JSON.parse(readFileSync(resolve(assets, 'manifest.json'), 'utf8'));
const entries = Object.entries(manifest).filter(([, value]) => value && typeof value === 'object' && value.url);
const read = (path) => readFileSync(path, 'utf8');

function png(path) {
  const file = readFileSync(path);
  assert.deepEqual(file.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), `${path}: PNG signature`);
  assert.equal(file.toString('ascii', 12, 16), 'IHDR');
  const width = file.readUInt32BE(16), height = file.readUInt32BE(20);
  assert.equal(file[24], 8, 'Sprites must use standard 8-bit channels');
  assert.equal(file[25], 6, 'Sprites must include an RGBA transparency channel');
  assert.equal(file[28], 0, 'Sprites must be non-interlaced');
  const compressed = [];
  let ended = false;
  for (let offset = 8; offset < file.length;) {
    const length = file.readUInt32BE(offset);
    assert.ok(offset + length + 12 <= file.length, 'PNG chunk is complete');
    const kind = file.toString('ascii', offset + 4, offset + 8);
    if (kind === 'IDAT') compressed.push(file.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (kind === 'IEND') { ended = true; break; }
  }
  assert.ok(ended && compressed.length, 'PNG has image data and an end marker');
  const filtered = inflateSync(Buffer.concat(compressed));
  const stride = width * 4;
  assert.equal(filtered.length, (stride + 1) * height, 'PNG data matches its declared dimensions');
  const pixels = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = filtered[y * (stride + 1)];
    assert.ok(filter >= 0 && filter <= 4, 'PNG uses a valid row filter');
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const left = x >= 4 ? pixels[index - 4] : 0;
      const up = y ? pixels[index - stride] : 0;
      const corner = y && x >= 4 ? pixels[index - stride - 4] : 0;
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, corner)][filter];
      pixels[index] = (filtered[y * (stride + 1) + x + 1] + predictor) & 255;
    }
  }
  return { width, height, pixels };
}

test('manifest assets exist, stay local, and fit a 3 MiB runtime image budget', () => {
  assert.ok(entries.length >= 9, 'Character, equipment, creatures, and game mark are declared');
  let bytes = 0;
  for (const [name, asset] of entries) {
    assert.match(asset.url, /^[a-z0-9][a-z0-9.-]*\.(png|svg)$/i, `${name}: portable local URL`);
    const info = statSync(resolve(assets, asset.url));
    assert.ok(info.isFile() && info.size > 0, `${name}: nonempty asset`);
    bytes += info.size;
  }
  assert.ok(bytes < 3 * 1024 * 1024, `Runtime images are ${bytes} bytes, over the 3 MiB budget`);
});

test('every PNG decodes, has transparency, and matches manifest dimensions', () => {
  for (const [name, asset] of entries.filter(([, value]) => value.url.endsWith('.png'))) {
    const image = png(resolve(assets, asset.url));
    assert.equal(image.width, asset.width ?? asset.frameWidth * asset.columns, `${name}: width`);
    assert.equal(image.height, asset.height ?? asset.frameHeight * Object.keys(asset.rows).length, `${name}: height`);
    let clear = 0, solid = 0;
    for (let offset = 3; offset < image.pixels.length; offset += 4) {
      if (image.pixels[offset] === 0) clear++;
      if (image.pixels[offset] === 255) solid++;
    }
    assert.ok(clear > image.width * image.height * .05, `${name}: transparent background`);
    assert.ok(solid > image.width * image.height * .01, `${name}: visible art`);
  }
});

test('miner atlas contains 24 populated, unclipped animation frames with stable ground contact', () => {
  const asset = manifest.miner, image = png(resolve(assets, asset.url));
  assert.deepEqual(asset.rows, { idle: 0, walk: 1, drill: 2 });
  assert.equal(asset.columns * Object.keys(asset.rows).length, 24);
  assert.equal(asset.facing, 'right');
  const { frameWidth: width, frameHeight: height } = asset;
  for (const [animation, row] of Object.entries(asset.rows)) {
    const hashes = new Set();
    for (let column = 0; column < asset.columns; column++) {
      let left = width, top = height, right = -1, bottom = -1;
      const hash = createHash('sha256');
      for (let y = 0; y < height; y++) {
        const start = ((row * height + y) * image.width + column * width) * 4;
        hash.update(image.pixels.subarray(start, start + width * 4));
        for (let x = 0; x < width; x++) if (image.pixels[start + x * 4 + 3]) {
          left = Math.min(left, x); top = Math.min(top, y);
          right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
      }
      assert.ok(right > left && bottom > top, `${animation} ${column}: populated frame`);
      assert.ok(left > 0 && top > 0 && right < width - 1 && bottom < height - 1, `${animation} ${column}: no clipping`);
      assert.ok(Math.abs(bottom + 1 - height * asset.anchor.y) <= 1, `${animation} ${column}: grounded baseline`);
      hashes.add(hash.digest('hex'));
    }
    assert.ok(hashes.size >= 2, `${animation} contains changing animation frames`);
  }
});

test('SVG creatures and mark have balanced XML elements, dimensions, and no external dependencies', () => {
  for (const [name, asset] of entries.filter(([, value]) => value.url.endsWith('.svg'))) {
    const source = read(resolve(assets, asset.url));
    const opening = source.match(/<svg\b[^>]*>/)?.[0];
    assert.ok(opening, `${name}: SVG root`);
    assert.match(opening, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.ok(opening.includes(`width="${asset.width}"`) && opening.includes(`height="${asset.height}"`), `${name}: dimensions`);
    assert.ok(opening.includes(`viewBox="0 0 ${asset.width} ${asset.height}"`), `${name}: viewBox`);
    assert.doesNotMatch(source, /<\s*(?:script|foreignObject)\b|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|\/\/)/i);
    const stack = [];
    for (const token of source.match(/<[^>]+>/g) ?? []) {
      if (/^<\?|^<!/.test(token)) continue;
      const tag = token.match(/^<\/?\s*([\w:-]+)/)?.[1];
      assert.ok(tag, `${name}: valid element`);
      if (/^<\//.test(token)) assert.equal(stack.pop(), tag, `${name}: balanced ${tag}`);
      else if (!/\/\s*>$/.test(token)) stack.push(tag);
    }
    assert.deepEqual(stack, [], `${name}: closed XML elements`);
    const ids = new Set([...source.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
    for (const match of source.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.has(match[1]), `${name}: defined gradient ${match[1]}`);
  }
});

test('React shell, stylesheet, modules, and renderer resolve their local dependencies', () => {
  const shell = resolve(game, 'game-view.tsx');
  const jsx = read(shell);
  const assertLocal = (from, reference) => {
    if (/^(?:[a-z]+:|#|\/\/)/i.test(reference)) return;
    const pathname = reference.split(/[?#]/)[0];
    const target = pathname === '/'
      ? resolve(root, 'src/app/(shelf)/page.tsx')
      : pathname.startsWith('/')
        ? resolve(root, 'public', pathname.slice(1))
        : resolve(dirname(from), pathname);
    const info = statSync(target);
    assert.ok(info.isFile(), `${reference}: usable local target`);
  };
  for (const match of jsx.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) assertLocal(shell, match[1]);
  const css = read(resolve(game, 'style.css')).replace(/url\(\s*(["'])data:[\s\S]*?\1\s*\)/g, '');
  for (const match of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) assertLocal(resolve(game, 'style.css'), match[1]);
  for (const filename of ['main.ts', 'renderer.ts', 'engine.ts', 'audio.ts']) {
    const file = resolve(game, filename), source = read(file);
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*)['"](\.[^'"]+)['"]/g)) assertLocal(file, match[1]);
  }
  const known = new Set(entries.map(([, asset]) => asset.url));
  for (const match of read(resolve(game, 'renderer.ts')).matchAll(/['"]([^/'"]+\.(?:png|svg))['"]/g)) {
    assert.ok(known.has(match[1]), `${match[1]} is tracked in the asset manifest`);
    assert.ok(statSync(resolve(assets, match[1])).isFile());
  }
  const ids = new Set([...jsx.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  for (const match of read(resolve(game, 'main.ts')).matchAll(/\$\(['"]([^'"]+)['"]\)/g)) assert.ok(ids.has(match[1]), `${match[1]}: UI element exists`);
});

test('editable Blender source and runtime export provenance remain available', () => {
  for (const filename of ['miner.blend', 'faultline-kit.blend']) {
    const path = resolve(root, 'design/assets/faultline/models', filename);
    assert.ok(statSync(path).size > 100_000, `${filename}: preserved editable source`);
  }
  const pipeline = read(resolve(root, 'design/faultline-models/export_game_sprites.py'));
  assert.ok(pipeline.includes("'miner.blend'") && pipeline.includes("'faultline-kit.blend'"));
  assert.ok(pipeline.includes("ROOT / 'public/faultline/assets'"), 'Exporter targets runtime assets');
  assert.doesNotMatch(pipeline, /save_as_mainfile/, 'Sprite export does not overwrite editable models');
  assert.match(read(resolve(assets, 'README.md')), /original SVG creatures|original.*SVG/is);
});
