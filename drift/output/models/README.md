# Ember remodel review

Ember has been rebuilt against the approved concept. This is a posed, standalone 3D review asset. Optimization, animation rigging and gameplay integration are deferred until the user reviews the likeness.

[Open the interactive comparison](http://127.0.0.1:5174/model-preview.html#assault) · [Download Ember GLB](assault-character.glb)

![Reference beside the rebuilt Ember model](ember-review.jpg)

![Reference beside the rebuilt Ember face](ember-face-review.jpg)

## What changed

- New facial topology follows the concept's eye placement, nose, mouth, narrow jaw and exposed ear. Both profiles have authored anatomical depth.
- Swept hair uses traced facets and a closed posterior volume. Its side and rear surfaces can be inspected in the viewer.
- The head and neck use vertex paint sampled from the approved illustration. They are solid 3D geometry; no image plane or texture is embedded in the model.
- The jacket, collar and straps wrap around the torso. The pose, forearms, knees, boots, exterior thigh holster and tilted belt disc were revised.
- The equipped rifle's rotation, scale and position align its stock, muzzle and trigger grip with the reference. Both hands meet the weapon markers.

The reference view uses the same crop and scale on both sides. Other angles are available through Front, Side, keyboard arrows and free orbit. The original is one illustration, so unseen surfaces are authored interpretations. No measured perceptual-similarity percentage is claimed.

## Current assets

| Equipped character | Triangles | Meshes | Uncompressed GLB |
| --- | ---: | ---: | ---: |
| [Ember](assault-character.glb) | 209,484 | 7 | 22.63 MB |
| [Wisp](sniper-character.glb) | 11,918 | 7 | 1.30 MB |
| [Dash](scout-character.glb) | 10,554 | 7 | 1.15 MB |
| [Rook](heavy-character.glb) | 10,138 | 7 | 1.10 MB |

Ember intentionally uses dense geometry for the current paint and likeness review. This is not the final browser-game asset budget. The other characters remain at the earlier design iteration; this remodel focused on Ember.

Separate weapon files remain available: [AR-01](assault-weapon.glb), [SR-02](sniper-weapon.glb), [SMG-03](scout-weapon.glb), [LMG-04](heavy-weapon.glb).

## Verification

- All 21 focused character and weapon tests pass.
- All eight GLBs reload with identical positions, normals and vertex colors; transforms and bounds agree within floating-point tolerance. Materials and manifest counts match.
- Ember's skull, neck and hair volumes have closed, consistently wound topology. Geometry has finite attributes, unit normals, valid colors and positive triangle areas.
- Both face profiles and the back of the hair were inspected; the far-cheek color artifacts and rear-shell intersections found during review were corrected.
- The game entry files, current avatars, simulation and dependencies match their baseline checksums. The remodel is not imported into the game.

Older rejected Ember assets are retained in `rejected-v2/` and `previous-pass/`. Work-in-progress captures remain in `iterations/`.

## Editable sources

- `client/ember-head.js`: head and neck volumes, facial vertex painting.
- `client/ember-reference-face-data.js`: facial modeling landmarks and depth.
- `client/ember-reference-hair-data.js` and `client/ember-hair-volume.js`: swept hair facets and closed rear shell.
- `client/reference-head-geometry.js`: reference-coordinate modeling helpers.
- `client/character-models.js`: garments, limbs, equipment and assembly.
- `client/ember-weapon-fit.js`: review-pose rifle alignment.
- `scripts/sample-ember-reference.py`: reproducible color measurements from the unchanged concept image.
- `scripts/export-models.mjs`: GLB exports and manifest.

```sh
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174
node scripts/export-models.mjs
node --test test/character-models.test.js test/weapon-models.test.js
```
