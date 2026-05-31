/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Note: top-level `api.bodyParser` was removed in Next 13+. Routes that
  // accept large Excel-derived JSON payloads set their own bodyParser limit
  // via `export const config = { api: { bodyParser: { sizeLimit: '...' } } }`.
};

module.exports = nextConfig;
