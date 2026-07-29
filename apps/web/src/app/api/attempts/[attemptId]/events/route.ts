import { db } from '@paymorph/db';
import { DomainError, isTerminalStatus } from '@paymorph/shared';
import { z } from 'zod';
import { jsonError } from '@/lib/server/http';
import { hashPayerSessionToken, readPayerSessionToken } from '@/lib/server/payer-session';

const idSchema = z.string().uuid();
const encoder = new TextEncoder();

function event(name: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  try {
    const token = readPayerSessionToken(request);
    if (!token) throw new DomainError('PAYER_NOT_IDENTIFIED', 'Payer session required');
    const { attemptId: rawAttemptId } = await context.params;
    const attemptId = idSchema.parse(rawAttemptId);
    const sessionTokenHash = hashPayerSessionToken(token);
    const owned = await db.paymentAttempt.count({
      where: { id: attemptId, payerSession: { sessionTokenHash } },
    });
    if (owned !== 1) throw new DomainError('FORBIDDEN', 'Attempt is not bound to this session');

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let lastVersion = -1;
        let closed = false;
        let polls = 0;
        const close = () => {
          if (closed) return;
          closed = true;
          clearInterval(timer);
          controller.close();
        };
        const poll = async () => {
          try {
            const attempt = await db.paymentAttempt.findFirst({
              where: { id: attemptId, payerSession: { sessionTokenHash } },
              select: {
                id: true,
                status: true,
                version: true,
                xrplTxHash: true,
                flareTxHash: true,
                failureCode: true,
                failureMessage: true,
                updatedAt: true,
              },
            });
            if (!attempt) return close();
            if (attempt.version !== lastVersion) {
              lastVersion = attempt.version;
              controller.enqueue(
                event(polls === 0 ? 'snapshot' : 'transition', {
                  ...attempt,
                  updatedAt: attempt.updatedAt.toISOString(),
                }),
              );
            } else if (polls % 5 === 0) {
              controller.enqueue(encoder.encode(`: heartbeat ${new Date().toISOString()}\n\n`));
            }
            polls += 1;
            if (isTerminalStatus(attempt.status)) close();
          } catch {
            controller.enqueue(event('error', { message: 'Status stream interrupted' }));
            close();
          }
        };
        const timer = setInterval(() => void poll(), 3_000);
        request.signal.addEventListener('abort', close, { once: true });
        setTimeout(close, 5 * 60 * 1_000);
        void poll();
      },
    });
    return new Response(stream, {
      headers: {
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'content-type': 'text/event-stream; charset=utf-8',
        'x-accel-buffering': 'no',
      },
    });
  } catch (error) {
    return jsonError(request, error);
  }
}
