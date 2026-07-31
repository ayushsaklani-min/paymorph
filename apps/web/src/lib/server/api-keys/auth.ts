import { DomainError } from '@paymorph/shared';
import type { ApiKey } from '@paymorph/db';
import { assertMutationOrigin } from '../http.js';
import { authenticateApiKey, type ApiKeyScope } from './service.js';

export async function requireApiKey(request: Request, scope: ApiKeyScope): Promise<ApiKey> {
  const authorization = request.headers.get('authorization');
  const match = authorization?.match(/^Bearer (pm_test_[A-Za-z0-9_-]{20,})$/);
  if (!match) throw new DomainError('UNAUTHENTICATED', 'Bearer API key is required');
  return authenticateApiKey(match[1]!, scope);
}

/**
 * Bearer-key calls may originate from server integrations without an Origin
 * header. When a browser does provide one, reject cross-site mutation before
 * inspecting the key so this surface follows the same CSRF boundary as the
 * merchant-cookie API.
 */
export async function requireApiKeyMutation(request: Request, scope: ApiKeyScope): Promise<ApiKey> {
  assertMutationOrigin(request);
  return requireApiKey(request, scope);
}
