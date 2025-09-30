/** @type {import('next').NextConfig} */
const nextConfig = {
  // make sure you are NOT exporting statically
  // output: 'export', // <-- keep this commented/removed

  eslint: { ignoreDuringBuilds: true },

  images: {
    unoptimized: true, // fine on Render
    remotePatterns: [
      { protocol: 'https', hostname: 'images.worldofbooks.com' },
      { protocol: 'https', hostname: 'www.worldofbooks.com' },
      // if you ever see covers coming from a different WOB CDN, add it here
      // { protocol: 'https', hostname: 'cdn.worldofbooks.com' },
    ],
  },

  experimental: {
    outputFileTracingRoot: process.cwd(),
  },
};

module.exports = nextConfig;
