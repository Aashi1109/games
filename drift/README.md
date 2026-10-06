# DRIFT

A lightweight desktop-browser multiplayer FPS prototype. Apex-inspired momentum, quick arena matches, and four original procedural maps. Built with Three.js, native browser APIs, and a small Node/WebSocket server. No accounts, external asset downloads, database, or UI framework.

## Run locally

Requires Node 24 LTS and pnpm 11.9.0 (pinned in `package.json`). If you use nvm, run `nvm use` to select the project's Node version from `.nvmrc`.

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

Open **http://localhost:5173** in an active desktop Chrome, Edge, or Firefox window. Choose an arena and class, then click **Enter arena** for that map's shared open room, **Create a room** for a new room code, or **Join friends** for an existing code. Click **Back to the arena** if the browser needs a second click to capture the mouse. Escape releases the mouse.

Private room links are unlisted, not password-protected. Anyone with the code can join, up to six players. Create and share a new room if you want a separate match.

## Friends and hosting

- **Same machine:** open the room link in another browser or window.
- **Same local network:** use the host computer's LAN address, e.g. `http://192.168.1.10:5173`, on both computers; allow the port through the host firewall if needed. Copying a `localhost` link will only work on the host computer.
- **Over the internet:** deploy the Node process behind an HTTPS reverse proxy with WebSocket upgrade support, then share that public host's room links. A static-site-only host will not run this multiplayer server. No public deployment is included.

```sh
pnpm run build
HOST=0.0.0.0 PORT=5173 pnpm run start
```

Use the production command for hosting; the development server is for local iteration. Rooms and scores are in memory and reset when the process restarts.

### Docker and Cloudflare Containers

The Dockerfile builds the client and runs the Node server as a non-root user on **port 8080**. Its asset allowlist includes only the eight runtime GLBs, six shared texture atlases, and four static class portraits from `output/models/tripo-runtime/`. Original models, reference masters, and review files are excluded. No model optimization is applied during deployment.

To build and try the image locally with Docker running:

```sh
docker build --platform linux/amd64 -t drift-arena .
docker run --rm --name drift-arena -p 8080:8080 drift-arena
# In another terminal:
curl --fail http://localhost:8080/health
```

Open **http://localhost:8080**. The same port serves the client, models, `/health`, and `/ws`. Cloudflare requires a `linux/amd64` image, including when building on Apple Silicon.

