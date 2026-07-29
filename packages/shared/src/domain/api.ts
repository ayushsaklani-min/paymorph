import { randomUUID } from 'node:crypto';
import type { PayMorphErrorCode } from './errors.js';

export interface ApiError {
  code: PayMorphErrorCode;
  message: string;
  details?: unknown;
}

export interface ApiEnvelope<T> {
  data: T | null;
  error: ApiError | null;
  requestId: string;
}

export function successEnvelope<T>(data: T, requestId: string = randomUUID()): ApiEnvelope<T> {
  return { data, error: null, requestId };
}

export function errorEnvelope(
  code: PayMorphErrorCode,
  message: string,
  details?: unknown,
  requestId: string = randomUUID(),
): ApiEnvelope<never> {
  return {
    data: null,
    error: details === undefined ? { code, message } : { code, message, details },
    requestId,
  };
}
