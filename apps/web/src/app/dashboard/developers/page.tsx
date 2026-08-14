import { requireMerchant } from '@/lib/server/auth/session';
import { db } from '@paymorph/db';
import { ApiKeyManager } from '@/features/developers/api-key-manager';
import { filterApiKeyScopes, type ApiKeyListItem } from '@/features/developers/api-key-types';

export default async function DevelopersPage() {
  const merchant = await requireMerchant();
  const keys = await db.apiKey.findMany({
    where: { merchantId: merchant.id },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopesJson: true,
      status: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const initialKeys: ApiKeyListItem[] = keys.map((key) => ({
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    scopes: filterApiKeyScopes(key.scopesJson),
    status: key.status,
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
  }));

  return (
    <main id="main-content" tabIndex={-1} className="py-12">
      <p className="pm-kicker">Developer platform</p>
      <h1 className="pm-display mt-3 text-4xl sm:text-5xl">API keys</h1>
      <p className="mt-4 max-w-3xl leading-7 text-[var(--muted-strong)]">
        Create scoped testnet credentials for trusted servers, integrations, and the PayMorph Node
        client. Credential records retain only a hash; retry material is encrypted and expires, and
        every key can be revoked here.
      </p>
      <ApiKeyManager initialKeys={initialKeys} />
    </main>
  );
}
