import { parseEncryptionKey } from '@paymorph/shared';
import { z } from 'zod';

const payerRuntimeConfigSchema = z.object({
  APP_URL: z.url(),
  XAMAN_API_KEY: z.string().uuid(),
  XAMAN_API_SECRET: z.string().min(1),
  XAMAN_WEBHOOK_SECRET: z.string().min(1),
  DATA_ENCRYPTION_KEY_V1: z.string().min(1),
});

interface PayerRuntimeConfig {
  appUrl: string;
  xamanApiKey: string;
  xamanApiSecret: string;
  xamanWebhookSecret: string;
  encryptionKey: Buffer;
}

let cached: PayerRuntimeConfig | undefined;

export function getPayerRuntimeConfig(): PayerRuntimeConfig {
  if (cached !== undefined) {
    return cached;
  }

  const parsed = payerRuntimeConfigSchema.parse(process.env);
  cached = {
    appUrl: parsed.APP_URL.replace(/\/+$/, ''),
    xamanApiKey: parsed.XAMAN_API_KEY,
    xamanApiSecret: parsed.XAMAN_API_SECRET,
    xamanWebhookSecret: parsed.XAMAN_WEBHOOK_SECRET,
    encryptionKey: parseEncryptionKey(parsed.DATA_ENCRYPTION_KEY_V1),
  };
  return cached;
}
