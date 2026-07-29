import { PrismaClient } from '../generated/client/index.js';

const globalForPrisma = globalThis as unknown as { payMorphPrisma?: PrismaClient };

export const db =
  globalForPrisma.payMorphPrisma ??
  new PrismaClient({
    log: process.env.APP_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.APP_ENV !== 'production') {
  globalForPrisma.payMorphPrisma = db;
}

export * from '../generated/client/index.js';
export * from './attempts.js';
export * from './queue.js';
export * from './nonces.js';
