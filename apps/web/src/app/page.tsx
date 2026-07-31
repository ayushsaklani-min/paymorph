import { TestnetNotice } from '@paymorph/ui';

const proofPath = [
  ['01', 'Sign once', 'Approve an exact native XRP Testnet payment in Xaman.'],
  ['02', 'Validate precisely', 'Check the committed payment fields on XRPL.'],
  ['03', 'Prove independently', 'Request FDC evidence for the validated payment.'],
  ['04', 'Settle on-chain', 'Decode PaymentSettled before publishing a receipt.'],
];

export default function HomePage() {
  return (
    <main className="pm-shell overflow-hidden">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-16 pt-4 sm:px-6 sm:pt-6 lg:px-8">
        <nav className="pm-panel flex items-center justify-between rounded-2xl px-4 py-3 sm:px-5">
          <a className="flex items-center gap-3" href="/">
            <MorphMark />
            <span>
              <span className="block text-sm font-semibold tracking-[-0.025em]">PayMorph</span>
              <span className="pm-data block text-[9px] uppercase tracking-[0.18em] text-[var(--muted)]">
                Evidence-first checkout
              </span>
            </span>
          </a>
          <div className="flex items-center gap-2 sm:gap-3">
            <a
              className="hidden text-sm text-[var(--muted)] transition hover:text-[var(--ink)] sm:inline"
              href="/explorer"
            >
              Explorer
            </a>
            <a
              className="pm-button pm-button-secondary px-4 py-2 text-sm font-semibold text-[var(--muted-strong)]"
              href="/login"
            >
              Merchant sign in
            </a>
          </div>
        </nav>

        <section className="relative grid flex-1 items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.06fr_0.94fr] lg:py-28">
          <div className="pointer-events-none absolute right-[-16rem] top-[-11rem] hidden h-[33rem] w-[33rem] rounded-full border border-[var(--accent)]/10 lg:block">
            <span className="pm-orbit right-[-5rem] top-[4rem]" />
            <span className="absolute left-[18%] top-[22%] size-2 rounded-full bg-[var(--accent-blue)] shadow-[0_0_24px_rgba(143,181,255,0.9)]" />
          </div>

          <div className="relative z-10">
            <p className="pm-kicker">XRPL Testnet · Flare Coston2</p>
            <h1 className="pm-display mt-6 max-w-3xl text-5xl leading-[0.93] sm:text-7xl lg:text-[5.35rem]">
              Payment clarity,
              <br />
              <span className="text-[var(--accent)]">all the way</span> through.
            </h1>
            <p className="mt-7 max-w-xl text-base leading-8 text-[var(--muted-strong)] sm:text-lg">
              A native XRP payment becomes a verifiable FXRP merchant settlement—without asking
              anyone to trust a redirect, callback, or database row.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                className="pm-button pm-button-primary inline-flex items-center gap-2 px-6 py-3.5 text-sm font-bold"
                href="/login"
              >
                Create a test invoice <span aria-hidden="true">↗</span>
              </a>
              <a
                className="pm-button pm-button-secondary inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-[var(--muted-strong)]"
                href="/network"
              >
                Inspect network <span aria-hidden="true">→</span>
              </a>
            </div>
            <div className="mt-10 flex flex-wrap gap-2.5 text-[11px] font-medium text-[var(--muted)]">
              {['Xaman identity', 'Exact XRP payment', 'FDC evidence', 'On-chain receipt'].map(
                (item) => (
                  <span
                    className="rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5"
                    key={item}
                  >
                    {item}
                  </span>
                ),
              )}
            </div>
          </div>

          <div className="pm-scroll-reveal relative z-10">
            <div className="pm-panel rounded-[2rem] p-4 sm:p-5">
              <div className="relative overflow-hidden rounded-[1.45rem] border border-white/[0.08] bg-[#0a111a] p-5 sm:p-7">
                <div className="absolute inset-x-0 top-0 h-36 bg-[radial-gradient(ellipse_at_top,rgba(184,255,112,0.16),transparent_70%)]" />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <p className="pm-kicker text-[var(--accent-cyan)]">Settlement console</p>
                    <h2 className="pm-display mt-3 text-2xl tracking-[-0.04em] sm:text-3xl">
                      One payment. Four proofs.
                    </h2>
                  </div>
                  <span className="flex items-center gap-2 rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/10 px-3 py-1.5 text-[11px] font-semibold text-[var(--accent)]">
                    <span className="size-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" />
                    Testnet
                  </span>
                </div>

                <div className="relative mt-8 space-y-3">
                  {proofPath.map(([step, title, detail], index) => (
                    <div
                      className="group relative grid grid-cols-[2.4rem_1fr_auto] items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3 py-3.5 transition duration-300 hover:border-[var(--accent)]/25 hover:bg-white/[0.055]"
                      key={step}
                    >
                      <span className="pm-data grid size-9 place-items-center rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/8 text-xs font-semibold text-[var(--accent)]">
                        {step}
                      </span>
                      <span>
                        <span className="block text-sm font-semibold tracking-[-0.02em]">
                          {title}
                        </span>
                        <span className="mt-0.5 block text-xs leading-5 text-[var(--muted)]">
                          {detail}
                        </span>
                      </span>
                      <span
                        className={`size-2 rounded-full ${
                          index === 3
                            ? 'bg-[var(--accent)] shadow-[0_0_14px_var(--accent)]'
                            : 'bg-[var(--accent-blue)]/70'
                        }`}
                      />
                    </div>
                  ))}
                </div>
                <TestnetNotice className="relative mt-5 rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-xs leading-5 text-[var(--muted)]" />
              </div>
            </div>
          </div>
        </section>

        <section className="pm-scroll-reveal grid gap-4 pb-8 md:grid-cols-3">
          <SignalCard
            accent="lime"
            detail="No browser return, callback, or internal row can mark a payment complete."
            label="Evidence, not optimism"
            number="01"
          />
          <SignalCard
            accent="blue"
            detail="Quotes, payment instructions, and recipient splits remain immutable once published."
            label="Committed financial terms"
            number="02"
          />
          <SignalCard
            accent="cyan"
            detail="Links, POS, requests, API, and WooCommerce share the same settlement model."
            label="One canonical checkout"
            number="03"
          />
        </section>

        <section className="pm-scroll-reveal mt-12 grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
          <div>
            <p className="pm-kicker">Merchant visibility</p>
            <h2 className="pm-display mt-5 max-w-md text-4xl leading-[0.98] sm:text-5xl">
              A dashboard that speaks in evidence.
            </h2>
            <p className="mt-5 max-w-lg leading-7 text-[var(--muted-strong)]">
              Follow an understandable path from intent to finality. Keep raw chain detail close
              when it matters, without making it the only way to understand your business.
            </p>
            <a
              className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)] transition hover:gap-3"
              href="/explorer"
            >
              Explore verified settlements <span aria-hidden="true">→</span>
            </a>
          </div>
          <div className="pm-panel rounded-[2rem] p-4 sm:p-5">
            <div className="rounded-[1.45rem] border border-white/[0.08] bg-[linear-gradient(145deg,#101a27,#0a1018)] p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
                    Settlement monitor
                  </p>
                  <p className="pm-display mt-1 text-xl tracking-[-0.035em]">
                    Evidence-backed activity
                  </p>
                </div>
                <span className="rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/8 px-3 py-1.5 text-xs font-semibold text-[var(--accent)]">
                  Ready to verify
                </span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  ['Quote', 'Committed', 'var(--accent-blue)'],
                  ['XRPL', 'Validated', 'var(--accent-cyan)'],
                  ['Receipt', 'Event decoded', 'var(--accent)'],
                ].map(([label, state, color]) => (
                  <div className="pm-card rounded-2xl p-4" key={label}>
                    <span className="size-2 rounded-full" style={{ background: color }} />
                    <p className="mt-4 text-xs text-[var(--muted)]">{label}</p>
                    <p className="mt-1 text-sm font-semibold">{state}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                <div className="flex items-center justify-between gap-4 text-xs text-[var(--muted)]">
                  <span className="pm-data">PAYMENT_SETTLED</span>
                  <span className="text-[var(--accent)]">Final authority</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                  <div className="h-full w-[78%] rounded-full bg-[linear-gradient(90deg,var(--accent-blue),var(--accent-cyan),var(--accent))]" />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function MorphMark() {
  return (
    <span className="relative grid size-9 place-items-center overflow-hidden rounded-xl border border-[var(--accent)]/35 bg-[linear-gradient(135deg,rgba(184,255,112,0.24),rgba(103,232,249,0.12))] shadow-[0_0_24px_rgba(184,255,112,0.16)]">
      <span className="absolute size-4 rotate-45 rounded-[4px] border border-[var(--accent)]/75" />
      <span className="relative text-xs font-black text-[var(--accent)]">P</span>
    </span>
  );
}

function SignalCard({
  accent: tone,
  detail,
  label,
  number,
}: {
  accent: 'blue' | 'cyan' | 'lime';
  detail: string;
  label: string;
  number: string;
}) {
  const accent = {
    blue: { color: 'var(--accent-blue)', textClass: 'text-[var(--accent-blue)]' },
    cyan: { color: 'var(--accent-cyan)', textClass: 'text-[var(--accent-cyan)]' },
    lime: { color: 'var(--accent)', textClass: 'text-[var(--accent)]' },
  }[tone];
  return (
    <article className="pm-card rounded-3xl p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <span className={`pm-data text-xs font-bold ${accent.textClass}`}>{number}</span>
        <span className="size-2 rounded-full" style={{ background: accent.color }} />
      </div>
      <h3 className="pm-display mt-8 text-xl tracking-[-0.035em]">{label}</h3>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{detail}</p>
    </article>
  );
}
