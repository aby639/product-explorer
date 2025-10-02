/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'images.worldofbooks.com' },
      { protocol: 'https', hostname: 'www.worldofbooks.com' },
      { protocol: 'https', hostname: 'static.wobcdn.com' },
      { protocol: 'https', hostname: 'd1w7fb2mkkr3kw.cloudfront.net' }
    ]
  },
  outputFileTracingRoot: process.cwd()
};
module.exports = nextConfig;
