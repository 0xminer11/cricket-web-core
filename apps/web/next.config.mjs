import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url));
export default {
  output: 'standalone',
  outputFileTracingRoot: root,
  turbopack: { root },
  poweredByHeader: false,
  async headers() {
    const production = process.env.NODE_ENV === 'production';
    return [
      // Versioned character assets (the version is part of the file name, e.g. player_base_v1.glb)
      // never change in place, so browsers and CDNs may cache them for a year. A new version is a
      // new URL. Development stays uncached so regenerated files show up immediately.
      {
        source: '/game-assets/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: production
              ? 'public, max-age=31536000, immutable'
              : 'no-store',
          },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};
