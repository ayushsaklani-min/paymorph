import { db } from '@paymorph/db';
import { createExecutorLogger, type ExecutorLogger } from './logging.js';
import { buildExecutorBoundaries } from './worker/boundaries.js';
import { ExecutorConfigurationError, loadExecutorConfig } from './worker/config.js';
import { ExecutorHandlers } from './worker/handlers.js';
import { runExecutorWorker } from './worker/runner.js';
import { PrismaExecutorStore } from './worker/store.js';

export async function runExecutorService(
  signal: AbortSignal,
  logger: ExecutorLogger = createExecutorLogger(),
  options: { readonly disconnectDatabase?: boolean } = {},
): Promise<void> {
  logger.info('executor starting');

  let config;
  try {
    config = loadExecutorConfig();
  } catch (error) {
    if (error instanceof ExecutorConfigurationError) {
      logger.error(
        { invalidEnvironmentVariables: error.invalidEnvironmentVariables },
        'executor configuration invalid',
      );
    }
    throw error;
  }
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
      signal,
    );
  } finally {
    logger.info({ reason: signal.reason }, 'executor stopping');
    await built.close();
    if (options.disconnectDatabase ?? true) await db.$disconnect();
  }
}
