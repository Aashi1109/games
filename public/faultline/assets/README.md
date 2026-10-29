# Faultline runtime art

All assets were created for this game. There are no external image requests, font requests, or asset-CDN dependencies.

`miner.png` is a transparent 2048 × 768 atlas rendered from the actual rigged Blender miner. Each cell is 256 × 256 pixels; eight columns contain evenly sampled animation frames. Rows are idle, walk, and drill. The miner faces right; mirror the drawing context for left. Its ground contact is at pixel 240 inside each cell. Initial loops are in place, so gameplay controls movement.

The shelter, turret, cargo cart, and ore cluster are transparent renders of the editable equipment meshes. Their pixel dimensions, nontransparent bounds, and ground anchors are in `manifest.json`. The complete turret's barrel points right. `turret-base.png` has the gun assembly removed so gameplay can aim one independently drawn cannon; its exact projected bearing pivot is recorded in the manifest. PNG equipment is shaded from an orthographic camera, so the game can draw it directly without downloading a 3D engine or the larger source meshes.

Crawler, spitter, and brute are original SVG creatures, all facing right. Runtime animation can bob, tilt, squash, and flip these sprites. The game mark is `icon.svg`.

Regenerate the model sprites from the project root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python design/faultline-models/export_game_sprites.py
```

Add `-- --props-only` to regenerate only the four equipment PNGs. The script changes render framing in memory and does not overwrite the source `.blend` files. Source meshes and editable animation rigs remain under `design/assets/faultline/models/`.

## Modly crystal ore

`ore-modly.png` is the runtime crystal sprite rendered from an AI-generated mesh made locally with **Modly / Hunyuan3D Mini**. Its input was our original transparent `ore-cluster.png`. Modly generated the actual geometry; Blender then added basalt/turquoise materials and an orthographic camera. The original hand-built ore sprite remains as the reproducible input.

The unchanged raw `ore.glb`, colored `.blend` and `.glb`, source image, generator license/notice, generation parameters, hashes and validation reports are retained in `design/assets/faultline/modly/`. The raw mesh contains 128,232 triangles and is a design source only. The browser downloads a 192 × 192 PNG, never the generator weights or this source mesh.

Regenerate its materials and sprite with:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python design/faultline-models/render_modly_ore.py
```
