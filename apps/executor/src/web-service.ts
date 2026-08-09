import { createServer } from 'node:http';
import { db } from '@paymorph/db';
import { createExecutorLogger } from './logging.js';
import { runExecutorService } from './executor-service.js';
import { deliverPendingMerchantWebhooks } from './merchant-webhooks.js';

const logger = createExecutorLogger();
const controller = new AbortController();
const port = parsePort(process.env.PORT);
let executorFailed = false;
let deliveryInFlight = false;
let activeDelivery: Promise<void> | undefined;

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(executorFailed ? 503 : 200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: executorFailed ? 'degraded' : 'ok' }));
    return;
  }

  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'Not found' }));
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => controller.abort(signal));
}

await new Promise<void>((resolve) => server.listen(port, '0.0.0.0', resolve));
logger.info({ port }, 'executor web service listening');

const scheduleWebhookDelivery = () => {
  if (deliveryInFlight || controller.signal.aborted) return;
  deliveryInFlight = true;
  const batch = (async () => {
    try {
      const summary = await deliverPendingMerchantWebhooks();
      if (summary.claimed > 0) logger.info(summary, 'merchant webhook delivery batch completed');
    } catch (error) {
      logger.error({ err: error }, 'merchant webhook delivery batch failed');
    } finally {
      deliveryInFlight = false;
    }
  })();
  activeDelivery = batch;
  void batch.finally(() => {
    if (activeDelivery === batch) activeDelivery = undefined;
  });
};

scheduleWebhookDelivery();
const webhookTimer = setInterval(scheduleWebhookDelivery, 60_000);

try {
  await runExecutorService(controller.signal, logger, { disconnectDatabase: false });
} catch (error) {
  executorFailed = true;
  logger.error({ err: error }, 'executor web service failed');
  process.exitCode = 1;
} finally {
  clearInterval(webhookTimer);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await activeDelivery;
  await db.$disconnect();
}

function parsePort(value: string | undefined): number {
  const parsed = Number(value ?? 10_000);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error('PORT must be a valid TCP port');
  }
  return parsed;
}
