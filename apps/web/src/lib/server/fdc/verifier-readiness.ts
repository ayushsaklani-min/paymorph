import { z } from 'zod';

const READINESS_CACHE_MS = 30_000;

const environmentSchema = z.object({
  FDC_VERIFIER_API_KEY: z.string().trim().min(1),
  FDC_VERIFIER_URL: z.url(),
});

type FetchFunction = typeof fetch;

export class FdcVerifierReadinessError extends Error {
  constructor(
    readonly code: 'CONFIGURATION' | 'INVALID_RESPONSE' | 'UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'FdcVerifierReadinessError';
  }
}

export class FdcVerifierReadiness {
  #readyAt: number | undefined;

  constructor(
    private readonly config: { readonly apiKey: string; readonly verifierUrl: string },
    private readonly fetchFn: FetchFunction = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async assertReady(): Promise<void> {
    const now = this.now();
    if (this.#readyAt !== undefined && now - this.#readyAt < READINESS_CACHE_MS) return;

    let response: Response;
    try {
      response = await this.fetchFn(indexerStateUrl(this.config.verifierUrl), {
        cache: 'no-store',
        headers: { 'X-API-KEY': this.config.apiKey },
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new FdcVerifierReadinessError(
        'UNAVAILABLE',
        'FDC verifier readiness request could not be completed',
      );
    }

    if (!response.ok) {
      throw new FdcVerifierReadinessError(
        'UNAVAILABLE',
        `FDC verifier readiness returned HTTP ${response.status}`,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new FdcVerifierReadinessError(
        'INVALID_RESPONSE',
        'FDC verifier readiness response was not JSON',
      );
    }
    if (!isIndexerState(body)) {
      throw new FdcVerifierReadinessError(
        'INVALID_RESPONSE',
        'FDC verifier readiness response did not include XRP indexer state',
      );
    }

    this.#readyAt = now;
  }
}

let configured:
  | {
      readonly cacheKey: string;
      readonly readiness: FdcVerifierReadiness;
    }
  | undefined;

export function assertConfiguredFdcVerifierReady(): Promise<void> {
  const parsed = environmentSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new FdcVerifierReadinessError(
      'CONFIGURATION',
      'FDC verifier URL and API key must be configured before accepting payments',
    );
  }

  const cacheKey = `${parsed.data.FDC_VERIFIER_URL}\u0000${parsed.data.FDC_VERIFIER_API_KEY}`;
  if (configured?.cacheKey !== cacheKey) {
    configured = {
      cacheKey,
      readiness: new FdcVerifierReadiness({
        apiKey: parsed.data.FDC_VERIFIER_API_KEY,
        verifierUrl: parsed.data.FDC_VERIFIER_URL,
      }),
    };
  }
  return configured.readiness.assertReady();
}

function indexerStateUrl(verifierUrl: string): string {
  return new URL('/verifier/xrp/api/indexer/state', verifierUrl).toString();
}

function isIndexerState(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.data)) return false;
  const top = value.data.top_indexed_block;
  return isRecord(top) && typeof top.height === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
