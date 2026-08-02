/** @type {import('next').NextConfig} */

// Mounted under /parakh on the HR platform, at the root locally and on
// Railway. basePath is baked into the bundle at build time, so BASE_PATH must
// be passed as a Docker build arg AND kept in the runtime env (next.config is
// re-evaluated when the server starts).
const basePath = process.env.BASE_PATH || '';

const nextConfig = {
  reactStrictMode: true,
  ...(basePath ? { basePath } : {}),
  env: {
    // Consumed on the client by src/lib/basePath.js
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  // Note: top-level `api.bodyParser` was removed in Next 13+. Routes that
  // accept large Excel-derived JSON payloads set their own bodyParser limit
  // via `export const config = { api: { bodyParser: { sizeLimit: '...' } } }`.
};

module.exports = nextConfig;
