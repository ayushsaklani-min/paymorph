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
    <main className="pm-shell mx-auto min-h-screen max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="pm-panel flex items-center justify-between gap-4 rounded-2xl px-4 py-3 sm:px-5">
        <a className="flex items-center gap-2.5" href="/">
          <span className="grid size-7 place-items-center rounded-lg border border-[var(--accent)]/35 bg-[var(--accent)]/10 text-xs font-black text-[var(--accent)]">
            P
          </span>
          <span className="text-sm font-semibold tracking-[-0.025em]">PayMorph</span>
        </a>
        <span className="pm-data text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
          Evidence explorer
        </span>
      </header>
      <p className="pm-kicker mt-14">Public evidence explorer</p>
      <h1 className="pm-display mt-4 text-4xl sm:text-5xl">Verify a settled payment.</h1>
      <p className="mt-4 max-w-2xl leading-7 text-[var(--muted-strong)]">
        Search a PayMorph payment ID, receipt ID, XRPL hash, or Coston2 transaction hash. Only
        decoded `PaymentSettled` evidence is listed.
      </p>
      <form
        className="pm-panel mt-8 flex flex-col gap-3 rounded-3xl p-3 sm:flex-row"
        action="/explorer"
      >
        <input
          className="min-h-12 flex-1 rounded-2xl border border-[var(--line)] bg-black/20 px-4 text-sm outline-none transition focus:border-[var(--accent)]/50"
          defaultValue={query}
          name="q"
          placeholder="Payment ID or transaction hash"
          required
        />
        <button className="pm-button pm-button-primary min-h-12 px-6 font-semibold">Search</button>
      </form>
      {query ? (
        <section className="mt-8 space-y-3">
          {attempts.length ? (
            attempts.map((attempt) => (
              <a
                className="pm-card block rounded-3xl p-5"
                href={`/receipts/${attempt.id}`}
                key={attempt.id}
              >
                <p className="pm-display text-xl">{attempt.invoice.title}</p>
                <p className="pm-data mt-3 text-xs text-[var(--muted)]">{attempt.paymentId}</p>
                <p className="mt-3 text-sm text-[var(--muted)]">
                  {attempt.invoice.settlementAsset} · SETTLED
                </p>
              </a>
            ))
          ) : (
            <p className="pm-card rounded-3xl p-6 text-[var(--muted)]">
              No final settlement receipt matches this query.
            </p>
          )}
        </section>
      ) : null}
    </main>
  );
}
