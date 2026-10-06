"""Calibrate a COPY of Tripo's base-color atlas against the approved concept.

Run after decode: python3 scripts/tripo-color-correct.py
Requires numpy and Pillow. Does not change source GLB or normal/ORM textures.
All output goes to output/models/tripo-working/color by default.
"""
from pathlib import Path
import argparse
import hashlib
import json
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
NAMES = ['ember', 'wisp', 'dash', 'rook']


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def band(x, low, high, feather):
    return smoothstep(low - feather, low + feather, x) * (1 - smoothstep(high - feather, high + feather, x))


def make_ownership(decoded, output, size):
    path = output / 'character-ownership.png'
    if path.exists() and Image.open(path).size == (size, size):
        return np.array(Image.open(path))
    positions = np.fromfile(decoded / 'POSITION.bin', '<f4').reshape(-1, 3)
    uvs = np.fromfile(decoded / 'TEXCOORD_0.bin', '<f4').reshape(-1, 2)
    triangles = np.fromfile(decoded / 'indices.bin', '<u4').reshape(-1, 3)
    z = positions[triangles[:, 0], 2]
    owners = np.select([z > .27, z > .02, z > -.228], [1, 2, 3], default=4)
    mask = Image.new('L', (size, size))
    draw = ImageDraw.Draw(mask)
    xy = uvs * (size - 1)  # glTF image origin uses the image's top-left here.
    for index, triangle in enumerate(triangles):
        draw.polygon([tuple(point) for point in xy[triangle]], fill=int(owners[index]))
    mask.save(path)
    return np.array(mask)


def extend_gutter(owners, radius=3):
    """Carry chart ownership into a 3px gutter, never overwrite another chart."""
    result = owners.copy()
    for _ in range(radius):
        prior = result.copy()
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            shifted = np.roll(prior, (dy, dx), axis=(0, 1))
            if dy < 0:
                shifted[dy:] = 0
            elif dy > 0:
                shifted[:dy] = 0
            if dx < 0:
                shifted[:, dx:] = 0
            elif dx > 0:
                shifted[:, :dx] = 0
            update = (result == 0) & (shifted > 0)
            result[update] = shifted[update]
    return result


def skin_weight(rgb, hsv):
    ratio = rgb[..., 1] / np.maximum(rgb[..., 0], 1)
    return (band(hsv[..., 0], 12, 29, 3) * smoothstep(50, 85, hsv[..., 1])
            * smoothstep(55, 90, hsv[..., 2]) * smoothstep(.54, .61, ratio))


