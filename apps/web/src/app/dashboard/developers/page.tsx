import { requireMerchant } from '@/lib/server/auth/session';
import { db } from '@paymorph/db';
export default async function DevelopersPage() {
  const merchant = await requireMerchant();
  const keys = await db.apiKey.findMany({
    where: { merchantId: merchant.id },
    select: { id: true, name: true, prefix: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return (
    <main id="main-content" tabIndex={-1} className="py-12">
      <p className="text-sm text-[var(--muted)]">Developer platform</p>
      <h1 className="mt-2 text-4xl font-semibold">API keys</h1>
      <p className="mt-3 text-[var(--muted)]">
        Use `POST /api/api-keys` from the authenticated dashboard to create a scoped `pm_test_` key.
        The secret is returned once and is never stored in readable form.
      </p>
      <section className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
        <h2 className="font-semibold">Issued keys</h2>
        {keys.length ? (
          <ul className="mt-4 space-y-3">
            {keys.map((key) => (
              <li className="flex justify-between border-b border-[var(--line)] pb-3" key={key.id}>
                <span>
                  {key.name}
                  <span className="ml-2 font-mono text-sm text-[var(--muted)]">{key.prefix}…</span>
                </span>
                <span className="text-sm text-[var(--muted)]">{key.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[var(--muted)]">No API keys issued.</p>
        )}
      </section>
      <pre className="mt-8 overflow-x-auto rounded-2xl bg-black/30 p-5 text-sm text-[var(--muted)]">{`curl -H "Authorization: Bearer pm_test_..." http://localhost:3000/api/v1/invoices`}</pre>
    </main>
  );
}
