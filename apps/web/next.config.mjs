import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@mastermind/shared'],
  outputFileTracingRoot: path.join(here, '../../'),
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