def sample_skin(rgb, hsv):
    return ((hsv[..., 0] >= 12) & (hsv[..., 0] <= 29)
            & (hsv[..., 1] > 65) & (hsv[..., 2] > 70)
            & (rgb[..., 1] / np.maximum(rgb[..., 0], 1) > .57))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--decoded', type=Path, default=ROOT / 'output/models/tripo-working')
    parser.add_argument('--reference', type=Path, default=ROOT / 'output/models/reference.png')
    parser.add_argument('--output', type=Path, default=ROOT / 'output/models/tripo-working/color')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    source_path = args.decoded / 'texture-0.jpg'
    source_bytes = source_path.read_bytes()
    base_image = Image.open(source_path).convert('RGB')
    rgb = np.asarray(base_image).astype(np.float32)
    hsv = np.asarray(base_image.convert('HSV')).astype(np.float32)
    owner = make_ownership(args.decoded, args.output, base_image.width)
    extended_owner = extend_gutter(owner)
    reference = Image.open(args.reference).convert('RGB')
    ref = np.asarray(reference).astype(np.float32)
    ref_hsv = np.asarray(reference.convert('HSV')).astype(np.float32)
    ref_x = np.arange(reference.width)[None, :]
    ref_owner = np.broadcast_to(np.select([ref_x < 367, ref_x < 747, ref_x < 1132], [1, 2, 3], default=4), ref.shape[:2])
    result = rgb.copy()
    reports = []
    skin = skin_weight(rgb, hsv)
    # Dash's ochre shoulder/strap overlap skin hues. Geometry identifies the
    # upper-torso gold zone so the skin correction cannot recolor the armor.
    positions = np.fromfile(args.decoded / 'POSITION.bin', '<f4').reshape(-1, 3)
    triangles = np.fromfile(args.decoded / 'indices.bin', '<u4').reshape(-1, 3)
    uvs = np.fromfile(args.decoded / 'TEXCOORD_0.bin', '<f4').reshape(-1, 2)
    centers = positions[triangles].mean(axis=1)
    gold_triangles = triangles[(centers[:, 2] > -.228) & (centers[:, 2] < .02)
                              & (centers[:, 1] > .10) & (centers[:, 1] < .19)]
    gold_image = Image.new('L', base_image.size)
    gold_draw = ImageDraw.Draw(gold_image)
    xy = uvs * (base_image.width - 1)
    for triangle in gold_triangles:
        gold_draw.polygon([tuple(point) for point in xy[triangle]], fill=255)
    gold_zone = np.asarray(gold_image).astype(np.float32) / 255
    gold_weight = (gold_zone * band(hsv[..., 0], 23, 40, 2)
                   * smoothstep(110, 145, hsv[..., 1]))
    skin *= 1 - gold_weight
    del positions, triangles, uvs, centers, gold_triangles, xy
    palette_rules = [(1, 'orange-jacket', 2, 14, 100, 70),
                     (2, 'navy-uniform', 142, 167, 30, 40),
                     (3, 'teal-armor', 117, 140, 40, 40),
                     (3, 'gold-shoulder', 22, 40, 80, 90),
                     (4, 'olive-armor', 30, 56, 30, 40)]

    def apply(character, label, source_mask, reference_mask, weight):
        source_sample = rgb[source_mask]
        reference_sample = ref[reference_mask]
        if len(source_sample) < 100 or len(reference_sample) < 100:
            raise ValueError(f'Insufficient palette samples for {label}')
        original_median = np.median(source_sample, axis=0)
        target_median = np.median(reference_sample, axis=0)
        gain = np.clip(target_median / np.maximum(original_median, 1), .8, 1.4)
        active = (extended_owner == character)
        strength = (weight * active).astype(np.float32)
        result[:] += rgb * (gain - 1) * strength[..., None]
        reports.append({'character': NAMES[character - 1], 'region': label,
                        'sourceMedianRGB': original_median.tolist(),
                        'referenceMedianRGB': target_median.tolist(),
                        'channelGain': gain.tolist(), 'sourceSamples': len(source_sample),
                        'referenceSamples': len(reference_sample),
                        'pixelsWithMoreThanHalfCorrection': int((strength > .5).sum())})

    source_skin = sample_skin(rgb, hsv)
    ref_skin = sample_skin(ref, ref_hsv)
    for index, name in enumerate(NAMES, 1):
        apply(index, 'skin', (owner == index) & source_skin,
              (ref_owner == index) & ref_skin, skin)
    for index, name, h0, h1, saturation, value in palette_rules:
        source_mask = ((owner == index) & (hsv[..., 0] >= h0) & (hsv[..., 0] <= h1)
                       & (hsv[..., 1] > saturation) & (hsv[..., 2] > value))
        reference_mask = ((ref_owner == index) & (ref_hsv[..., 0] >= h0) & (ref_hsv[..., 0] <= h1)
                          & (ref_hsv[..., 1] > saturation) & (ref_hsv[..., 2] > value))
        weight = (band(hsv[..., 0], h0, h1, 2)
                  * smoothstep(saturation - 15, saturation + 15, hsv[..., 1])
                  * smoothstep(value - 15, value + 15, hsv[..., 2]))
        # Jacket/yellow hue edges can overlap skin. Skin owns those pixels.
        if index in (1, 3):
            weight *= 1 - skin
        if name == 'gold-shoulder':
            weight = np.maximum(weight, gold_weight)
        apply(index, name, source_mask, reference_mask, weight)

    clipped = np.any((result > 255) | (result < 0), axis=2)
    corrected = Image.fromarray(np.rint(np.clip(result, 0, 255)).astype(np.uint8))
    corrected.save(args.output / 'base-color-corrected.png')
    corrected.resize((1024, 1024)).save(args.output / 'base-color-corrected-preview.png')
    for index, name in enumerate(NAMES, 1):
        mask = np.rint(np.clip(skin * (owner == index) * 255, 0, 255)).astype(np.uint8)
        Image.fromarray(mask).resize((1024, 1024)).save(args.output / f'{name}-skin-mask.png')
    metadata = {'source': str(source_path.relative_to(ROOT)),
                'sourceSHA256': hashlib.sha256(source_bytes).hexdigest(),
                'referenceSHA256': hashlib.sha256(args.reference.read_bytes()).hexdigest(),
                'output': 'base-color-corrected.png',
                'method': 'Per-character UV ownership; hue/saturation gated sRGB channel gain; smooth boundaries; preserves texture shading and neutral equipment.',
                'limitations': ['Reference is lit concept art, not an albedo chart.',
                                'Rendered appearance depends on light/environment; no numerical likeness percentage is implied.',
                                'Gains affect matching hue ranges, not manually authored semantic material IDs.'],
                'clippedPixelCount': int(clipped.sum()), 'palette': reports}
    (args.output / 'color-report.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(json.dumps(metadata, indent=2))


if __name__ == '__main__':
    main()
