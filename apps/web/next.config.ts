import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

function configuredDevOrigin(): string[] {
  const appUrl = process.env.APP_URL;
  if (appUrl === undefined) return [];
  try {
    return [new URL(appUrl).host];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  allowedDevOrigins: configuredDevOrigin(),
  transpilePackages: ['@paymorph/shared', '@paymorph/ui', '@paymorph/db'],
  webpack(config) {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    return config;
  },
};

export default nextConfig;
