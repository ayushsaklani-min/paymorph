export const API_KEY_SCOPE_OPTIONS = [
  {
    value: 'invoices:read',
    label: 'Read invoices',
    description: 'List merchant-owned invoices.',
  },
  {
    value: 'invoices:write',
    label: 'Manage invoices',
    description: 'Create and publish immutable invoices.',
  },
  {
    value: 'payment-links:read',
    label: 'Read payment links',
    description: 'List hosted payment links.',
  },
  {
    value: 'payment-links:write',
    label: 'Manage payment links',
    description: 'Create, launch, and archive payment links.',
  },
  {
    value: 'payments:read',
    label: 'Read payments',
    description: 'Read payment status and final receipts.',
  },
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPE_OPTIONS)[number]['value'];

const apiKeyScopes = new Set<ApiKeyScope>(API_KEY_SCOPE_OPTIONS.map((option) => option.value));

export function filterApiKeyScopes(value: unknown): ApiKeyScope[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (scope): scope is ApiKeyScope =>
      typeof scope === 'string' && apiKeyScopes.has(scope as ApiKeyScope),
  );
}

export interface ApiKeyListItem {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  status: 'ACTIVE' | 'REVOKED';
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}
