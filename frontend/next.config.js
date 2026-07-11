/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'https://mingtat-erp-api.onrender.com';
    return {
      // beforeFiles rewrites are checked BEFORE the filesystem (App Router routes).
      // We intentionally leave this empty so that /api/upload-proxy is resolved
      // by the App Router route.ts first, before any rewrite rule can intercept it.
      beforeFiles: [],
      // afterFiles rewrites are checked AFTER the filesystem but BEFORE the 404.
      // Proxy all /api/* to the backend, EXCEPT /api/upload-proxy which is already
      // handled by the App Router above.
      afterFiles: [
        {
          source: '/api/((?!upload-proxy(?:/|$)).*)',
          destination: `${backendUrl}/api/:path*`,
        },
        {
          source: '/uploads/:path*',
          destination: `${backendUrl}/uploads/:path*`,
        },
      ],
      fallback: [],
    };
  },
};

module.exports = nextConfig;
