# Questline

One Next.js App Router application containing 20 playable games. The shelf, DRIFT and every other game have React pages. Next.js compiles their TypeScript and CSS; game engines run in client components with mount/unmount cleanup.

## Run

Use Node.js 24 or newer and pnpm 12.10.1, pinned by `packageManager` in `package.json`:

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

Open <http://localhost:4180>. Production:

```sh
pnpm run build
pnpm start
```

`HOST` and `PORT` override the defaults (`127.0.0.1:4180`). Stop with Ctrl+C.

There is one package manifest, one dependency install, one build and one server. DRIFT has no separate project, Vite build, server process, port, proxy or deployment.

## Structure

```text
src/
  app/                 Shelf, (games)/[slug] page, and API routes
  components/          Shared React components and game shelf
  games/               Game components, client engines, simulation and tests
    drift/             DRIFT client, shared simulation and multiplayer logic
  lib/                 Catalogue and game lifecycle utilities
  server/              Shared in-memory multiplayer runtime
  server.ts           Single Next.js HTTP/WebSocket entry point
public/                Game fonts, audio, models and images
assets/                Shared application art (public/assets points here)
design/                Editable design/design.pen and design source assets
docs/                  Game notes, research and historical references
tests/                 App integration and browser checks
tmp/                   Ignored scratch files, reports, local tools and archives
```

Keep temporary scripts, downloads, model experiments, logs and screenshots in `tmp/`. It is excluded from Git, ESLint, formatting, Docker and VS Code's explorer/search. Next's standard compiler output remains in `.next/`; installed dependencies remain in `node_modules/`.

Version application source, runtime assets, tests, documentation, package and build configuration, and deployment files. Local editor/agent settings, environment files, generated output, and the optional `design/` source archive are ignored. Runtime `.glb` models use Git LFS; keep `.gitattributes` and fetch LFS assets when checking out the repository. Unused exports under `assets/design` and `assets/design-crops` stay local as well.

Original standalone launch files and generated bundles are preserved locally under `tmp/archive/` for reference. They are not part of the application. Local model tooling is under `tmp/models/`; original DRIFT model masters remain in `design/assets/drift/models/`. Runtime textures keep their original layout under `public/drift/output/models/tripo-runtime/`.

## Pages and multiplayer

A single `src/app/(games)/[slug]/page.tsx` renders every game and the arcade hub. Known slugs are statically generated; unknown slugs return 404. Metadata comes from `src/lib/game-pages.ts`, and `src/components/game-page.tsx` lazy-loads only the selected game’s component and CSS. Each shelf entry keeps its own URL, including `/drift/`, `/faultline/`, `/trap-sprint/`, `/daily-circuit/`, `/bumper-ring/`, `/block-bloom/`, `/shelf-shuffle/`, `/wobble-delivery/` and `/corner-rush/`.

The single entry point hosts Next.js and attaches DRIFT's authoritative WebSocket multiplayer to the same HTTP listener at `/drift/ws`. Doodle Dash HTTP APIs are Next.js route handlers under `/doodle-dash/api/`. Health routes are `/health/` and `/drift/health/` (unslashed URLs redirect).

Use the root `dev` and `start` commands so the multiplayer runtime is initialized. Room state lives in memory and resets when the process restarts. Deploy one persistent Node instance; multiple replicas need shared room state or room affinity before they can support the same rooms.

Native links between games start a fresh document. Within each page, the client component owns and cleans up its engine, event listeners, animation frames and network resources. Canvas/WebGL simulation stays outside React's render loop.

## Checks

Tests run locally in the Git pre-commit hook. `pnpm install` installs the hook for local checkouts while preserving Git LFS hooks. Each commit runs game unit tests, a fresh production build, server and lifecycle tests, and browser tests against a temporary local server. Install Chromium once before committing. Lint, type, format, and dependency-audit commands remain available locally.

```sh
pnpm run check          # ESLint, TypeScript and Prettier
pnpm run build          # Next.js production build
pnpm run test:launch    # Pages, assets, one listener, APIs and WebSockets
pnpm run test:lifecycle # Client mount/unmount resource cleanup
pnpm run test:e2e       # All 20 games and shelf interactions (server running)
```

For browser tests, install Chromium once with `pnpm exec playwright install chromium`, or use installed Chrome with `PLAYWRIGHT_CHANNEL=chrome pnpm run test:e2e`. Set `BASE_URL` to test another host. Reports and screenshots go to `tmp/`.

All application code is strict TypeScript. The Node 24 entry point runs `.ts` files directly using native type stripping; `pnpm run typecheck` validates them separately. Runtime imports use explicit `.ts` extensions and erasable TypeScript syntax. Existing Node unit test fixtures remain JavaScript and import the typed engines.

Game unit tests remain beside their engines. `pnpm test` runs all game unit tests; use a specific file or the `test:drift`, `test:faultline` and `test:arcade` scripts for narrower checks.

Dependencies are pinned in the root `pnpm-lock.yaml`: Next.js 16.4, React 19.3, Three.js 0.186.1 and TypeScript 7. TypeScript 6's API package remains alongside the native TypeScript 7 compiler for Next/ESLint tooling compatibility. ESLint 9.39.5 is the latest version compatible with the current Next.js lint plugins; ESLint 10's peer dependencies are not yet supported by those plugins. `pnpm audit --prod` checks production dependencies. The current development audit reports the upstream Next.js lint dependency chain through `braces`; do not downgrade Next.js to silence it.

## Docker

Fetch Git LFS assets if needed, then build and run the whole application:

```sh
git lfs pull
docker build -t questline .
docker run --rm -p 4180:8080 questline
```

The runtime uses Node 24, production dependencies and an unprivileged user. It excludes design work, tests, temporary files, model-generation tools and standalone game infrastructure. Health checks use the app's own health route.

The Docker context allows only package manifests, Next.js/TypeScript build configuration, application source, public files, and shared runtime assets. Unit tests, editor and agent files, environment files, and unused `assets/design` exports are excluded. The production stage copies compiled output and the custom server's runtime modules; Next's build cache, development output, generated types, diagnostics, and build traces are removed before that copy. Runtime fonts, model textures, asset provenance, and the `public/assets` symlink are preserved.
