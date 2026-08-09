import type { NextConfig } from 'next';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { PrismaPlugin } = createRequire(import.meta.url)(
  '@prisma/nextjs-monorepo-workaround-plugin',
) as {
  PrismaPlugin: new () => { apply(compiler: unknown): void };
};

export const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
];

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
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  transpilePackages: ['@paymorph/shared', '@paymorph/ui', '@paymorph/db'],
  webpack(config, { isServer }) {
    if (isServer) {
      config.plugins.push(new PrismaPlugin());
    }
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
