/** @type {import('next').NextConfig} */
const nextConfig = {
  // write static files to /out
  output: 'export',

  // let the build succeed even if ESLint finds issues
  eslint: { ignoreDuringBuilds: true },

  // needed for static export when using <Image />
  images: { unoptimized: true }
};
module.exports = nextConfig;

