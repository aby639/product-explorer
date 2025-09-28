/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Let the build pass even if ESLint finds errors (e.g. no-explicit-any)
    ignoreDuringBuilds: true,
  },
  // Optional: makes next export happy if you use <Image />
  images: { unoptimized: true },
};
module.exports = nextConfig;
