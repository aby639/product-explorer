/** @type {import('next').NextConfig} */
const nextConfig = {
  // run as a server app (REMOVE static export)
  // output: 'export',

  // let the build succeed even if ESLint finds issues
  eslint: { ignoreDuringBuilds: true },

  // fine to keep; harmless on server too
  images: { unoptimized: true },

  // (optional) quiet the “workspace root” warning on Render
  experimental: {
    outputFileTracingRoot: process.cwd(),
  },
};

module.exports = nextConfig;
