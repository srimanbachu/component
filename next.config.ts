import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pin the workspace root to this folder (a stray lockfile higher up confuses detection)
  turbopack: { root: process.cwd() },
};

export default nextConfig;
