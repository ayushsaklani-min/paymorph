import { db } from '@paymorph/db';
import { createExecutorLogger } from './logging.js';
import { buildExecutorBoundaries } from './worker/boundaries.js';
import { loadExecutorConfig } from './worker/config.js';
import { ExecutorHandlers } from './worker/handlers.js';
import { runExecutorWorker } from './worker/runner.js';
import { PrismaExecutorStore } from './worker/store.js';

const logger = createExecutorLogger();

const controller = new AbortController();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => controller.abort(signal));
}

logger.info('executor starting');

const config = loadExecutorConfig();
const built = await buildExecutorBoundaries(config);
const store = new PrismaExecutorStore(config.routerAddress);
const handlers = new ExecutorHandlers(
  store,
  built.boundaries,
  config.encryptionKey,
  config.requiredXrplConfirmations,
);

try {
  await runExecutorWorker(
    store,
    handlers,
    {
      workerId: config.workerId,
      batchSize: config.batchSize,
      leaseMs: config.leaseMs,
      pollIntervalMs: config.pollIntervalMs,
    },
    logger,
    controller.signal,
  );
} finally {
  logger.info({ reason: controller.signal.reason }, 'executor stopping');
  await built.close();
  await db.$disconnect();
}
