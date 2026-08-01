import { describe, expect, it } from 'vitest';
import { createExecutorLogger, serializeExecutorError } from '../src/logging.js';

describe('executor logging boundary', () => {
  it('keeps only a safe error type and optional machine-readable code', () => {
    const coded = Object.assign(new Error('API key should never be logged'), { code: 'P2024' });

    expect(serializeExecutorError(coded)).toEqual({ type: 'Error', code: 'P2024' });
    expect(serializeExecutorError(new Error('secret=should-not-appear'))).toEqual({
      type: 'Error',
    });
    expect(serializeExecutorError({ code: 'not a safe code' })).toEqual({ type: 'Error' });
  });

  it('redacts credential and opaque-evidence fields from emitted logs', () => {
    const entries: string[] = [];
    const logger = createExecutorLogger({
      destination: { write: (entry) => entries.push(entry) },
    });
    const error = Object.assign(new Error('provider secret should-not-appear'), { code: 'P2024' });

    logger.error(
      {
        err: error,
        authorization: 'Bearer should-not-appear',
        fdcVerifierApiKey: 'should-not-appear',
        userOpDataEnc: 'should-not-appear',
      },
      'executor job failed',
    );

    expect(entries).toHaveLength(1);
    const output = JSON.stringify(JSON.parse(entries[0] ?? '{}'));
    expect(output).not.toContain('should-not-appear');
    expect(JSON.parse(entries[0] ?? '{}')).toMatchObject({
      err: { type: 'Error', code: 'P2024' },
      authorization: '[REDACTED]',
      fdcVerifierApiKey: '[REDACTED]',
      userOpDataEnc: '[REDACTED]',
    });
  });
});
