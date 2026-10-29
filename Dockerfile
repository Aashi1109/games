FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates libatomic1 \
  && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/pnpm/pnpm:12.10.1 /opt/pnpm /opt/pnpm
ENV PATH="/opt/pnpm:$PATH"
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

FROM base AS dependencies
RUN pnpm install --prod --frozen-lockfile

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
# Reject Git LFS pointers before shipping the arena's character models.
RUN node -e "for (const name of ['ember', 'wisp', 'dash', 'rook']) for (const kind of ['character', 'gun']) { const file = './public/drift/output/models/tripo-runtime/' + name + '-' + kind + '.glb'; if (require('node:fs').readFileSync(file).subarray(0, 4).toString() !== 'glTF') throw new Error(file + ': missing GLB data; run git lfs pull before building'); }"
RUN pnpm run build \
  && rm -rf .next/cache .next/dev .next/types .next/diagnostics \
    .next/trace .next/trace-build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/assets ./assets
COPY package.json next.config.mjs ./
COPY src/server.ts ./src/server.ts
COPY src/server ./src/server
COPY src/games/drift/server ./src/games/drift/server
COPY src/games/drift/shared ./src/games/drift/shared
COPY src/games/doodle-dash/room-service.ts src/games/doodle-dash/server-api.ts src/games/doodle-dash/types.ts ./src/games/doodle-dash/
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "src/server.ts"]
