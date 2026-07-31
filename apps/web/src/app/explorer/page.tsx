import { db, AttemptStatus } from '@paymorph/db';

export default async function ExplorerPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const query = (await searchParams).q?.trim();
  const attempts = query
    ? await db.paymentAttempt.findMany({
        where: {
          status: AttemptStatus.SETTLED,
          OR: [{ id: query }, { paymentId: query }, { xrplTxHash: query }, { flareTxHash: query }],
        },
        include: { invoice: { select: { title: true, settlementAsset: true } } },
        take: 20,
      })
    : [];
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-12">
      <a className="text-lg font-semibold" href="/">
        PayMorph
      </a>
      <p className="mt-10 text-sm text-[var(--muted)]">Public evidence explorer</p>
      <h1 className="mt-2 text-4xl font-semibold">Verify a settled payment</h1>
      <p className="mt-3 text-[var(--muted)]">
        Search a PayMorph payment ID, receipt ID, XRPL hash, or Coston2 transaction hash. Only
        decoded `PaymentSettled` evidence is listed.
      </p>
      <form className="mt-8 flex gap-3" action="/explorer">
        <input
          className="min-h-12 flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4"
          defaultValue={query}
          name="q"
          placeholder="Payment ID or transaction hash"
          required
        />
        <button className="rounded-full bg-[var(--accent)] px-6 font-semibold text-[var(--accent-ink)]">
          Search
        </button>
      </form>
      {query ? (
        <section className="mt-8 space-y-3">
          {attempts.length ? (
            attempts.map((attempt) => (
              <a
                className="block rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 hover:border-[var(--accent)]"
                href={`/receipts/${attempt.id}`}
                key={attempt.id}
              >
                <p className="font-semibold">{attempt.invoice.title}</p>
                <p className="mt-2 font-mono text-sm text-[var(--muted)]">{attempt.paymentId}</p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {attempt.invoice.settlementAsset} · SETTLED
                </p>
              </a>
            ))
          ) : (
            <p className="text-[var(--muted)]">No final settlement receipt matches this query.</p>
          )}
        </section>
      ) : null}
    </main>
  );
}
