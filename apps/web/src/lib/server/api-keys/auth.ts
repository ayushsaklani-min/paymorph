import { DomainError } from '@paymorph/shared';
import type { ApiKey } from '@paymorph/db';
import { authenticateApiKey, type ApiKeyScope } from './service.js';

export async function requireApiKey(request: Request, scope: ApiKeyScope): Promise<ApiKey> {
  const authorization = request.headers.get('authorization');
  const match = authorization?.match(/^Bearer (pm_test_[A-Za-z0-9_-]{20,})$/);
  if (!match) throw new DomainError('UNAUTHENTICATED', 'Bearer API key is required');
  return authenticateApiKey(match[1]!, scope);
}
