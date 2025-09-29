/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a fully static export to /out
  output: 'export',

  // Let the build pass even if ESLint finds issues
  eslint: { ignoreDuringBuilds: true },

  // Allow <Image /> without the image optimizer (needed for static export)
  images: { unoptimized: true },
};

module.exports = nextConfig;