For Cloudflare, use Node 24 LTS, a running Docker daemon, and an account with Workers Paid and Containers enabled:

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm run deploy
```

Wrangler first runs `pnpm run build`, uploads `dist` to Cloudflare Static Assets, then builds and uploads the Docker image and deploys `cloudflare/worker.js`. Open the HTTPS Worker URL printed by the deployment; WebSockets use that same host automatically. Initial container provisioning can take several minutes. Check status with `pnpm exec wrangler containers list` and verify `<your-worker-url>/health` returns `{"ok":true,"rooms":0}` when no rooms are active.

Cloudflare serves the HTML, JavaScript, CSS, and models directly from Static Assets, so loading the lobby does not wait for the game container to start. Only `/ws` and `/health` reach the container; unknown paths return 404 without starting it. The lobby uses lightweight static portraits. The selected character and gun load first; other classes load as needed and reuse the shared texture atlases. Hashed files under `/assets/` use a one-year immutable browser cache, while HTML and other unhashed files revalidate. Changed files receive new hashes on the next build. The first visit still downloads the selected models and atlases, and joining a match can wait for container startup. Standalone Docker continues to serve its own `dist` files on port 8080.

Multiplayer traffic routes to one named container, because rooms are held in process memory. Keep `max_instances: 1` and the stable routing name until room-aware routing is implemented. The starting size is `standard-2` (1 vCPU); this is a starting configuration, not a tested room-capacity guarantee. Active WebSockets keep it awake; after 10 minutes without activity it can sleep and start again on the next multiplayer or health request. Joining allows up to 40 seconds for the socket to open during a cold start, then 8 seconds for the server's room acknowledgement; successful connections continue immediately. Restarts and deployments disconnect matches and clear rooms and scores.

See Cloudflare's [deployment guide](https://developers.cloudflare.com/containers/get-started/), [Static Assets routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/), [cache headers](https://developers.cloudflare.com/workers/static-assets/headers/), and [instance sizes](https://developers.cloudflare.com/containers/platform/limits/).

## Controls

| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look |
| Shift | Sprint |
| C or Ctrl | Slide while moving fast / crouch |
| Space | Jump / mantle low ledges |
| E | Attach to a nearby yellow rope / release it |
| Q | Use your character power (press again after its cooldown) |
| Left mouse | Fire |
| Right mouse (hold) | Aim down the weapon’s main sight |
| R | Reload early (empty magazines reload automatically) |
| Tab (hold) | Scoreboard |
| Escape | Menu / release mouse |

Chain sprint → crouch → jump to preserve momentum. Slides build a short push, steer gently, and slow through friction; release crouch to exit. Crouch before a fast landing to continue sliding. A short jump buffer and ledge grace window help jumps connect without requiring frame-perfect timing. Repeated crouch taps cannot stack slide boosts. Orange pads launch you toward high ground. Practice targets give hit feedback while you wait for friends; their health bars stay at 100 HP, and they do not count toward player kills.

## Powers and style

Each character has one power, checked by the server and shown on the Q cooldown meter. Powers cannot activate while dead or attached to a rope. Cooldowns carry through deaths and class changes, and reset for a new round.

| Character | Power | Cooldown |
| --- | --- | --- |
| Ember | **Blast Pop:** a thrown puck pops after 0.65 seconds, launching nearby players (including Ember) without damage. Walls block its push. | 12s |
| Wisp | **Echo:** a running hologram with harmless fake flashes lasts up to 4 seconds and glitches away when shot. It can distract bots. | 12s |
| Dash | **Air Juke:** a brief directional burst on the ground or in the air. Walls stop it; firing pauses during the burst. | 8s |
| Rook | **Bulwark:** a 120 HP frontal shield lasts up to 4 seconds. Move and reload while protected; firing pauses and your back stays exposed. | 16s |

A rope release or launchpad jump followed by a fast landing slide earns **Smooth Operator**. Airborne eliminations earn **Air Mail**. These callouts are cosmetic. Stationary round winners briefly celebrate; movement or combat cancels the pose, and reduced-motion settings disable it. Effects reuse existing models and bounded pools without extra model or texture downloads.

## Arenas and traversal

Select an arena in the lobby to preview it. New rooms use your selection; joining an existing room always loads that room's arena. Invite links include the map, and the server owns the room's map for movement, shooting, respawns, and round resets.

| Arena | Routes and environment |
| --- | --- |
| Canyon Relay | Winding rock passages, a climbable stone arch, layered mesas, an elevated relay station, and faceted cliff silhouettes. |
| Freight Yard | A long loading hangar, twin rail beds with flatcars, container tunnels, a high gantry walkway, and port cranes and silos. |
| Sky Garden | An octagonal amphitheatre, terraced gardens with trees, elevated galleries, an open conservatory, and floating towers above the clouds. |
| Solstice | The original compact training court, terraces, mantle ledges, and launch pads. |

Each new arena has four or five rope routes including a vertical ascender, three launch pads, six spawn locations, and practice targets. Yellow ropes are usable along their route when close enough; an **E** prompt appears when attachment is possible. Press E to ride toward the far endpoint, or face the desired direction when attaching near the middle. Press E again to drop, or **Space** to jump off with momentum. Ascenders sit beside rooftops: steer toward the roof when jumping off. Orange edge markings identify stairs and mantle surfaces. Building walls, roofs, containers, and terrain shelves all block movement and shots. Terrain uses stepped geometry; ropes are fixed traversal lines rather than swinging physics ropes.

## Classes

| Character | Class | Weapon | Damage | Magazine | Reload |
| --- | --- | --- | --- | --- | --- |
| Ember | Assault | AR-01 automatic rifle | 20 | 24 | 1.35 s |
| Wisp | Sniper | SR-02 scoped bolt-action rifle | 80 | 6 | 2.2 s |
| Dash | Scout | SMG-03 automatic SMG | 14 | 36 | 1.6 s |
| Rook | Heavy | LMG-04 automatic machine gun | 26 | 60 | 3.2 s |

Choose before joining, or use **Esc → Next spawn** during a match. A queued class applies on respawn or the next round; switching does not heal or refill the current weapon. Empty magazines reload automatically using the active class’s reload time. Holding fire resumes automatic weapons after reloading; Sniper still needs a fresh click. You can press R to reload a partial magazine. Your selection is saved locally. All classes retain the same movement and 100 health. Sniper fires once per click, requires a fresh press after cycling the bolt, and uses a magnified scope while holding right mouse. Damage is per body hit; headshot multipliers are not included.

Hold right mouse to aim down the weapon’s main sight. Assault, Scout, and Heavy bring the upright sight to the center with a focused, zoomed view; Sniper uses its magnified scope. Release right mouse to return to hip fire. Aiming keeps the same damage and recoil.

Characters use the approved textured GLB models, with 19-bone rigs for walking, jumping, sliding, and aiming. Each class carries its matching gun and compact holographic sight; first-person arms and class portraits come from those same characters. Practice targets use separate amber training drones and retain their fixed 100 HP bars.

The visual treatment uses the [Deadshot reference study](docs/visual-reference.md): recognizable human and weapon silhouettes, subdued material finishes, and construction detail at a consistent world scale. Arena surfaces include procedural stone courses, paving, concrete formwork, sheet metal and wood. A daylight sky and matching reflections are generated once and shared across maps. Character and gun files and their shared texture atlases are served by the game itself; no third-party asset service is needed at runtime.

## AI opponents

Rooms fill to four fighters with AI: one human starts with three opponents, two humans get two, and four or more humans play without AI. Friends always take priority, up to six humans per room. AI is marked on overhead health bars, the scoreboard, and the kill feed. Empty rooms are removed when the last human leaves.

AI uses the same movement, cover checks, ammunition, damage, kills, reloads, and respawns as players. Bots patrol ground routes, react after a delay, turn gradually, and fire in bursts with imperfect aim. They can fight each other as well as humans. These are lightweight practice opponents; they do not plan advanced rope or rooftop routes. Server tests can set `createGameServer({ botTarget: 0 })` for a room without AI.

## Implemented

- Six-player free-for-all rooms, invitation links, five-minute rounds.
- Four rigged GLB characters, their matching guns, model-rendered portraits, articulated movement, and separate training drones.
- AI opponents fill quiet rooms, participate in authoritative combat, and yield their places to human players.
- Sprinting, friction-based slides, momentum-preserving slide jumps, capped air steering, buffered jumps, ledge grace, low ledge mantling, launch pads, bidirectional zip lines and vertical ascenders.
- Four selectable arenas with map-specific collision, practice targets, spawn points, lighting, and preview cameras; map rendering resources are disposed when switching arenas.
- Clear personal health meter with low-health feedback and depth-tested opponent HP bars that update from server snapshots.
- Four classes with distinct weapons, ammo, reload timing, fire cadence, scoped aiming, hit feedback, 100 health, and two-second respawns.
- Bright muzzle-aligned tracers, impact flashes, dust/chips, and surface bullet marks that fade after 12 seconds. Effects reuse fixed pools and three tiny generated textures.
- Server-controlled movement, cover-aware ray hits, damage, kills, and scores.
- 60 Hz simulation, 20 Hz server snapshots, client prediction and reconciliation, and interpolated movement rendering. Stance height, mantle steps, weapon tilt and remote crouching ease smoothly; camera motion can disable decorative bob, roll and landing dip.
- Mouse sensitivity, low/balanced/high rendering, audio and camera-motion settings.
- Procedural arenas and synthesized sound, with shared character and gun texture atlases.

## Verification

```sh
pnpm run test
pnpm run build
```

Focused tests cover movement direction, collision, jumping, mantling, slide bounds, shooting and reload, input validation, room isolation/capacity, real multi-client combat, respawn acknowledgements, round resets, Origin checks, surface-face normals, room-scoped impact broadcasts, per-class firing/reload/damage, class validation, and switching on respawn/round reset.

Map checks cover clear spawn locations, both directions of all twelve new rope routes, rope release/jump/cooldown, obstruction by walls and ceilings, deterministic traversal replay, active-map camera clearance, map-specific movement and shots, room map authority, invalid map IDs, and respawn/round map persistence. Browser checks verified the new map previews, selector, and public room-code mapping.

Browser checks verified rendering, room creation, joining the same room from two browsers, invite copying, settings, and leaving. The automated browser rejected mouse capture with `WrongDocumentError`, so hands-on mouse aiming and overall feel still need a playtest in an active desktop window. No across-device 60 FPS claim is made.

Rendered shot-effect checks cover first-person and observer views at low quality, walls/floors/undersides, misses/targets, a 500-shot resource-cap check, and effect expiration/clearing. Surface feedback is visual; cover is not destructible.

Models are packaged as **eight separate GLBs with six shared texture atlases**. A first character-and-gun pair downloads **5.69–5.71 MB**, including all six atlases, compared with **6.85 MB** for the previous two complete packs: about **17% fewer model bytes initially**. Each additional pair needs only **441–468 KB** once those atlases are cached. These decimal sizes exclude JavaScript, UI, and static portraits. Loading every model totals **7.06 MB** because separate files add packaging overhead.

The split preserves the approved geometry, rigs, skin weights, UVs, materials, and original texture bytes; it applies no further visual optimization. Only the runtime GLBs, shared atlases, and portraits are bundled. Originals and full-detail reference masters stay outside the production build. Further model optimization is deferred. Cloudflare delivers hashed models and shared textures from Static Assets with immutable browser caching. The build reports its gzip estimate separately; the simple Node server does not compress responses by itself. Configure compression on the reverse proxy when hosting standalone Docker.

## Prototype boundaries

Four maps and four weapon classes. This is an original simplified movement system, not a recreation of Apex's advanced movement techniques. No wall running, destructible buildings, swinging ropes, matchmaking service, team mode, abilities, account persistence, voice chat, lag compensation, or production anti-cheat service. The server validates gameplay inputs, but the project is not a hardened public competitive service.

## Source map

- `client/view-motion.js`: fixed-step render interpolation, mantle smoothing, and bounded camera motion.
- `shared/classes.js`: shared class definitions, weapon stats, and class validation.
- `shared/world.js`: arena registry, collision geometry, spawn points, launch pads, rope routes, and practice targets.
- `shared/simulation.js`: deterministic movement and ray shooting shared by client/server.
- `server/index.js`: HTTP serving, room lifecycle, validation, authoritative combat.
- `server/bots.js`: AI patrol routes, perception, movement inputs, and firing decisions.
- `client/game-models.js`: asynchronous per-class GLB loading, shared textures, skeleton instances, weapon fitting, and first-person arms.
- `client/characters.js`: rig animation and separate procedural training drones.
- `client/weapon-sight.js`: shared compact holographic sight geometry.
- `client/arena.js`: procedural environment, character and weapon meshes.
- `client/surfaces.js`: world-scaled procedural surface textures and physical material finishes.
- `client/daylight.js`: shared generated daylight sky and reflections.
- `client/shot-effects.js`: pooled shot streaks, impact bursts, and fading surface marks.
- `client/main.js`: controls, network prediction, camera, sound, and interface.
- `client/ui.css`: lobby, HUD, menus, settings, scoreboard.
