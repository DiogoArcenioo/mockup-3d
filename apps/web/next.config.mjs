import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const api = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';
export default {
  poweredByHeader: false,
  turbopack: { root },
  outputFileTracingRoot: root,
  async rewrites() { return [
    { source: '/api/:path*', destination: `${api}/api/:path*` },
    { source: '/legacy/api/:path*', destination: `${api}/api/:path*` },
  ]; },
  async headers() { return [{ source: '/:path*', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'" },
  ] }]; },
};
