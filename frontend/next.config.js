// next.config.js (ESM because package.json has "type": "module")
/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'images.worldofbooks.com' },
      { protocol: 'https', hostname: 'www.worldofbooks.com' },
    ],
  },
  // NOTE: remove outputFileTracingRoot (it’s not a valid Next option)
};

export default nextConfig;
