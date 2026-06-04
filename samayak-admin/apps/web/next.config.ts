import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.platform === 'win32' ? undefined : 'standalone',
  transpilePackages: ['@samayak/types'],
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
  },
};

export default nextConfig;
