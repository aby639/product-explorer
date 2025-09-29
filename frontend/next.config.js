/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a fully static export in /out
  output: 'export',

  // Let the build succeed even if ESLint finds issues
  eslint: { ignoreDuringBuilds: true },

  // Disable Next/Image optimizer so static export works
  images: { unoptimized: true }
};

module.exports = nextConfig;
