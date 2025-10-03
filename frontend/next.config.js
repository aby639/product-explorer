// next.config.js
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
};

export default nextConfig;
