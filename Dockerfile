# Build stage: full toolchain, produces build/.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts: better-sqlite3 v13 ships N-API prebuilds inside the npm
# tarball (its package.json sets gypfile:false), so nothing here needs to
# compile; the npm bundled with node:22 still runs an implicit node-gyp
# rebuild for binding.gyp packages under `npm ci` (the lockfile does not
# record gypfile), which fails in this slim image (no Python/compiler).
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# Runtime stage: the built server, the migrations, and enough tooling to run
# operational scripts (bootstrap-admin, create-cycle) with tsx on the server.
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src/lib ./src/lib
CMD ["node", "build"]
