import { z } from 'zod';

const serverConfigSchema = z.object({
  APP_ENV: z.enum(['development', 'preview', 'production']).default('development'),
  APP_URL: z.url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  COSTON2_CHAIN_ID: z.coerce.number().int().default(114),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

let cached: ServerConfig | undefined;

export function getServerConfig(): ServerConfig {
  cached ??= serverConfigSchema.parse(process.env);
  return cached;
}
