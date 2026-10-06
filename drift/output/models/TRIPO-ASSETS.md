# Character and weapon assets

[Open the local model review](http://127.0.0.1:5174/tripo-split-review.html). Choose Characters or Weapons, then Master or Optimized. Select Ember, Wisp, Dash, or Rook to inspect one piece. Front, back, side, face detail, and wireframe controls support comparison.

## Authoritative files

- `tripo-characters-master/`: four full-detail, color-matched character bodies and `characters-master.glb`.
- `tripo-guns-master/`: four full-detail weapons from the separately supplied gun GLB and `guns-master.glb`.
- `tripo-optimized/`: optimized copies, generated after validation. Original byte-for-byte copies are retained under `source-copy/`.
- `tripo-review/tripo-character-lineup.glb` and `tripo-guns-review/tripo-guns-original.glb`: untouched downloads.

The old mixed `tripo-master/` and inspection masks are historical working files. Its extracted guns are superseded by the new weapon source.

| Character | Body file | Gun file | Weapon |
| --- | --- | --- | --- |
| Ember | `ember-body.glb` | `ember-gun.glb` | Assault rifle |
| Wisp | `wisp-body.glb` | `wisp-gun.glb` | Scoped sniper |
| Dash | `dash-body.glb` | `dash-gun.glb` | Compact SMG |
| Rook | `rook-body.glb` | `rook-gun.glb` | LMG |

These are static models with no skeleton or animations. Game integration, final physical scale, and fitting the new guns to the characters' hands are pending review.

## Final optimized size

| Pack | Master triangles | Optimized triangles | Optimized GLB |
| --- | ---: | ---: | ---: |
| Four character bodies | 1,706,936 | 120,000 | 4.45 MB |
| Four new guns | 942,372 | 16,000 | 1.89 MB |
| Total | 2,649,308 | 136,000 | 6.34 MB |

Every character has 30,000 triangles and every gun has 4,000. The combined packs total 6,339,416 bytes. Maps are 2048 × 2048. Float32 positions and local vertex locks preserve topology during simplification; meshopt compresses the geometry. This reduces the master triangle count by about 94.9%. Runtime performance on low-spec hardware has not yet been measured in the game.

## Preservation and repairs

Body colors and skin tones were calibrated against the approved concept. Existing source surface positions and UVs are retained in the full-detail body masters, with closed patches where the original held weapons were removed. The gun masters preserve the new source geometry, UVs, normals, and texture maps; splitting used its four connected components.

The gun source contained collapsed, opposite-wound duplicate faces. Forty-eight were removed and recorded by exact source triangle ID, leaving no open or nonmanifold edges. Two original zero-area triangles were retained because simply removing them would introduce open edges. The character source's pre-existing tiny defects and separation repairs are separately recorded in its audit. Untouched source downloads remain available.

Color matching is a sampled-palette and visual comparison, not a numerical likeness percentage. Lighting affects the rendered appearance. Original sculpt roughness remains, especially in the posed hands.

## Validation and formats

Each master folder contains structural/source-preservation validation, ownership records, and visual evidence. Optimization checks the master hashes, makes copies, and processes those copies only. Its report records actual triangle counts, file sizes, texture sizes, and source-preservation checks.

Optimized delivery includes combined GLBs, individual GLBs, and individual glTF files sharing texture files. These are alternative formats: load the combined packs or the shared-texture pieces for efficient delivery. Individual GLBs embed their textures for convenient standalone imports, so summing all alternative formats is not the game download size.

Individual optimized files are under `tripo-optimized/pieces/characters-master/` and `tripo-optimized/pieces/guns-master/`. The review viewer's download link follows the selected character or gun.

Standalone optimized bodies use a foot-center pivot at a normalized review height; guns use a centered pivot and source units until integration establishes their physical scale. The reports include transforms back to the source assembly.
