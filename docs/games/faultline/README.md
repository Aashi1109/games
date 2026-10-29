> Game notes retained from the original implementation. Run and build this game through the single root Next.js app; see [current setup](../../../README.md). Source lives in `src/games/` and browser media in `public/`.

# Faultline

**Dig deep. Hold the line.** A complete solo browser expedition: mine an alien ridge, haul ore to a frontier shelter, improve its equipment, and survive four escalating creature waves to evacuate.

Run the collection with `npm start` from the repository root, then open **http://127.0.0.1:4180/faultline/**. The game uses static HTML, CSS and JavaScript; no package installation, external asset requests or paid services are needed to play. You can also serve the `faultline/` directory with any static web server. Opening the HTML directly through `file://` is unsupported because it uses JavaScript modules.

## Play

| Action | Keyboard / mouse |
|---|---|
| Move / jetpack | WASD or arrow keys |
| Drill | Hold Space while moving into a tile; or point and hold the mouse |
| Recall and deposit | R, with a 25-second recharge |
| Enter / leave cannon | E near the shelter |
| Cannon fire | Aim and hold mouse; hold Space for assisted targeting |
| Workshop | U; equipment can only be fitted at the shelter |
| Pause | Escape |
| Sound | M |

Touch devices get a direction pad, a held Drill/Fire button, recall and turret controls. Iron, crystal and gold are worth 3, 6 and 10 salvage. Cargo deposits automatically when you return to the shelter. The five workshop options improve the drill, cargo harness, cannon, shelter armor, or repair hull damage. The shelter has a slow autonomous cannon, but later waves need manual defense and upgrades. Explorer difficulty provides more preparation time and a stronger shelter.

The title, field manual, pause/settings, workshop, victory, defeat, retry and resume flows are included. Active expeditions save locally every five seconds and when paused; completed runs clear the active save. Personal best scores and sound/motion preferences stay on the same browser. Storage failures leave the game playable and are reported. Switching tabs pauses a running expedition. No accounts or multiplayer server are required.

## Assets and sound

The miner has 24 frames rendered from its editable 19-bone Blender rig. Shelter, cannon mounting, cart and mineral sprites come from the actual equipment models. Three original SVG creature types include the final siege beast. Terrain, mountain silhouettes, underground lighting, mining debris, muzzle flashes, impacts, aiming, the minimap and the evacuation craft are drawn by the game renderer. All fonts and their licenses are bundled locally. Sound effects, cave ambience and combat music are synthesized with Web Audio after the first user interaction.

Crystal ore uses an actual mesh generated locally in Modly with Hunyuan3D Mini, then colored and rendered in Blender. The browser loads the small exported sprites; **Modly's local AI weights and Blender source meshes are not game runtime dependencies**. See [asset provenance](assets/README.md), the editable scripts in `../design/faultline-models/`, and generation records in `../design/assets/faultline/modly/`.

## Verification

```sh
npm --prefix faultline test
npm --prefix faultline run check
```

Tests cover deterministic world generation, collision, drilling, cargo limits, deposit/recall, upgrade boundaries, projectile collision, wave progression, full winning and losing campaigns, balance with/without mined resources, save validation, PNG decoding/transparency, all animation cells, creature SVGs, asset links and the image budget. Browser checks cover title/start, recall/turret/workshop, pause/resume, save continuation, errors, and desktop/phone layouts. See `VERIFICATION.md` for the final observed results and limits.

This is a finite single-player game, not a multiplayer or infinite-content service. Artwork was created for this game, including the AI-generated Modly crystal ore; it is an interpretation of the earlier Faultline concept, not a pixel-perfect reconstruction of that generated image.
