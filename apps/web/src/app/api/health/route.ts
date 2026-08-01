import { successEnvelope } from '@paymorph/shared';
import { NextResponse } from 'next/server';
import { requestIdFor } from '@/lib/server/http';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const requestId = requestIdFor(request);
  return NextResponse.json(
    successEnvelope(
      {
        status: 'ok' as const,
        service: 'paymorph-web' as const,
      },
      requestId,
    ),
    {
      headers: {
        'cache-control': 'no-store',
        'x-request-id': requestId,
      },
    },
  );
}
