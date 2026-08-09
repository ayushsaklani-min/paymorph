import { db } from '@paymorph/db';
import { errorEnvelope } from '@paymorph/shared';
import { NextResponse } from 'next/server';
import { jsonError, jsonSuccess, readJson, requestIdFor } from '@/lib/server/http';
import { scheduleExecutorWake } from '@/lib/server/executor-wake';
import { getPayerRuntimeConfig, processXamanSignInNotification } from '@/lib/server/payer-session';
import { processXamanPaymentNotification } from '@/lib/server/payments';
import { processXamanRecoveryNotification } from '@/lib/server/recovery';
import { XamanBoundaryError } from '@/lib/server/xaman/types';
import { verifyXamanWebhook } from '@/lib/server/xaman/webhook';

export const maxDuration = 120;

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request, 32 * 1_024);
    const config = getPayerRuntimeConfig();
    const timestampHeader = request.headers.get('x-xumm-request-timestamp');
    const signatureHeader = request.headers.get('x-xumm-request-signature');
    const verified = verifyXamanWebhook({
      body,
      timestampHeader,
      signatureHeader,
      applicationSecret: config.xamanWebhookSecret,
      expectedApplicationId: config.xamanApiKey,
    });

    let created = true;
    try {
      await db.webhookEvent.create({
        data: {
          provider: 'XAMAN',
          deliveryKey: verified.referenceCallUuid,
          headersJson: {
            timestamp: timestampHeader,
          },
          bodyJson: {
            applicationId: verified.applicationId,
            payloadUuid: verified.payloadUuid,
            referenceCallUuid: verified.referenceCallUuid,
            signed: verified.signed,
            transactionHash: verified.transactionHash,
          },
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
      created = false;
    }

    if (!created) {
      const previous = await db.webhookEvent.findUnique({
        where: {
          provider_deliveryKey: {
            provider: 'XAMAN',
            deliveryKey: verified.referenceCallUuid,
          },
        },
        select: { processedAt: true },
      });
      if (previous?.processedAt !== null && previous?.processedAt !== undefined) {
        return jsonSuccess(request, { accepted: true, duplicate: true });
      }
    }

    const signIn = await processXamanSignInNotification(verified.payloadUuid);
    let processed = signIn;
    if (!signIn.known) {
      const payment = await processXamanPaymentNotification(verified.payloadUuid);
      processed = payment;
      if (payment.known && payment.signed === true && payment.attemptId !== undefined) {
        scheduleExecutorWake({
          attemptId: payment.attemptId,
          reason: 'PAYMENT_JOB_READY',
        });
      } else if (!payment.known) {
        const recovery = await processXamanRecoveryNotification(verified.payloadUuid);
        processed = recovery;
        if (recovery.known && recovery.signed === true && recovery.attemptId !== undefined) {
          scheduleExecutorWake({
            attemptId: recovery.attemptId,
            reason: 'RECOVERY_JOB_READY',
          });
        }
      }
    }
    await db.webhookEvent.update({
      where: {
        provider_deliveryKey: {
          provider: 'XAMAN',
          deliveryKey: verified.referenceCallUuid,
        },
      },
      data: { processedAt: new Date() },
    });

    return jsonSuccess(request, {
      accepted: true,
      duplicate: !created,
      knownPayload: processed.known,
    });
  } catch (error) {
    if (error instanceof XamanBoundaryError && error.code === 'WEBHOOK_REJECTED') {
      const requestId = requestIdFor(request);
      return NextResponse.json(
        errorEnvelope(
          'UNAUTHENTICATED',
          'Xaman webhook authentication failed',
          undefined,
          requestId,
        ),
        {
          status: 401,
          headers: {
            'cache-control': 'no-store',
            'x-request-id': requestId,
          },
        },
      );
    }
    return jsonError(request, error);
  }
}
