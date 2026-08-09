import { db } from '@paymorph/db';
import { deliverPendingMerchantWebhooks } from './merchant-webhooks.js';

try {
  await deliverPendingMerchantWebhooks();
} finally {
  await db.$disconnect();
}
