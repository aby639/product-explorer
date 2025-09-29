/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',                // write static files to /out
  eslint: { ignoreDuringBuilds: true },
  images: { unoptimized: true }    // needed for static export
};
module.exports = nextConfig;
