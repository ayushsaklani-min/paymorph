import { TestnetNotice } from '@paymorph/ui';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8">
      <nav className="flex items-center justify-between border-b border-[var(--line)] pb-5">
        <span className="text-lg font-semibold tracking-tight">PayMorph</span>
        <a
          className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)]"
          href="/login"
        >
          Merchant sign in
        </a>
      </nav>

      <section className="grid flex-1 items-center gap-12 py-20 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="mb-5 font-mono text-xs uppercase tracking-[0.22em] text-[var(--accent)]">
            XRPL Testnet → Flare Coston2
          </p>
          <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-[-0.045em] sm:text-7xl">
            Pay in XRP.
            <br />
            Settle your way.
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-[var(--muted)]">
            One native XRP payment becomes an atomic FXRP or USDT0 merchant settlement, complete
            with programmable revenue splits and a verifiable cross-chain receipt.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <a
              className="rounded-full bg-[var(--accent)] px-6 py-3 font-semibold text-[var(--accent-ink)]"
              href="/login"
            >
              Create a test invoice
            </a>
            <a
              className="rounded-full border border-[var(--line)] px-6 py-3 font-semibold"
              href="/network"
            >
              Network diagnostics
            </a>
          </div>
        </div>

        <div className="rounded-3xl border border-[var(--line)] bg-[var(--surface)]/85 p-7 shadow-2xl">
          <p className="text-sm text-[var(--muted)]">Settlement evidence</p>
          <ol className="mt-6 space-y-5">
            {[
              ['01', 'Xaman signs native XRP'],
              ['02', 'FDC proves the XRPL payment'],
              ['03', 'Coston2 mints and routes FXRP'],
              ['04', 'On-chain events produce the receipt'],
            ].map(([number, label]) => (
              <li className="flex items-center gap-4" key={number}>
                <span className="font-mono text-xs text-[var(--accent)]">{number}</span>
                <span>{label}</span>
              </li>
            ))}
          </ol>
          <TestnetNotice className="mt-8 rounded-xl bg-white/5 p-4 text-sm leading-6 text-[var(--muted)]" />
        </div>
      </section>
    </main>
  );
}
