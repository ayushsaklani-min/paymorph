import { describe, expect, it } from 'vitest';
import { DomainError } from '@paymorph/shared';
import {
  formatOperationalMetrics,
  requireMetricsAuthorization,
} from '../src/lib/server/metrics.js';

const METRICS_TOKEN = 'a'.repeat(43);

describe('metrics authorization', () => {
  it('accepts only the configured bearer token', () => {
    const request = new Request('https://paymorph.example/api/metrics', {
      headers: { authorization: `Bearer ${METRICS_TOKEN}` },
    });

    expect(() => requireMetricsAuthorization(request, METRICS_TOKEN)).not.toThrow();
    expect(() =>
      requireMetricsAuthorization(
        new Request('https://paymorph.example/api/metrics'),
        METRICS_TOKEN,
      ),
    ).toThrow(new DomainError('UNAUTHENTICATED', 'Metrics authorization is required'));
    expect(() =>
      requireMetricsAuthorization(
        new Request('https://paymorph.example/api/metrics', {
          headers: { authorization: `Bearer ${'b'.repeat(43)}` },
        }),
        METRICS_TOKEN,
      ),
    ).toThrow(new DomainError('FORBIDDEN', 'Metrics authorization is invalid'));
    expect(() => requireMetricsAuthorization(request, 'not-a-valid-token')).toThrow(
      new DomainError('FORBIDDEN', 'Metrics endpoint is not configured'),
    );
  });
});

describe('Prometheus operational metrics', () => {
  it('emits bounded status labels and only aggregate operational values', () => {
    const body = formatOperationalMetrics({
      attemptStatuses: [{ status: 'XRPL_VALIDATED', count: 2 }],
      jobStatuses: [{ status: 'READY', count: 3 }],
      webhookDeliveryStatuses: [{ status: 'PENDING\nsecret', count: 1 }],
      dueExecutorJobs: 4,
    });

    expect(body).toContain('paymorph_payment_attempts{status="XRPL_VALIDATED"} 2');
    expect(body).toContain('paymorph_executor_jobs{status="READY"} 3');
    expect(body).toContain('paymorph_merchant_webhook_deliveries{status="PENDING_secret"} 1');
    expect(body).toContain('paymorph_executor_jobs_due 4');
    expect(body).not.toContain('"PENDING\nsecret"');
  });
});
