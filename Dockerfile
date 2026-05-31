# Bypass Nixpacks — fetching nixpkgs from GitHub has been intermittently
# failing with 504. A direct Dockerfile keeps the build off that dependency
# and gives us a deterministic Node version.
#
# Node 20 (LTS) + Prisma 5.22 is the supported combo (see CLAUDE.md).

FROM node:20-bookworm-slim AS deps

# Prisma needs OpenSSL at runtime on Debian/Ubuntu slim images
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for better layer caching
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# ── Build stage ────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
# `next build` also runs `prisma generate` (see package.json build script)
RUN npm run build

# ── Runtime ────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

# Copy the built app + everything Next.js needs at runtime.
# Note: no `public/` directory in this repo, so we don't copy one.
COPY --from=build /app/node_modules   ./node_modules
COPY --from=build /app/.next          ./.next
COPY --from=build /app/package.json   ./package.json
COPY --from=build /app/prisma         ./prisma
COPY --from=build /app/next.config.js ./next.config.js

# Railway sets $PORT; Next.js respects it via `next start -p $PORT`.
EXPOSE 8080

# `npm start` runs `prisma db push --accept-data-loss && next start`
CMD ["npm", "start"]
