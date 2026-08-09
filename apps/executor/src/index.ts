import { runExecutorService } from './executor-service.js';

const controller = new AbortController();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => controller.abort(signal));
}

await runExecutorService(controller.signal);
