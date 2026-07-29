import { DomainError } from '@paymorph/shared';
import { z } from 'zod';

const responseSchema = z.object({
  result: z.object({
    status: z.literal('success'),
    ledger_current_index: z.number().int().positive(),
  }),
});

export async function getCurrentXrplLedgerIndex(): Promise<number> {
  const endpoint = process.env.XRPL_RPC_URL ?? 'https://s.altnet.rippletest.net:51234';
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        method: 'ledger_current',
        params: [{ api_version: 2 }],
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new DomainError('QUOTE_ROUTE_UNAVAILABLE', 'XRPL Testnet is unavailable', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!response.ok) {
    throw new DomainError(
      'QUOTE_ROUTE_UNAVAILABLE',
      `XRPL Testnet returned HTTP ${response.status}`,
    );
  }
  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new DomainError('QUOTE_ROUTE_UNAVAILABLE', 'XRPL returned an invalid ledger response');
  }
  return parsed.data.result.ledger_current_index;
}
